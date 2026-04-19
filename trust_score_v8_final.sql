-- ================================================================
-- TRUST SCORE V8.1 — Perfecting the Algorithm & Constraints
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Schema Updates
-- ────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ALTER COLUMN trust_score TYPE NUMERIC USING trust_score::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_before TYPE NUMERIC USING score_before::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_after TYPE NUMERIC USING score_after::NUMERIC;

ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS early_bonus_awarded BOOLEAN DEFAULT false;
ALTER TABLE public.trust_score_logs ADD COLUMN IF NOT EXISTS payment_id UUID UNIQUE REFERENCES public.payments(id);
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS trust_points_awarded NUMERIC DEFAULT 0;

-- FIX: Update constraint to use stable event types
-- Allowing ALL event types safely and securely.
ALTER TABLE public.trust_score_logs DROP CONSTRAINT IF EXISTS trust_score_logs_event_type_check;
ALTER TABLE public.trust_score_logs ADD CONSTRAINT trust_score_logs_event_type_check 
CHECK (event_type IN (
  'installment_payment',
  'full_payment',
  'partial_payment',
  'early_payment',
  'late_payment',
  'missed_payment',
  'extra_payment'
));

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
    SELECT id INTO v_borrower_id
    FROM public.profiles
    WHERE lower(email) = lower(v_loan.borrower_email)
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
        v_event_type := CASE WHEN v_days_diff >= 2 THEN 'early_payment' ELSE 'installment_payment' END;
      ELSIF v_days_diff >= -7 THEN
        v_delta := GREATEST(-1.0, LEAST(v_delta, v_remaining) - 1.0);
        v_event_type := 'late_payment';
      ELSIF v_days_diff >= -30 THEN
        v_delta := GREATEST(-3.0, LEAST(v_delta, v_remaining) - 3.0);
        v_event_type := 'late_payment';
      ELSE
        v_delta := GREATEST(-5.0, LEAST(v_delta, v_remaining) - 5.0);
        v_event_type := 'missed_payment';
      END IF;

      UPDATE public.installments
      SET status = 'paid',
          paid_on = NEW.date,
          payment_id = NEW.id,
          score_delta = v_delta
      WHERE id = NEW.installment_id;
    ELSE
      v_delta := LEAST(v_delta, v_remaining);
      v_event_type := 'extra_payment';
    END IF;

  ELSE
    v_due_date := v_loan.due_date;

    IF v_due_date IS NOT NULL THEN
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff < -30 THEN
        v_delta := GREATEST(-5.0, LEAST(v_delta, v_remaining) - 5.0);
        v_event_type := 'missed_payment';
      ELSIF v_days_diff < -7 THEN
        v_delta := GREATEST(-3.0, LEAST(v_delta, v_remaining) - 3.0);
        v_event_type := 'late_payment';
      ELSIF v_days_diff < 0 THEN
        v_delta := GREATEST(-1.0, LEAST(v_delta, v_remaining) - 1.0);
        v_event_type := 'late_payment';
      ELSIF v_total_after >= v_loan.amount AND v_days_diff >= 2 AND NOT COALESCE(v_loan.early_bonus_awarded, false) THEN
        v_delta := LEAST(v_delta, v_remaining);
        v_early_bonus := LEAST(2.0, GREATEST(0.0, v_remaining - v_delta));
        v_event_type := 'early_payment';
      ELSIF v_total_after >= v_loan.amount THEN
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := 'full_payment';
      ELSE
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := 'partial_payment';
      END IF;
    ELSE
      v_delta := LEAST(v_delta, v_remaining);
      IF v_total_after >= v_loan.amount THEN
        v_event_type := 'full_payment';
      ELSE
        v_event_type := 'partial_payment';
      END IF;
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- SAFE EVENT TYPE VALIDATION (Fallback to prevent silent failures)
  -- ══════════════════════════════════════════════════════════════
  IF v_event_type NOT IN ('installment_payment', 'full_payment', 'partial_payment', 'early_payment', 'late_payment', 'missed_payment', 'extra_payment') THEN
    RAISE NOTICE 'Invalid event_type %, falling back to partial_payment', v_event_type;
    v_event_type := 'partial_payment';
  END IF;

  v_score_after := v_score_before + v_delta + v_early_bonus;
  v_score_after := LEAST(GREATEST(v_score_after, 0.0), 100.0);

  -- ══════════════════════════════════════════════════════════════
  -- STEP F: Log Transaction (idempotency wrapper & explicit rollback)
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
        RETURN NEW;
      WHEN OTHERS THEN
        -- EXPLICIT ROLLBACK ON REAL ERRORS (prevents silent loss of sync)
        RAISE EXCEPTION 'Explicit transaction rollback due to log failure. Error: %', SQLERRM;
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
      early_bonus_awarded = v_loan.early_bonus_awarded OR (v_early_bonus > 0),
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
