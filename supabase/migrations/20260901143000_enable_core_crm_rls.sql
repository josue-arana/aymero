-- Materialize the existing core CRM beta RLS policy model in active migration
-- history so greenfield environments receive the same tenant boundary.

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

revoke all on function public.is_active_contractor_member(uuid) from public;
grant execute on function public.is_active_contractor_member(uuid) to authenticated;
grant execute on function public.is_active_contractor_member(uuid) to service_role;

alter table public.contractors enable row level security;
alter table public.contractor_members enable row level security;
alter table public.company_settings enable row level security;
alter table public.clients enable row level security;
alter table public.leads enable row level security;
alter table public.projects enable row level security;
alter table public.estimates enable row level security;
alter table public.contracts enable row level security;

drop policy if exists "beta_active_members_can_select_their_contractor" on public.contractors;
create policy "beta_active_members_can_select_their_contractor"
  on public.contractors for select to authenticated
  using (public.is_active_contractor_member(id));

drop policy if exists "beta_active_members_can_update_their_contractor" on public.contractors;
create policy "beta_active_members_can_update_their_contractor"
  on public.contractors for update to authenticated
  using (public.is_active_contractor_member(id))
  with check (public.is_active_contractor_member(id));

drop policy if exists "beta_active_members_can_select_their_membership_scope" on public.contractor_members;
create policy "beta_active_members_can_select_their_membership_scope"
  on public.contractor_members for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_company_settings" on public.company_settings;
create policy "beta_active_members_can_select_company_settings"
  on public.company_settings for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_company_settings" on public.company_settings;
create policy "beta_active_members_can_insert_company_settings"
  on public.company_settings for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_company_settings" on public.company_settings;
create policy "beta_active_members_can_update_company_settings"
  on public.company_settings for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_clients" on public.clients;
create policy "beta_active_members_can_select_clients"
  on public.clients for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_clients" on public.clients;
create policy "beta_active_members_can_insert_clients"
  on public.clients for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_clients" on public.clients;
create policy "beta_active_members_can_update_clients"
  on public.clients for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_clients" on public.clients;
create policy "beta_active_members_can_delete_clients"
  on public.clients for delete to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_leads" on public.leads;
create policy "beta_active_members_can_select_leads"
  on public.leads for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_leads" on public.leads;
create policy "beta_active_members_can_insert_leads"
  on public.leads for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_leads" on public.leads;
create policy "beta_active_members_can_update_leads"
  on public.leads for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_leads" on public.leads;
create policy "beta_active_members_can_delete_leads"
  on public.leads for delete to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_projects" on public.projects;
create policy "beta_active_members_can_select_projects"
  on public.projects for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_projects" on public.projects;
create policy "beta_active_members_can_insert_projects"
  on public.projects for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_projects" on public.projects;
create policy "beta_active_members_can_update_projects"
  on public.projects for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_projects" on public.projects;
create policy "beta_active_members_can_delete_projects"
  on public.projects for delete to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_estimates" on public.estimates;
create policy "beta_active_members_can_select_estimates"
  on public.estimates for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_estimates" on public.estimates;
create policy "beta_active_members_can_insert_estimates"
  on public.estimates for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_estimates" on public.estimates;
create policy "beta_active_members_can_update_estimates"
  on public.estimates for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_estimates" on public.estimates;
create policy "beta_active_members_can_delete_estimates"
  on public.estimates for delete to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_select_contracts" on public.contracts;
create policy "beta_active_members_can_select_contracts"
  on public.contracts for select to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_insert_contracts" on public.contracts;
create policy "beta_active_members_can_insert_contracts"
  on public.contracts for insert to authenticated
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_update_contracts" on public.contracts;
create policy "beta_active_members_can_update_contracts"
  on public.contracts for update to authenticated
  using (public.is_active_contractor_member(contractor_id))
  with check (public.is_active_contractor_member(contractor_id));

drop policy if exists "beta_active_members_can_delete_contracts" on public.contracts;
create policy "beta_active_members_can_delete_contracts"
  on public.contracts for delete to authenticated
  using (public.is_active_contractor_member(contractor_id));
