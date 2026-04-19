-- ================================================================
-- TRUST SCORE V7 — Production Fix for Incremental Trust Scoring
-- ================================================================
-- FIXES:
--   1. Amount overflow: Ensured amount_paid never exceeds loan.amount
--   2. Rounding errors: No rounding during calculation, decimal precision maintained.
--   3. Duplicate scoring: payment_id UNIQUE constraint added to log table.
--   4. Concurrency bug: Row level locking added (SELECT ... FOR UPDATE).
--   5. Early bonus bug: Tracked separately via early_bonus_awarded.
--   6. Precision loss: Converted trust_score and score logs columns to NUMERIC.
--   7. Idempotency: Duplicate payment constraints integrated properly.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Schema Updates
-- ────────────────────────────────────────────────────────────────

-- Prevent precision loss by enforcing NUMERIC types
ALTER TABLE public.profiles ALTER COLUMN trust_score TYPE NUMERIC USING trust_score::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_before TYPE NUMERIC USING score_before::NUMERIC;
ALTER TABLE public.trust_score_logs ALTER COLUMN score_after TYPE NUMERIC USING score_after::NUMERIC;

-- Track early bonus separately
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS early_bonus_awarded BOOLEAN DEFAULT false;

-- Add UNIQUE constraint to prevent duplicate scoring per payment
ALTER TABLE public.trust_score_logs ADD COLUMN IF NOT EXISTS payment_id UUID UNIQUE REFERENCES public.payments(id);

-- Ensure trust_points_awarded column exists on loans
ALTER TABLE public.loans ADD COLUMN IF NOT EXISTS trust_points_awarded NUMERIC DEFAULT 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Replace Trigger Function
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.calculate_payment_trust_delta()
RETURNS TRIGGER AS $$
DECLARE
  v_loan              RECORD;
  v_delta             NUMERIC := 0;
  v_event_type        TEXT;
  v_score_before      NUMERIC;
  v_score_after       NUMERIC;
  v_borrower_id       UUID;
  v_max_points        NUMERIC := 10.0;
  v_early_bonus       NUMERIC := 0;
  v_total_before      NUMERIC;
  v_total_after       NUMERIC;
  points_before       NUMERIC;
  points_after        NUMERIC;
  v_paid_date         DATE;
  v_days_diff         INTEGER;
  v_meta              JSONB;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- GUARD 1: Prevent duplicate scoring via constraint
  -- Any duplicate payment_id inserted will throw unique_violation and be caught
  -- ══════════════════════════════════════════════════════════════

  -- ══════════════════════════════════════════════════════════════
  -- STEP A: Fetch the associated loan (WITH ROW LOCK)
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_paid_date := (COALESCE(NEW.date, now()))::date;

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
  points_before := (v_total_before / v_loan.amount) * v_max_points;
  points_after  := (v_total_after  / v_loan.amount) * v_max_points;
  v_delta := points_after - points_before;

  -- ══════════════════════════════════════════════════════════════
  -- STEP E: Early Bonus evaluation
  -- ══════════════════════════════════════════════════════════════
  v_event_type := 'payment_processed';

  IF v_loan.due_date IS NOT NULL THEN
    v_days_diff := v_loan.due_date - v_paid_date;
    IF v_total_after >= v_loan.amount AND v_days_diff >= 2 AND NOT v_loan.early_bonus_awarded THEN
       v_early_bonus := 2.0;
       v_event_type := 'full_early';
    ELSIF v_total_after >= v_loan.amount THEN
       v_event_type := CASE WHEN v_days_diff < 0 THEN 'full_late' ELSE 'full_ontime' END;
    END IF;
  ELSE
    IF v_total_after >= v_loan.amount THEN
      v_event_type := 'full_ontime';
    END IF;
  END IF;

  -- Apply score change
  v_score_after := v_score_before + v_delta + v_early_bonus;
  
  -- Clamp values
  v_score_after := LEAST(GREATEST(v_score_after, 0.0), 100.0);

  -- ══════════════════════════════════════════════════════════════
  -- STEP F: Log Transaction (idempotency wrapper)
  -- ══════════════════════════════════════════════════════════════
  IF v_delta != 0 OR v_early_bonus > 0 THEN
    v_meta := jsonb_build_object(
      'payment_id', NEW.id,
      'payment_amount', NEW.amount,
      'loan_amount', v_loan.amount,
      'days_diff', v_days_diff,
      'total_before', v_total_before,
      'total_after', v_total_after,
      'points_before', points_before,
      'points_after', points_after,
      'incremental_delta', v_delta,
      'early_bonus', v_early_bonus,
      'is_fully_paid', v_total_after >= v_loan.amount
    );

    BEGIN
      INSERT INTO public.trust_score_logs (
        user_id, loan_id, payment_id, event_type,
        score_delta, score_before, score_after, metadata
      ) VALUES (
        v_borrower_id, NEW.loan_id, NEW.id, v_event_type,
        (v_delta + v_early_bonus), v_score_before, v_score_after, v_meta
      );
    EXCEPTION WHEN unique_violation THEN
      -- Handle idempotency, already processed
      RETURN NEW;
    END;

    -- Update the trust score correctly across columns and JSONB gamification
    UPDATE public.profiles
    SET trust_score = v_score_after,
        gamification = jsonb_set(COALESCE(gamification, '{}'::jsonb), '{trustScore}', to_jsonb(v_score_after))
    WHERE id = v_borrower_id;

    UPDATE public.loans
    SET trust_points_awarded = COALESCE(trust_points_awarded, 0) + v_delta + v_early_bonus
    WHERE id = NEW.loan_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP G: Update Loan state
  -- ══════════════════════════════════════════════════════════════
  UPDATE public.loans
  SET amount_paid = v_total_after,
      early_bonus_awarded = v_loan.early_bonus_awarded OR (v_early_bonus > 0),
      is_repaid = v_total_after >= amount,
      repaid_on = CASE WHEN v_total_after >= amount THEN NEW.date ELSE repaid_on END,
      status = CASE WHEN v_total_after >= amount THEN 'completed' ELSE status END,
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
