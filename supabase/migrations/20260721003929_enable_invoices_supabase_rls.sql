-- Enable tenant-safe authenticated invoice access.
--
-- Invoices were the only connected sample-workspace entity without an active
-- RLS migration. With RLS enabled and no applicable INSERT policy, PostgreSQL
-- applies an implicit false WITH CHECK and rejects legitimate member inserts.

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

alter table public.invoices enable row level security;

drop policy if exists "active members can manage invoices" on public.invoices;
drop policy if exists "beta_active_members_can_select_invoices" on public.invoices;
create policy "beta_active_members_can_select_invoices"
  on public.invoices
  for select
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_invoices" on public.invoices;
create policy "beta_active_members_can_insert_invoices"
  on public.invoices
  for insert
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_invoices" on public.invoices;
create policy "beta_active_members_can_update_invoices"
  on public.invoices
  for update
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_invoices" on public.invoices;
create policy "beta_active_members_can_delete_invoices"
  on public.invoices
  for delete
  using (public.is_active_contractor_member(contractor_id));
