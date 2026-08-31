-- Link Miguel's authenticated Supabase user to his contractor profile.
-- This migration is idempotent and only inserts the membership if it does not exist.

insert into public.contractor_members (
  contractor_id,
  user_id,
  name,
  email,
  role,
  status,
  joined_at,
  created_at,
  updated_at
)
select
  contractor.id,
  '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid,
  'Miguel Giron',
  coalesce(auth_user.email, 'miguel.giron@contractorflow.local'),
  'owner',
  'active',
  now(),
  now(),
  now()
from public.contractors as contractor
left join auth.users as auth_user
  on auth_user.id = '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid
where contractor.company_name = 'Skinner Division Contractor'
  and contractor.owner_name = 'Miguel Giron'
  and contractor.archived_at is null
  and not exists (
    select 1
    from public.contractor_members as membership
    where membership.contractor_id = contractor.id
      and membership.user_id = '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid
      and membership.archived_at is null
  );
