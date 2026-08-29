-- Relationships and internal marker needed by the connected Aymero sample journey.
-- Existing contractor-scoped RLS policies continue to protect both columns.

alter table public.estimates
  add column if not exists lead_id uuid;

-- Add the relationship without scanning historical rows first. Some beta
-- estimates may contain legacy lead IDs whose lead record was already removed.
-- PostgreSQL still enforces this constraint for new writes while it is unvalidated.
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_lead_id_fkey'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_lead_id_fkey
      foreign key (lead_id) references public.leads(id) on delete set null
      not valid;
  end if;
end $$;

-- Preserve historical estimates but clear only relationships that cannot
-- resolve. This matches the constraint's future ON DELETE SET NULL behavior.
update public.estimates as estimate
set lead_id = null
where estimate.lead_id is not null
  and not exists (
    select 1
    from public.leads as lead
    where lead.id = estimate.lead_id
  );

alter table public.estimates
  validate constraint estimates_lead_id_fkey;

alter table public.invoices
  add column if not exists sample_data_key text;

create index if not exists estimates_lead_id_idx
  on public.estimates (lead_id);

create unique index if not exists invoices_contractor_sample_data_key_idx
  on public.invoices (contractor_id, sample_data_key)
  where sample_data_key is not null;
