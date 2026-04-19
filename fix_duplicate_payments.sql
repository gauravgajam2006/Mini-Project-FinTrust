-- ================================================================
-- FIX: Duplicate Payments & Trust Score Accuracy
-- Applied on: 2026-04-19
-- ================================================================
-- PROBLEM:
--   1. Same loan_id + amount inserted multiple times (duplicate clicks)
--   2. Trust score trigger fired for each duplicate → inflated scores
--   3. Frontend was ALSO updating amount_paid, causing double-counting
--      (trigger updates amount_paid, AND frontend did a manual UPDATE)
--
-- SOLUTION:
--   1. Added transaction_id column (TEXT, NOT NULL, UNIQUE)
--   2. Each payment insert requires a crypto.randomUUID() transaction_id
--   3. UNIQUE constraint on transaction_id prevents DB-level duplicates
--   4. BEFORE INSERT trigger validates transaction_id is non-empty
--   5. Frontend generates transaction_id + has paymentInProgress lock
--   6. Removed redundant amount_paid update from frontend (trigger handles it)
--   7. Cleaned existing duplicate rows, recalculated trust scores
-- ================================================================

-- Migration 1: add_transaction_id_and_clean_duplicates
-- (Already applied via Supabase MCP)

-- Migration 2: fix_trigger_dedup_check
-- (Already applied via Supabase MCP)

-- ================================================================
-- VERIFY QUERIES (run these to confirm fix is working)
-- ================================================================

-- Check no duplicates remain:
-- SELECT loan_id, amount, COUNT(*) as cnt
-- FROM public.payments GROUP BY loan_id, amount HAVING COUNT(*) > 1;

-- Check transaction_id column:
-- SELECT column_name, data_type, is_nullable
-- FROM information_schema.columns
-- WHERE table_name = 'payments' AND column_name = 'transaction_id';

-- Check constraints:
-- SELECT constraint_name, constraint_type
-- FROM information_schema.table_constraints
-- WHERE table_name = 'payments';

-- Check data consistency (should return empty):
-- SELECT l.id, l.amount_paid, SUM(p.amount)
-- FROM loans l LEFT JOIN payments p ON p.loan_id = l.id
-- GROUP BY l.id HAVING SUM(p.amount) != l.amount_paid;
