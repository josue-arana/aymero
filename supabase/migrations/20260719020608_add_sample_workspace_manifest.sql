-- Contractor-scoped manifest for the optional Aymero demo workspace.
-- Existing RLS on company_settings already limits this data to active members
-- of the matching contractor, so no new policy is required.

alter table public.company_settings
  add column if not exists sample_workspace jsonb not null default '{}'::jsonb;

alter table public.clients add column if not exists sample_data_key text;
alter table public.leads add column if not exists sample_data_key text;
alter table public.projects add column if not exists sample_data_key text;
alter table public.estimates add column if not exists sample_data_key text;
alter table public.contracts add column if not exists sample_data_key text;
alter table public.payments add column if not exists sample_data_key text;
alter table public.events add column if not exists sample_data_key text;

create unique index if not exists clients_contractor_sample_data_key_idx on public.clients (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists leads_contractor_sample_data_key_idx on public.leads (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists projects_contractor_sample_data_key_idx on public.projects (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists estimates_contractor_sample_data_key_idx on public.estimates (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists contracts_contractor_sample_data_key_idx on public.contracts (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists payments_contractor_sample_data_key_idx on public.payments (contractor_id, sample_data_key) where sample_data_key is not null;
create unique index if not exists events_contractor_sample_data_key_idx on public.events (contractor_id, sample_data_key) where sample_data_key is not null;

comment on column public.company_settings.sample_workspace is
  'Tracks Aymero-generated sample record IDs and install state for idempotent setup and safe removal.';
