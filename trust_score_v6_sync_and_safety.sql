-- ================================================================
-- TRUST SCORE V6 — Sync + Safety Hardening
-- ================================================================
-- Applied as Supabase migration on 2026-04-19
--
-- FIXES:
--   1. Unique index on trust_score_logs to prevent duplicate payment scoring
--      at the DB level (race condition guard beyond the IF EXISTS check)
--   2. Index on (loan_id, event_type) for faster early bonus lookups
--   3. Sync profiles.gamification->trustScore with profiles.trust_score
--      for all existing users (fixes the frontend mismatch)
--
-- COMPANION FRONTEND FIX (LoanContext.jsx):
--   - handleAuthStateChange(): overrides gamification.trustScore with profiles.trust_score
--   - addRepayment(): calls refreshTrustScore() after payment
--   - refreshTrustScore(): new helper that fetches trust_score from DB
--   - Default trustScore changed from 500 to 50 (matching DB scale)
-- ================================================================

-- ────────────────────────────────────────────────────────────────
-- STEP 1: Unique index on payment_id in trust_score_logs metadata
-- ────────────────────────────────────────────────────────────────
CREATE UNIQUE INDEX IF NOT EXISTS idx_trust_score_logs_payment_id_unique
  ON public.trust_score_logs ((metadata->>'payment_id'))
  WHERE metadata->>'payment_id' IS NOT NULL;

-- ────────────────────────────────────────────────────────────────
-- STEP 2: Index for faster early bonus lookups
-- ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_trust_score_logs_loan_event
  ON public.trust_score_logs (loan_id, event_type);

-- ────────────────────────────────────────────────────────────────
-- STEP 3: Sync gamification.trustScore with profiles.trust_score
-- ────────────────────────────────────────────────────────────────
UPDATE public.profiles
SET gamification = jsonb_set(
  COALESCE(gamification, '{}'::jsonb),
  '{trustScore}',
  to_jsonb(COALESCE(trust_score, 50))
)
WHERE true;
