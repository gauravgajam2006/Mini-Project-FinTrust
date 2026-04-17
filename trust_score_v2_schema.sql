-- ================================================================
-- TRUST SCORE V2 — Advanced Payment-Driven Trust Scoring System
-- ================================================================
-- Replaces the old pillar-based calculate_trust_score with an
-- incremental, event-driven system that handles both full-loan
-- repayments and per-installment scoring in real-time.
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- PHASE 1: SCHEMA CHANGES
-- ────────────────────────────────────────────────────────────────

-- 1a. Add num_installments to loans
ALTER TABLE public.loans
  ADD COLUMN IF NOT EXISTS num_installments INTEGER DEFAULT 1;

-- 1b. Create installments table
CREATE TABLE IF NOT EXISTS public.installments (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  loan_id         UUID REFERENCES public.loans(id) ON DELETE CASCADE NOT NULL,
  installment_no  INTEGER NOT NULL,
  amount          NUMERIC NOT NULL,
  due_date        DATE NOT NULL,
  status          TEXT DEFAULT 'pending'
                    CHECK (status IN ('pending', 'paid', 'overdue', 'missed')),
  paid_on         TIMESTAMPTZ,
  payment_id      UUID,  -- will be set when payment is made
  score_delta     NUMERIC DEFAULT 0,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (loan_id, installment_no)
);

-- 1c. Add installment_id to payments
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS installment_id UUID;

-- 1d. Create trust_score_logs table
CREATE TABLE IF NOT EXISTS public.trust_score_logs (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id         UUID REFERENCES auth.users(id) NOT NULL,
  loan_id         UUID REFERENCES public.loans(id),
  installment_id  UUID,
  event_type      TEXT NOT NULL
                    CHECK (event_type IN (
                      'full_early', 'full_ontime', 'full_default',
                      'inst_early', 'inst_ontime',
                      'inst_slight_delay', 'inst_moderate_delay', 'inst_missed'
                    )),
  score_delta     NUMERIC NOT NULL,
  score_before    INTEGER NOT NULL,
  score_after     INTEGER NOT NULL,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ────────────────────────────────────────────────────────────────
-- PHASE 2: RLS POLICIES
-- ────────────────────────────────────────────────────────────────

-- 2a. Installments RLS
ALTER TABLE public.installments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view installments for their involved loans"
  ON public.installments FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = installments.loan_id
      AND (
        loans.user_id = auth.uid()
        OR lower(loans.borrower_email) = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
        OR lower(loans.lender_email) = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
      )
    )
  );

CREATE POLICY "Users can update installments for their involved loans"
  ON public.installments FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.loans
      WHERE loans.id = installments.loan_id
      AND (
        loans.user_id = auth.uid()
        OR lower(loans.borrower_email) = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
        OR lower(loans.lender_email) = lower((SELECT email FROM public.profiles WHERE id = auth.uid()))
      )
    )
  );

CREATE POLICY "System can insert installments"
  ON public.installments FOR INSERT
  WITH CHECK (true);

-- 2b. Trust Score Logs RLS
ALTER TABLE public.trust_score_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own trust score logs"
  ON public.trust_score_logs FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "System can insert trust score logs"
  ON public.trust_score_logs FOR INSERT
  WITH CHECK (true);

-- ────────────────────────────────────────────────────────────────
-- PHASE 3: DROP OLD TRUST SCORE SYSTEM
-- ────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS on_loan_changed ON public.loans;
DROP TRIGGER IF EXISTS on_activity_added ON public.activities;
DROP TRIGGER IF EXISTS on_profile_verified ON public.profiles;
DROP FUNCTION IF EXISTS public.trigger_update_trust_score();
DROP FUNCTION IF EXISTS public.calculate_trust_score(UUID);

-- ────────────────────────────────────────────────────────────────
-- PHASE 4: CORE FUNCTIONS
-- ────────────────────────────────────────────────────────────────

-- ============================================================
-- 4a. generate_installment_schedule()
-- Called after a loan is created with num_installments > 1.
-- Divides the loan amount evenly and distributes due dates.
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_installment_schedule()
RETURNS TRIGGER AS $$
DECLARE
  v_n             INTEGER;
  v_per_amount    NUMERIC;
  v_remainder     NUMERIC;
  v_interval      INTERVAL;
  v_base_date     DATE;
  i               INTEGER;
  v_due           DATE;
BEGIN
  v_n := COALESCE(NEW.num_installments, 1);

  -- Only generate for multi-installment loans
  IF v_n <= 1 THEN
    RETURN NEW;
  END IF;

  -- Calculate per-installment amount
  v_per_amount := TRUNC(NEW.amount / v_n, 2);
  v_remainder  := NEW.amount - (v_per_amount * v_n);

  -- Determine interval based on repayment_schedule
  CASE COALESCE(NEW.repayment_schedule, 'monthly')
    WHEN 'weekly'    THEN v_interval := INTERVAL '1 week';
    WHEN 'monthly'   THEN v_interval := INTERVAL '1 month';
    WHEN 'emi'       THEN v_interval := INTERVAL '1 month';
    WHEN 'quarterly' THEN v_interval := INTERVAL '3 months';
    ELSE                  v_interval := INTERVAL '1 month';
  END CASE;

  -- Start from loan creation date
  v_base_date := COALESCE(NEW.due_date, CURRENT_DATE + v_interval * v_n);

  -- Generate installments working backwards from due_date,
  -- or forwards from creation. Using forward approach:
  FOR i IN 1..v_n LOOP
    -- Due date for installment i
    v_due := (NEW.created_at::date + v_interval * i)::date;
    -- Make sure last installment doesn't exceed loan due_date
    IF NEW.due_date IS NOT NULL AND v_due > NEW.due_date THEN
      v_due := NEW.due_date;
    END IF;

    INSERT INTO public.installments (loan_id, installment_no, amount, due_date)
    VALUES (
      NEW.id,
      i,
      CASE WHEN i = v_n THEN v_per_amount + v_remainder ELSE v_per_amount END,
      v_due
    );
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4b. calculate_payment_trust_delta()
-- The main scoring engine. Called on every payment INSERT.
-- Determines if it's a full-loan or installment payment,
-- computes score delta, logs it, and updates the user's score.
-- ============================================================
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
BEGIN
  -- Fetch the associated loan
  SELECT * INTO v_loan FROM public.loans WHERE id = NEW.loan_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  v_n := COALESCE(v_loan.num_installments, 1);
  v_paid_date := (COALESCE(NEW.date, now()))::date;

  -- Determine the borrower's user_id
  -- The borrower is the one whose trust score changes
  IF v_loan.type = 'borrowed' THEN
    v_borrower_id := v_loan.user_id;
  ELSE
    -- For 'lent' type loans, the borrower is identified by email
    SELECT id INTO v_borrower_id
    FROM public.profiles
    WHERE lower(email) = lower(v_loan.borrower_email)
    LIMIT 1;
  END IF;

  -- If we can't identify the borrower, use the payment user_id
  IF v_borrower_id IS NULL THEN
    v_borrower_id := NEW.user_id;
  END IF;

  -- Get current trust score
  SELECT trust_score INTO v_score_before
  FROM public.profiles WHERE id = v_borrower_id;
  v_score_before := COALESCE(v_score_before, 50);

  -- ── BRANCH: Installment Payment ──
  IF NEW.installment_id IS NOT NULL THEN
    SELECT * INTO v_installment
    FROM public.installments WHERE id = NEW.installment_id;

    IF FOUND AND v_installment.status != 'paid' THEN
      v_due_date  := v_installment.due_date;
      v_days_diff := v_due_date - v_paid_date;  -- positive = early, negative = late

      IF v_days_diff >= 2 THEN
        -- Early payment: (10/N) + (2/N) = (12/N)
        v_delta := ROUND(12.0 / v_n, 2);
        v_event_type := 'inst_early';
      ELSIF v_days_diff >= 0 THEN
        -- On-time payment: (10/N)
        v_delta := ROUND(10.0 / v_n, 2);
        v_event_type := 'inst_ontime';
      ELSIF v_days_diff >= -7 THEN
        -- Slight delay (1-7 days late)
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

  -- ── BRANCH: Full Loan Repayment ──
  ELSE
    -- Check if this payment fully repays the loan
    IF (COALESCE(v_loan.amount_paid, 0) + NEW.amount) >= v_loan.amount THEN
      v_due_date  := v_loan.due_date;

      IF v_due_date IS NOT NULL THEN
        v_days_diff := v_due_date - v_paid_date;

        IF v_days_diff >= 2 THEN
          v_delta := 12;
          v_event_type := 'full_early';
        ELSE
          v_delta := 10;
          v_event_type := 'full_ontime';
        END IF;
      ELSE
        -- No due date set, treat as on-time
        v_delta := 10;
        v_event_type := 'full_ontime';
      END IF;

      -- Mark loan as repaid
      UPDATE public.loans
      SET is_repaid = true,
          repaid_on = NEW.date,
          status = 'completed',
          amount_paid = COALESCE(amount_paid, 0) + NEW.amount
      WHERE id = NEW.loan_id;
    ELSE
      -- Partial payment on a non-installment loan — just update amount_paid
      UPDATE public.loans
      SET amount_paid = COALESCE(amount_paid, 0) + NEW.amount
      WHERE id = NEW.loan_id;

      -- No trust score change for partial non-installment payments
      RETURN NEW;
    END IF;
  END IF;

  -- ── Apply Score ──
  IF v_delta != 0 THEN
    v_score_after := LEAST(GREATEST(v_score_before + ROUND(v_delta)::integer, 0), 100);

    -- Build metadata
    v_meta := jsonb_build_object(
      'payment_id', NEW.id,
      'payment_amount', NEW.amount,
      'days_diff', v_days_diff,
      'paid_date', v_paid_date,
      'due_date', v_due_date,
      'num_installments', v_n
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
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================
-- 4c. apply_default_penalty()
-- Called when a loan's status changes to 'overdue'.
-- Applies -25 for full loan default, or -5 per missed installment.
-- ============================================================
CREATE OR REPLACE FUNCTION public.apply_default_penalty()
RETURNS TRIGGER AS $$
DECLARE
  v_borrower_id    UUID;
  v_score_before   INTEGER;
  v_score_after    INTEGER;
  v_delta          NUMERIC;
  v_n              INTEGER;
  v_missed_count   INTEGER;
  v_inst           RECORD;
  v_profile        RECORD;
BEGIN
  -- Only fire when status changes TO 'overdue'
  IF NEW.status != 'overdue' OR OLD.status = 'overdue' THEN
    RETURN NEW;
  END IF;

  -- Determine borrower
  IF NEW.type = 'borrowed' THEN
    v_borrower_id := NEW.user_id;
  ELSE
    SELECT id INTO v_borrower_id
    FROM public.profiles
    WHERE lower(email) = lower(NEW.borrower_email)
    LIMIT 1;
  END IF;

  IF v_borrower_id IS NULL THEN
    v_borrower_id := NEW.user_id;
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_borrower_id;
  v_score_before := COALESCE(v_profile.trust_score, 50);

  v_n := COALESCE(NEW.num_installments, 1);

  IF v_n <= 1 THEN
    -- ── Full loan default: -25 ──
    v_delta := -25;
    v_score_after := LEAST(GREATEST(v_score_before + v_delta::integer, 0), 100);

    INSERT INTO public.trust_score_logs (
      user_id, loan_id, installment_id, event_type,
      score_delta, score_before, score_after, metadata
    ) VALUES (
      v_borrower_id, NEW.id, NULL, 'full_default',
      v_delta, v_score_before, v_score_after,
      jsonb_build_object('loan_amount', NEW.amount, 'due_date', NEW.due_date)
    );

    UPDATE public.profiles
    SET trust_score = v_score_after
    WHERE id = v_borrower_id;

  ELSE
    -- ── Installment loan: mark unpaid installments as missed, -5 each ──
    FOR v_inst IN
      SELECT * FROM public.installments
      WHERE loan_id = NEW.id AND status IN ('pending', 'overdue')
    LOOP
      v_delta := -5;

      -- Re-read score for cumulative updates
      SELECT trust_score INTO v_score_before
      FROM public.profiles WHERE id = v_borrower_id;
      v_score_before := COALESCE(v_score_before, 50);

      v_score_after := LEAST(GREATEST(v_score_before + v_delta::integer, 0), 100);

      -- Mark installment as missed
      UPDATE public.installments
      SET status = 'missed', score_delta = v_delta
      WHERE id = v_inst.id;

      -- Log
      INSERT INTO public.trust_score_logs (
        user_id, loan_id, installment_id, event_type,
        score_delta, score_before, score_after, metadata
      ) VALUES (
        v_borrower_id, NEW.id, v_inst.id, 'inst_missed',
        v_delta, v_score_before, v_score_after,
        jsonb_build_object(
          'installment_no', v_inst.installment_no,
          'installment_amount', v_inst.amount,
          'due_date', v_inst.due_date
        )
      );

      -- Update score
      UPDATE public.profiles
      SET trust_score = v_score_after
      WHERE id = v_borrower_id;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ────────────────────────────────────────────────────────────────
-- PHASE 5: TRIGGERS
-- ────────────────────────────────────────────────────────────────

-- 5a. Score on every payment
DROP TRIGGER IF EXISTS on_payment_trust_score ON public.payments;
CREATE TRIGGER on_payment_trust_score
  AFTER INSERT ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.calculate_payment_trust_delta();

-- 5b. Default penalty when loan becomes overdue
DROP TRIGGER IF EXISTS on_loan_default_penalty ON public.loans;
CREATE TRIGGER on_loan_default_penalty
  AFTER UPDATE OF status ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.apply_default_penalty();

-- 5c. Auto-generate installment schedule on loan creation
DROP TRIGGER IF EXISTS on_loan_generate_installments ON public.loans;
CREATE TRIGGER on_loan_generate_installments
  AFTER INSERT ON public.loans
  FOR EACH ROW
  EXECUTE FUNCTION public.generate_installment_schedule();

-- ────────────────────────────────────────────────────────────────
-- PHASE 6: HELPER VIEWS & QUERIES
-- ────────────────────────────────────────────────────────────────

-- View: User trust score summary
CREATE OR REPLACE VIEW public.trust_score_summary AS
SELECT
  p.id AS user_id,
  p.name,
  p.email,
  p.trust_score,
  CASE
    WHEN p.trust_score >= 80 THEN 'Excellent'
    WHEN p.trust_score >= 60 THEN 'Good'
    WHEN p.trust_score >= 40 THEN 'Fair'
    WHEN p.trust_score >= 20 THEN 'Poor'
    ELSE 'Critical'
  END AS trust_tier,
  COUNT(tsl.id) AS total_score_events,
  SUM(CASE WHEN tsl.score_delta > 0 THEN tsl.score_delta ELSE 0 END) AS total_positive,
  SUM(CASE WHEN tsl.score_delta < 0 THEN tsl.score_delta ELSE 0 END) AS total_negative,
  MAX(tsl.created_at) AS last_score_change
FROM public.profiles p
LEFT JOIN public.trust_score_logs tsl ON tsl.user_id = p.id
GROUP BY p.id, p.name, p.email, p.trust_score;

-- ────────────────────────────────────────────────────────────────
-- EXAMPLE QUERIES (for reference, not executed)
-- ────────────────────────────────────────────────────────────────

/*
-- ▸ Get a user's trust score history
SELECT event_type, score_delta, score_before, score_after, metadata, created_at
FROM trust_score_logs
WHERE user_id = '<USER_UUID>'
ORDER BY created_at DESC;

-- ▸ Get installment schedule for a loan
SELECT installment_no, amount, due_date, status, paid_on, score_delta
FROM installments
WHERE loan_id = '<LOAN_UUID>'
ORDER BY installment_no;

-- ▸ Get trust score leaderboard
SELECT user_id, name, trust_score, trust_tier,
       total_positive, total_negative
FROM trust_score_summary
ORDER BY trust_score DESC
LIMIT 10;

-- ▸ Check which installments are overdue
SELECT i.*, l.borrower_name, l.borrower_email
FROM installments i
JOIN loans l ON l.id = i.loan_id
WHERE i.status = 'pending'
  AND i.due_date < CURRENT_DATE;

-- ▸ Create a loan with 6 monthly installments (triggers auto-schedule)
INSERT INTO loans (user_id, type, amount, borrower_name, borrower_email,
                   due_date, repayment_schedule, num_installments)
VALUES ('<USER_UUID>', 'borrowed', 60000, 'John Doe', 'john@example.com',
        CURRENT_DATE + INTERVAL '6 months', 'monthly', 6);

-- ▸ Record an installment payment (triggers trust score calc)
INSERT INTO payments (loan_id, user_id, amount, installment_id)
VALUES ('<LOAN_UUID>', '<USER_UUID>', 10000, '<INSTALLMENT_UUID>');

-- ▸ Record a full loan repayment (triggers trust score calc)
INSERT INTO payments (loan_id, user_id, amount)
VALUES ('<LOAN_UUID>', '<USER_UUID>', 50000);

-- ▸ Mark a loan as defaulted (triggers penalty)
UPDATE loans SET status = 'overdue' WHERE id = '<LOAN_UUID>';
*/
