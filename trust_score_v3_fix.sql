-- ================================================================
-- TRUST SCORE V3 FIX — Proportional Capped Trust Scoring
-- ================================================================
-- FIXES:
--   1. Points are PROPORTIONAL: (payment_amount / loan_amount) * 10
--   2. Total trust points per loan CAPPED at 10 (+ up to 2 early bonus)
--   3. Uses trust_points_awarded on loans for per-loan tracking
--   4. Prevents duplicate/excess rewards on partial payments
--   5. Late payments get penalties, not rewards
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Add tracking column to loans
-- ────────────────────────────────────────────────────────────────
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS trust_points_awarded NUMERIC DEFAULT 0;

-- Backfill: set trust_points_awarded for loans that already have logs
UPDATE public.loans l
SET trust_points_awarded = COALESCE(
  (SELECT SUM(tsl.score_delta)
   FROM public.trust_score_logs tsl
   WHERE tsl.loan_id = l.id
     AND tsl.score_delta > 0),
  0
)
WHERE EXISTS (
  SELECT 1 FROM public.trust_score_logs tsl
  WHERE tsl.loan_id = l.id AND tsl.score_delta > 0
);

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Replace the scoring function
-- ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.calculate_payment_trust_delta()
RETURNS TRIGGER AS $$
DECLARE
  v_loan           RECORD;
  v_installment    RECORD;
  v_n              INTEGER;
  v_delta          NUMERIC := 0;
  v_event_type     TEXT;
  v_score_before   INTEGER;
  v_score_after    INTEGER;
  v_days_diff      INTEGER;
  v_paid_date      DATE;
  v_due_date       DATE;
  v_borrower_id    UUID;
  v_meta           JSONB;
  v_max_points     NUMERIC := 10;   -- Max base points per loan
  v_already_awarded NUMERIC;        -- Points already awarded for this loan
  v_remaining      NUMERIC;         -- Remaining points available
  v_proportional   NUMERIC;         -- Proportional points for this payment
  v_early_bonus    NUMERIC := 0;    -- Bonus for early full repayment
  v_new_amount_paid NUMERIC;        -- New cumulative amount_paid after this payment
  v_is_fully_paid  BOOLEAN := false;
BEGIN
  -- ── Step 1: Fetch the associated loan ──
  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_n := COALESCE(v_loan.num_installments, 1);
  v_paid_date := (COALESCE(NEW.date, now()))::date;
  v_already_awarded := COALESCE(v_loan.trust_points_awarded, 0);

  -- ── Step 2: If this loan already has 10+ points awarded, skip scoring ──
  IF v_already_awarded >= v_max_points THEN
    -- Still update amount_paid, but no more trust points
    UPDATE public.loans
    SET amount_paid = COALESCE(amount_paid, 0) + NEW.amount
    WHERE id = NEW.loan_id;
    RETURN NEW;
  END IF;

  -- ── Step 3: Calculate remaining points budget ──
  v_remaining := v_max_points - v_already_awarded;

  -- ── Step 4: Determine the borrower's user_id ──
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

  -- ── Step 5: Calculate new cumulative amount_paid ──
  v_new_amount_paid := COALESCE(v_loan.amount_paid, 0) + NEW.amount;
  v_is_fully_paid := (v_new_amount_paid >= v_loan.amount);

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
        -- On-time or early: proportional points
        v_proportional := ROUND((NEW.amount / v_loan.amount) * v_max_points, 2);
        -- Cap to remaining budget
        v_delta := LEAST(v_proportional, v_remaining);
        
        IF v_days_diff >= 2 THEN
          v_event_type := 'inst_early';
        ELSE
          v_event_type := 'inst_ontime';
        END IF;
      ELSIF v_days_diff >= -7 THEN
        -- Slight delay (1-7 days late): penalty
        v_delta := -1;
        v_event_type := 'inst_slight_delay';
      ELSIF v_days_diff >= -30 THEN
        -- Moderate delay (8-30 days late)
        v_delta := -3;
        v_event_type := 'inst_moderate_delay';
      ELSE
        -- Missed (>30 days late)
        v_delta := -5;
        v_event_type := 'inst_missed';
      END IF;

      -- Mark installment as paid
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

    -- Calculate proportional points for this specific payment
    v_proportional := ROUND((NEW.amount / v_loan.amount) * v_max_points, 2);
    -- Cap to remaining budget
    v_delta := LEAST(v_proportional, v_remaining);

    IF v_due_date IS NOT NULL THEN
      v_days_diff := v_due_date - v_paid_date;

      IF v_days_diff < -30 THEN
        -- Very late payment: penalty instead of reward
        v_delta := -5;
        v_event_type := 'inst_missed';
      ELSIF v_days_diff < -7 THEN
        -- Moderately late: penalty
        v_delta := -3;
        v_event_type := 'inst_moderate_delay';
      ELSIF v_days_diff < 0 THEN
        -- Slightly late: halved reward
        v_delta := LEAST(v_proportional * 0.5, v_remaining);
        v_event_type := 'inst_slight_delay';
      ELSIF v_is_fully_paid AND v_days_diff >= 2 THEN
        -- Fully paid early: base points + early bonus (+2)
        v_early_bonus := 2;
        v_event_type := 'full_early';
      ELSIF v_is_fully_paid THEN
        v_event_type := 'full_ontime';
      ELSE
        -- Partial on-time payment
        v_event_type := 'full_ontime';
      END IF;
    ELSE
      -- No due_date: treat as on-time
      IF v_is_fully_paid THEN
        v_event_type := 'full_ontime';
      ELSE
        v_event_type := 'full_ontime';
      END IF;
    END IF;

    -- Update loan tracking
    UPDATE public.loans
    SET amount_paid = v_new_amount_paid,
        is_repaid = v_is_fully_paid,
        repaid_on = CASE WHEN v_is_fully_paid THEN NEW.date ELSE repaid_on END,
        status = CASE WHEN v_is_fully_paid THEN 'completed' ELSE status END
    WHERE id = NEW.loan_id;
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- APPLY SCORE
  -- ══════════════════════════════════════════════════════════════
  IF v_delta != 0 OR v_early_bonus > 0 THEN
    -- Final delta includes early bonus (only for full_early)
    v_delta := v_delta + v_early_bonus;

    v_score_after := LEAST(GREATEST(v_score_before + ROUND(v_delta)::integer, 0), 100);

    -- Build rich metadata for auditability
    v_meta := jsonb_build_object(
      'payment_id', NEW.id,
      'payment_amount', NEW.amount,
      'loan_amount', v_loan.amount,
      'days_diff', v_days_diff,
      'paid_date', v_paid_date,
      'due_date', v_due_date,
      'num_installments', v_n,
      'proportional_points', v_proportional,
      'points_already_awarded', v_already_awarded,
      'points_remaining_before', v_remaining,
      'early_bonus', v_early_bonus,
      'is_fully_paid', v_is_fully_paid
    );

    -- Log the trust score change
    INSERT INTO public.trust_score_logs (
      user_id, loan_id, installment_id, event_type,
      score_delta, score_before, score_after, metadata
    ) VALUES (
      v_borrower_id, NEW.loan_id, NEW.installment_id, v_event_type,
      v_delta, v_score_before, v_score_after, v_meta
    );

    -- Update the user's trust score
    UPDATE public.profiles
    SET trust_score = v_score_after
    WHERE id = v_borrower_id;

    -- Track awarded points on the loan (only positive deltas count toward cap)
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
-- STEP 3: Ensure trigger is correctly attached
-- ────────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS on_payment_trust_score ON public.payments;
CREATE TRIGGER on_payment_trust_score
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_payment_trust_delta();
