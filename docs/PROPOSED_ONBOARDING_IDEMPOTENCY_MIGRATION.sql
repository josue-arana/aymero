-- PROPOSAL ONLY — do not apply as part of Sprint 3.53E.1.
--
-- The existing onboarding RPC is transactional and idempotent for sequential
-- retries. A database-level guard is still required before claiming safety for
-- two independent browser tabs racing on the same auth user.

-- Preflight: production/staging data must be reviewed before this index is
-- created. This query must return zero rows.
select user_id, count(*) as active_membership_count
from public.contractor_members
where user_id is not null
  and status = 'active'
  and archived_at is null
group by user_id
having count(*) > 1;

-- After any duplicate review/remediation is separately approved, add the
-- database invariant:
create unique index contractor_members_one_active_user_idx
  on public.contractor_members (user_id)
  where user_id is not null
    and status = 'active'
    and archived_at is null;

-- In the existing public.complete_beta_contractor_onboarding function, add
-- immediately after `current_user_id := auth.uid();` and recreate the
-- function with the existing body unchanged:
--
--   perform pg_advisory_xact_lock(
--     hashtextextended(current_user_id::text, 0)
--   );
--
-- The lock serializes concurrent onboarding attempts for one auth user; the
-- existing active-membership branch then returns the already-created tenant.
