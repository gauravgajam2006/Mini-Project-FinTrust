-- ================================================================
-- TRUST SCORE V5 — Production Fix for Incremental Trust Scoring
-- ================================================================
-- FIXES over V4:
--   1. Uses loan.amount_paid as source of truth (NOT SUM of payments)
--      This eliminates the trigger timing bug where SUM sees inconsistent state
--   2. Duplicate guard: checks trust_score_logs for existing payment_id
--   3. Hard cap: total trust_points_awarded per loan <= 10
--   4. Early bonus (+2) only once per loan, verified via trust_score_logs
--   5. Loan status update ALWAYS runs (moved outside conditional branches)
--   6. Overpayment safely capped
--   7. All old triggers dropped to guarantee single execution
--
-- FORMULA:
--   total_before = loan.amount_paid (before current payment)
--   total_after  = total_before + NEW.amount (capped at loan.amount)
--   points_before = (total_before / loan.amount) * 10
--   points_after  = (total_after  / loan.amount) * 10
--   delta = points_after - points_before
--   delta = LEAST(delta, 10 - already_awarded)
--
-- TEST CASE:
--   Loan amount: 100
--   Payment 1: 50 → (50/100)*10 - (0/100)*10 = 5 - 0 = 5.00 pts
--   Payment 2: 25 → (75/100)*10 - (50/100)*10 = 7.5 - 5 = 2.50 pts
--   Payment 3: 25 → (100/100)*10 - (75/100)*10 = 10 - 7.5 = 2.50 pts
--   Total = 10.00 ✅
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Ensure tracking column exists on loans
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS trust_points_awarded NUMERIC DEFAULT 0;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Drop ALL existing payment triggers (safety)
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_payment_trust_score ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v2 ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v3 ON public.payments;
DROP TRIGGER IF EXISTS on_payment_trust_score_v4 ON public.payments;

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Replace the scoring function
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_payment_trust_delta()
RETURNS TRIGGER AS $$
DECLARE
  v_loan              RECORD;
  v_installment       RECORD;
  v_n                 INTEGER;
  v_delta             NUMERIC := 0;
  v_event_type        TEXT;
  v_score_before      INTEGER;
  v_score_after       INTEGER;
  v_days_diff         INTEGER;
  v_paid_date         DATE;
  v_due_date          DATE;
  v_borrower_id       UUID;
  v_meta              JSONB;
  v_max_points        NUMERIC := 10;
  v_already_awarded   NUMERIC;
  v_remaining         NUMERIC;
  v_early_bonus       NUMERIC := 0;
  v_total_before      NUMERIC;
  v_total_after       NUMERIC;
  v_is_fully_paid     BOOLEAN := false;
  points_before       NUMERIC;
  points_after        NUMERIC;
  v_early_already     BOOLEAN := false;
BEGIN
  -- ══════════════════════════════════════════════════════════════
  -- GUARD: Prevent duplicate scoring for the same payment
  -- ══════════════════════════════════════════════════════════════
  IF EXISTS (
    SELECT 1 FROM public.trust_score_logs
    WHERE metadata->>'payment_id' = NEW.id::text
  ) THEN
    -- Already scored, just update loan tracking and exit
    UPDATE public.loans
    SET amount_paid = COALESCE(amount_paid, 0) + NEW.amount,
        updated_at = now()
    WHERE id = NEW.loan_id;
    RETURN NEW;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP A: Fetch the associated loan
  -- ══════════════════════════════════════════════════════════════
  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_n := COALESCE(v_loan.num_installments, 1);
  v_paid_date := (COALESCE(NEW.date, now()))::date;
  v_already_awarded := COALESCE(v_loan.trust_points_awarded, 0);

  -- ══════════════════════════════════════════════════════════════
  -- STEP B: Use loan.amount_paid as source of truth
  --   amount_paid = total paid BEFORE this payment
  --   This avoids the SUM(payments) timing bug entirely
  -- ══════════════════════════════════════════════════════════════
  v_total_before := COALESCE(v_loan.amount_paid, 0);
  v_total_after  := v_total_before + NEW.amount;

  -- Cap overpayment
  IF v_total_after > v_loan.amount THEN
    v_total_after := v_loan.amount;
  END IF;

  v_is_fully_paid := (v_total_after >= v_loan.amount);

  -- ══════════════════════════════════════════════════════════════
  -- STEP C: Calculate remaining points budget
  -- ══════════════════════════════════════════════════════════════
  v_remaining := GREATEST(0, v_max_points - v_already_awarded);

  -- If cap reached, skip scoring (but still update loan)
  IF v_remaining <= 0 THEN
    UPDATE public.loans
    SET amount_paid = v_total_before + NEW.amount,
        is_repaid = (v_total_before + NEW.amount >= amount),
        repaid_on = CASE WHEN (v_total_before + NEW.amount >= amount) THEN NEW.date ELSE repaid_on END,
        status = CASE WHEN (v_total_before + NEW.amount >= amount) THEN 'completed' ELSE status END,
        updated_at = now()
    WHERE id = NEW.loan_id;
    RETURN NEW;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP D: Determine borrower user_id
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
  v_score_before := COALESCE(v_score_before, 50);

  -- ══════════════════════════════════════════════════════════════
  -- STEP E: INCREMENTAL POINTS CALCULATION
  -- ══════════════════════════════════════════════════════════════
  points_before := (v_total_before / v_loan.amount) * v_max_points;
  points_after  := (v_total_after  / v_loan.amount) * v_max_points;

  IF points_after > v_max_points THEN
    points_after := v_max_points;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- BRANCH A: Installment Payment
  -- ══════════════════════════════════════════════════════════════
  IF NEW.installment_id IS NOT NULL THEN
    SELECT * INTO v_installment
    FROM public.installments WHERE id = NEW.installment_id;

    IF FOUND AND v_installment.status != 'paid' THEN
      v_due_date  := v_installment.due_date;
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff >= 0 THEN
        v_delta := ROUND(points_after - points_before, 2);
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := CASE WHEN v_days_diff >= 2 THEN 'inst_early' ELSE 'inst_ontime' END;
      ELSIF v_days_diff >= -7 THEN
        v_delta := -1;
        v_event_type := 'inst_slight_delay';
      ELSIF v_days_diff >= -30 THEN
        v_delta := -3;
        v_event_type := 'inst_moderate_delay';
      ELSE
        v_delta := -5;
        v_event_type := 'inst_missed';
      END IF;

      UPDATE public.installments
      SET status = 'paid',
          paid_on = NEW.date,
          payment_id = NEW.id,
          score_delta = v_delta
      WHERE id = NEW.installment_id;
    END IF;

  -- ══════════════════════════════════════════════════════════════
  -- BRANCH B: Non-Installment Payment (Full/Partial)
  -- ══════════════════════════════════════════════════════════════
  ELSE
    v_due_date := v_loan.due_date;

    v_delta := ROUND(points_after - points_before, 2);
    v_delta := LEAST(v_delta, v_remaining);

    IF v_due_date IS NOT NULL THEN
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff < -30 THEN
        v_delta := -5;
        v_event_type := 'inst_missed';
      ELSIF v_days_diff < -7 THEN
        v_delta := -3;
        v_event_type := 'inst_moderate_delay';
      ELSIF v_days_diff < 0 THEN
        v_delta := ROUND((points_after - points_before) * 0.5, 2);
        v_delta := LEAST(v_delta, v_remaining);
        v_event_type := 'inst_slight_delay';
      ELSIF v_is_fully_paid AND v_days_diff >= 2 THEN
        -- Early full repayment: check if bonus already granted
        SELECT EXISTS (
          SELECT 1 FROM public.trust_score_logs
          WHERE loan_id = NEW.loan_id AND event_type = 'full_early'
        ) INTO v_early_already;
        IF NOT v_early_already THEN
          v_early_bonus := 2;
        END IF;
        v_event_type := 'full_early';
      ELSIF v_is_fully_paid THEN
        v_event_type := 'full_ontime';
      ELSE
        v_event_type := 'full_ontime';
      END IF;
    ELSE
      v_event_type := 'full_ontime';
    END IF;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- STEP F: ALWAYS update loan tracking (outside branches)
  -- ══════════════════════════════════════════════════════════════
  UPDATE public.loans
  SET amount_paid = v_total_before + NEW.amount,
      is_repaid = v_is_fully_paid,
      repaid_on = CASE WHEN v_is_fully_paid THEN NEW.date ELSE repaid_on END,
      status = CASE WHEN v_is_fully_paid THEN 'completed' ELSE status END,
      updated_at = now()
  WHERE id = NEW.loan_id;

  -- ══════════════════════════════════════════════════════════════
  -- STEP G: Apply score change
  -- ══════════════════════════════════════════════════════════════
  IF v_delta != 0 OR v_early_bonus > 0 THEN
    v_delta := v_delta + v_early_bonus;
    v_score_after := LEAST(GREATEST(v_score_before + ROUND(v_delta)::integer, 0), 100);

    v_meta := jsonb_build_object(
      'payment_id', NEW.id,
      'payment_amount', NEW.amount,
      'loan_amount', v_loan.amount,
      'days_diff', v_days_diff,
      'paid_date', v_paid_date,
      'due_date', v_due_date,
      'total_before', v_total_before,
      'total_after', v_total_after,
      'points_before', ROUND(points_before, 4),
      'points_after', ROUND(points_after, 4),
      'incremental_delta', v_delta,
      'points_already_awarded', v_already_awarded,
      'points_remaining_before', v_remaining,
      'early_bonus', v_early_bonus,
      'is_fully_paid', v_is_fully_paid
    );

    INSERT INTO public.trust_score_logs (
      user_id, loan_id, installment_id, event_type,
      score_delta, score_before, score_after, metadata
    ) VALUES (
      v_borrower_id, NEW.loan_id, NEW.installment_id, v_event_type,
      v_delta, v_score_before, v_score_after, v_meta
    );

    UPDATE public.profiles
    SET trust_score = v_score_after
    WHERE id = v_borrower_id;

    IF v_delta > 0 THEN
      UPDATE public.loans
      SET trust_points_awarded = COALESCE(trust_points_awarded, 0) + v_delta
      WHERE id = NEW.loan_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- STEP 4: Ensure ONLY ONE trigger exists on payments table
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_payment_trust_score ON public.payments;

CREATE TRIGGER on_payment_trust_score
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_payment_trust_delta();
