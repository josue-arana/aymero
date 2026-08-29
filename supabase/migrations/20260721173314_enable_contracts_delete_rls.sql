-- Enable tenant-safe authenticated permanent deletion for contracts.
--
-- Contract SELECT/INSERT behavior was already in use, but the versioned
-- migration history did not install the DELETE policy defined in the
-- standalone estimates/contracts beta policy script. An RLS-filtered DELETE
-- therefore returned an empty representation and left the sample contract in
-- place during dependency cleanup.

create or replace function public.is_active_contractor_member(target_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contractor_members cm
    where cm.contractor_id = target_contractor_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.archived_at is null
  );
$$;

comment on function public.is_active_contractor_member(uuid)
  is 'Returns true when auth.uid() is an active, non-archived member of the requested contractor.';

alter table public.contracts enable row level security;

drop policy if exists "beta_active_members_can_delete_contracts" on public.contracts;
create policy "beta_active_members_can_delete_contracts"
  on public.contracts
  for delete
  to authenticated
  using (public.is_active_contractor_member(contractor_id));
