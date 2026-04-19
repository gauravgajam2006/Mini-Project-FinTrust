-- ================================================================
-- TRUST SCORE V9 — Production Grade Resiliency & Simplification
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Schema Updates
-- ────────────────────────────────────────────────────────────────

-- Drop view so we can alter column types
DROP VIEW IF EXISTS public.trust_score_summary;

ALTER TABLE public.profiles ALTER COLUMN trust_score TYPE NUMERIC USING trust_score::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_before TYPE NUMERIC USING score_before::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_after TYPE NUMERIC USING score_after::NUMERIC;

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS early_bonus_awarded BOOLEAN DEFAULT false;
ALTER TABLE public.trust_score_logs ADD COLUMN IF NOT EXISTS payment_id UUID UNIQUE REFERENCES public.payments(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS trust_points_awarded NUMERIC DEFAULT 0;

-- 1. DROP THE OLD CONSTRAINT FIRST so we can freely map the legacy keys
ALTER TABLE public.trust_score_logs DROP CONSTRAINT IF EXISTS trust_score_logs_event_type_check;

-- 2. Migrate existing legacy event types to match the new strict constraint system
UPDATE public.trust_score_logs
SET event_type = CASE
  WHEN event_type IN ('full_ontime', 'full_payment', 'inst_ontime') THEN 'payment_success'
  WHEN event_type IN ('full_early', 'early_payment', 'extra_payment', 'inst_early') THEN 'payment_early'
  WHEN event_type IN ('inst_moderate_delay', 'late_payment', 'inst_slight_delay', 'full_slight_delay', 'full_moderate_delay', 'partial_late') THEN 'payment_late'
  WHEN event_type IN ('full_default', 'missed_payment', 'inst_missed', 'full_missed') THEN 'payment_missed'
  ELSE 'payment_partial'
END;

-- 3. APPLY the V9 Strictly enforced standard event types to prevent schema issues
ALTER TABLE public.trust_score_logs ADD CONSTRAINT trust_score_logs_event_type_check 
CHECK (event_type IN (
  'payment_success',
  'payment_partial',
  'payment_early',
  'payment_late',
  'payment_missed'
));

-- Recreate the view now that columns have been upgraded to NUMERIC
CREATE OR REPLACE VIEW public.trust_score_summary AS
 SELECT p.id AS user_id,
    p.name,
    p.email,
    p.trust_score,
        CASE
            WHEN (p.trust_score >= (80)::numeric) THEN 'Excellent'::text
            WHEN (p.trust_score >= (60)::numeric) THEN 'Good'::text
            WHEN (p.trust_score >= (40)::numeric) THEN 'Fair'::text
            WHEN (p.trust_score >= (20)::numeric) THEN 'Poor'::text
            ELSE 'Critical'::text
        END AS trust_tier,
    count(tsl.id) AS total_score_events,
    sum(
        CASE
            WHEN (tsl.score_delta > (0)::numeric) THEN tsl.score_delta
            ELSE (0)::numeric
        END) AS total_positive,
    sum(
        CASE
            WHEN (tsl.score_delta < (0)::numeric) THEN tsl.score_delta
            ELSE (0)::numeric
        END) AS total_negative,
    max(tsl.created_at) AS last_score_change
   FROM (public.profiles p
     LEFT JOIN public.trust_score_logs tsl ON ((tsl.user_id = p.id)))
  GROUP BY p.id, p.name, p.email, p.trust_score;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Replace Trigger Function
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_payment_trust_delta()
RETURNS TRIGGER AS $$
DECLARE
  v_loan              RECORD;
  v_installment       RECORD;
  v_delta             NUMERIC := 0;
  v_event_type        TEXT;
  v_score_before      NUMERIC;
  v_score_after       NUMERIC;
  v_borrower_id       UUID;
  v_max_points        NUMERIC := 10.0;
  v_early_bonus       NUMERIC := 0;
  v_total_before      NUMERIC;
  v_total_after       NUMERIC;
  points_before       NUMERIC := 0;
  points_after        NUMERIC := 0;
  v_paid_date         DATE;
  v_due_date          DATE;
  v_days_diff         INTEGER;
  v_meta              JSONB;
  v_already_awarded   NUMERIC;
  v_remaining         NUMERIC;
  v_borrower_email    TEXT;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- GUARD 1: Prevent duplicate scoring via constraint
  -- Any duplicate payment_id inserted will throw unique_violation and be caught
  -- ══════════════════════════════════════════════════════════════

  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE NOTICE 'Loan % not found for payment %', NEW.loan_id, NEW.id;
    RETURN NEW;
  END IF;

  v_paid_date := (COALESCE(NEW.date, now()))::date;
  v_already_awarded := COALESCE(v_loan.trust_points_awarded, 0);
  v_remaining := GREATEST(0.0, v_max_points - v_already_awarded);

  -- ══════════════════════════════════════════════════════════════
  -- STEP B: Calculate Amounts safely (Cap to avoid overflow)
  -- ══════════════════════════════════════════════════════════════
  v_total_before := LEAST(COALESCE(v_loan.amount_paid, 0), v_loan.amount);
  v_total_after  := LEAST(v_total_before + NEW.amount, v_loan.amount);

  -- ══════════════════════════════════════════════════════════════
  -- STEP C: Determine borrower ID accurately
  -- ══════════════════════════════════════════════════════════════
  IF v_loan.type = 'borrowed' THEN
    v_borrower_id := v_loan.user_id;
  ELSE
    v_borrower_email := v_loan.borrower_email;
    SELECT id INTO v_borrower_id
    FROM public.profiles
    WHERE lower(email) = lower(v_borrower_email)
    LIMIT 1;
  END IF;

  IF v_borrower_id IS NULL THEN
    v_borrower_id := NEW.user_id;
  END IF;

  -- Get current trust score
  SELECT trust_score INTO v_score_before
  FROM public.profiles WHERE id = v_borrower_id;
  v_score_before := COALESCE(v_score_before, 50.0);

  -- ══════════════════════════════════════════════════════════════
  -- STEP D: Exact Proportional calculation (No rounding during calc)
  -- ══════════════════════════════════════════════════════════════
  IF COALESCE(v_loan.amount, 0) > 0 THEN
    points_before := (v_total_before / v_loan.amount) * v_max_points;
    points_after  := (v_total_after  / v_loan.amount) * v_max_points;
  ELSE
    points_before := 0;
    points_after  := 0;
  END IF;
  
  v_delta := points_after - points_before;

  -- ══════════════════════════════════════════════════════════════
  -- STEP E: Installment vs Non-Installment Processing (Timing Weights)
  -- ══════════════════════════════════════════════════════════════
  IF NEW.installment_id IS NOT NULL THEN
    SELECT * INTO v_installment FROM public.installments WHERE id = NEW.installment_id;

    IF FOUND AND v_installment.status != 'paid' THEN
      v_due_date  := v_installment.due_date;
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff >= 0 THEN
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := CASE WHEN v_days_diff >= 2 THEN 'payment_early' ELSE 'payment_partial' END;
      ELSIF v_days_diff >= -7 THEN
        v_delta := GREATEST(-1.0, LEAST(v_delta, v_remaining) - 1.0);
        v_event_type := 'payment_late';
      ELSIF v_days_diff >= -30 THEN
        v_delta := GREATEST(-3.0, LEAST(v_delta, v_remaining) - 3.0);
        v_event_type := 'payment_late';
      ELSE
        v_delta := GREATEST(-5.0, LEAST(v_delta, v_remaining) - 5.0);
        v_event_type := 'payment_missed';
      END IF;

      UPDATE public.installments
      SET status = 'paid',
          paid_on = NEW.date,
          payment_id = NEW.id,
          score_delta = v_delta
      WHERE id = NEW.installment_id;
    ELSE
      v_delta := LEAST(v_delta, v_remaining);
      v_event_type := 'payment_early'; -- Extrapolating extra installment payments to early
    END IF;

  ELSE
    v_due_date := v_loan.due_date;

    IF v_due_date IS NOT NULL THEN
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff < -30 THEN
        v_delta := GREATEST(-5.0, LEAST(v_delta, v_remaining) - 5.0);
        v_event_type := 'payment_missed';
      ELSIF v_days_diff < -7 THEN
        v_delta := GREATEST(-3.0, LEAST(v_delta, v_remaining) - 3.0);
        v_event_type := 'payment_late';
      ELSIF v_days_diff < 0 THEN
        v_delta := GREATEST(-1.0, LEAST(v_delta, v_remaining) - 1.0);
        v_event_type := 'payment_late';
      ELSIF v_total_after >= v_loan.amount AND v_days_diff >= 2 AND NOT COALESCE(v_loan.early_bonus_awarded, false) THEN
        v_delta := LEAST(v_delta, v_remaining);
        v_early_bonus := LEAST(2.0, GREATEST(0.0, v_remaining - v_delta));
        v_event_type := 'payment_early';
      ELSIF v_total_after >= v_loan.amount THEN
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := 'payment_success';
      ELSE
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := 'payment_partial';
      END IF;
    ELSE
      v_delta := LEAST(v_delta, v_remaining);
      IF v_total_after >= v_loan.amount THEN
        v_event_type := 'payment_success';
      ELSE
        v_event_type := 'payment_partial';
      END IF;
    END IF;
  END IF;

  -- Fallback to prevent silent failures
  IF v_event_type NOT IN ('payment_success', 'payment_partial', 'payment_early', 'payment_late', 'payment_missed') THEN
    RAISE NOTICE 'Invalid event_type %, falling back to payment_partial', v_event_type;
    v_event_type := 'payment_partial';
  END IF;

  v_score_after := v_score_before + v_delta + v_early_bonus;
  v_score_after := GREATEST(v_score_after, 0.0);

  -- ══════════════════════════════════════════════════════════════
  -- STEP F: Log Transaction (idempotency wrapper & NON-BLOCKING exception handler)
  -- ══════════════════════════════════════════════════════════════
  IF NEW.amount > 0 OR v_delta != 0 OR v_early_bonus > 0 THEN
    v_meta := jsonb_build_object(
      'payment_id', NEW.id,
      'installment_id', NEW.installment_id,
      'payment_amount', NEW.amount,
      'loan_amount', v_loan.amount,
      'days_diff', v_days_diff,
      'total_before', v_total_before,
      'total_after', v_total_after,
      'points_before', points_before,
      'points_after', points_after,
      'incremental_delta', v_delta,
      'early_bonus', v_early_bonus,
      'is_fully_paid', v_total_after >= v_loan.amount,
      'points_already_awarded', v_already_awarded,
      'points_remaining', v_remaining
    );

    BEGIN
      INSERT INTO public.trust_score_logs (
        user_id, loan_id, payment_id, event_type,
        score_delta, score_before, score_after, metadata
      ) VALUES (
        v_borrower_id, NEW.loan_id, NEW.id, v_event_type,
        (v_delta + v_early_bonus), v_score_before, v_score_after, v_meta
      );
    EXCEPTION 
      WHEN unique_violation THEN
        RAISE NOTICE 'Idempotency caught: trust_score_logs already exists for payment %', NEW.id;
        -- Continue processing the primary loan update anyway
      WHEN OTHERS THEN
        -- V9 PRINCIPLE: NEVER LET LOGGING BREAK PAYMENTS
        -- Swallow error safely to prevent transaction rollback
        RAISE WARNING 'Log insertion failed for payment %, skipping log to prevent transaction failure. Error: %', NEW.id, SQLERRM;
    END;

    -- Update the trust score correctly across columns and JSONB gamification
    UPDATE public.profiles
    SET trust_score = v_score_after,
        gamification = jsonb_set(COALESCE(gamification, '{}'::jsonb), '{trustScore}', to_jsonb(v_score_after))
    WHERE id = v_borrower_id;

    -- FIX: Accumulate net valid points (cap handled naturally by remaining)
    UPDATE public.loans
    SET trust_points_awarded = COALESCE(trust_points_awarded, 0) + GREATEST(0.0, v_delta) + v_early_bonus
    WHERE id = NEW.loan_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP G: Update Loan state defensively
  -- ══════════════════════════════════════════════════════════════
  UPDATE public.loans
  SET amount_paid = v_total_after,
      early_bonus_awarded = COALESCE(early_bonus_awarded, false) OR (v_early_bonus > 0),
      is_repaid = v_total_after >= COALESCE(amount, 0),
      repaid_on = CASE WHEN v_total_after >= COALESCE(amount, 0) THEN NEW.date ELSE repaid_on END,
      status = CASE 
                 WHEN v_total_after >= COALESCE(amount, 0) THEN 'completed'
                 WHEN status IN ('active', 'overdue') AND due_date IS NOT NULL AND due_date < CURRENT_DATE THEN 'overdue'
                 WHEN status IN ('active', 'overdue') THEN 'active'
                 ELSE status
               END,
      updated_at = now()
  WHERE id = NEW.loan_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Ensure ONLY ONE trigger exists
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_payment_trust_score ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v2 ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v3 ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v4 ON public.payments;

CREATE TRIGGER on_payment_trust_score
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_payment_trust_delta();
