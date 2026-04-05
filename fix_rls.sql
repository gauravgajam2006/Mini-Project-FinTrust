-- This file contains optimized RLS policies and table fixes for production readiness.
-- Run this in your Supabase SQL Editor.

-- 1. SECURITY & PERFORMANCE FIX: Optimize the Loans Table Policies
-- Previously used subqueries which are extremely slow and insecure on scaling.
-- We now use auth.jwt()->>'email' to safely pull the user's email directly from their secure token.

drop policy if exists "Users can view their involved loans" on loans;
create policy "Users can view their involved loans" on loans
  for select using (
    auth.uid() = user_id OR
    lower(borrower_email) = lower(auth.jwt()->>'email') OR
    lower(lender_email) = lower(auth.jwt()->>'email')
  );

drop policy if exists "Users can update their involved loans" on loans;
create policy "Users can update their involved loans" on loans
  for update using (
    auth.uid() = user_id OR
    lower(borrower_email) = lower(auth.jwt()->>'email') OR
    lower(lender_email) = lower(auth.jwt()->>'email')
  );

-- 2. SECURITY FIX: Optimize Payments Table Policies
drop policy if exists "Users can view payments for their involved loans" on payments;
create policy "Users can view payments for their involved loans" on payments
  for select using (
    exists (
      select 1 from loans
      where loans.id = payments.loan_id
      and (
        loans.user_id = auth.uid() or
        lower(loans.borrower_email) = lower(auth.jwt()->>'email') or
        lower(loans.lender_email) = lower(auth.jwt()->>'email')
      )
    )
  );

-- 3. SCHEMA INTEGRITY
-- Restrict invalid status modifications
alter table loans drop constraint if exists loans_status_check;
alter table loans add constraint loans_status_check check (status in ('active', 'completed', 'overdue', 'pending_approval', 'rejected'));
