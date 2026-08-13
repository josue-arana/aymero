-- ContractorFlow CRM initial Supabase schema
-- Phase 1 backend preparation for a free 1–5 contractor beta on Supabase Free Tier.
--
-- This schema is intentionally designed for local/frontend state to remain the source of
-- truth until the app is explicitly wired to Supabase. It prepares the database layer for
-- future Supabase Auth integration, multi-contractor data isolation, and storage-backed
-- project photos without changing the current React UI.
--
-- RLS note: Row Level Security policies are documented as placeholders near the bottom of
-- this file, but RLS is NOT enabled here yet. Enable and test RLS only when Supabase Auth
-- and contractor membership flows are implemented.

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- Status and category constraints
-- -----------------------------------------------------------------------------

create type lead_status as enum (
  'new',
  'contacted',
  'qualified',
  'estimate_sent',
  'won',
  'lost'
);

create type project_status as enum (
  'lead',
  'estimate',
  'contract',
  'scheduled',
  'in_progress',
  'completed',
  'cancelled'
);

create type estimate_status as enum (
  'draft',
  'saved',
  'sent',
  'approved',
  'rejected',
  'converted'
);

create type contract_status as enum (
  'draft',
  'sent',
  'signed',
  'cancelled'
);

create type invoice_status as enum (
  'draft',
  'sent',
  'partial',
  'paid',
  'overdue',
  'cancelled'
);

create type payment_status as enum (
  'pending',
  'recorded',
  'failed',
  'refunded'
);

create type event_type as enum (
  'appointment',
  'estimate',
  'job',
  'inspection',
  'follow_up',
  'payment',
  'other'
);

create type photo_category as enum (
  'before',
  'during',
  'after',
  'damage',
  'materials',
  'receipt',
  'document',
  'other'
);

create type member_role as enum (
  'owner',
  'admin',
  'member'
);

create type member_status as enum (
  'invited',
  'active',
  'disabled'
);

-- -----------------------------------------------------------------------------
-- Shared updated_at helper
-- -----------------------------------------------------------------------------

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- -----------------------------------------------------------------------------
-- Core contractor and membership tables
-- -----------------------------------------------------------------------------

create table contractors (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid,
  company_name text not null,
  owner_name text,
  phone text,
  email text,
  business_address text,
  website text,
  license_number text,
  logo_file_path text,
  logo_url text,
  beta_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table contractors is 'Contractor company accounts for a free 1–5 contractor beta. Future Supabase Auth users will be linked through contractor_members.';
comment on column contractors.contractor_id is 'Reserved for consistent tenant indexing across tables. For contractor root rows this may be null or mirror id in a future migration.';

create table contractor_members (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  user_id uuid,
  name text not null,
  email text not null,
  phone text,
  role member_role not null default 'owner',
  status member_status not null default 'invited',
  preferred_language text not null default 'en' check (preferred_language in ('en', 'es')),
  timezone text,
  invited_at timestamptz default now(),
  joined_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table contractor_members is 'Contractor membership table prepared for future Supabase Auth integration. During the local-state beta, user_id may remain null until Auth is connected.';
comment on column contractor_members.user_id is 'Future relationship target: auth.users(id). Kept as a nullable uuid for now so local development and schema planning do not require Supabase Auth wiring yet.';
comment on column contractor_members.role is 'Allowed roles for the beta: owner, admin, member.';
comment on column contractor_members.status is 'Allowed membership statuses: invited, active, disabled. Future RLS should only allow access for active members.';

-- -----------------------------------------------------------------------------
-- CRM records
-- -----------------------------------------------------------------------------

create table clients (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  first_name text,
  last_name text,
  display_name text not null,
  phone text,
  email text,
  address text,
  city text,
  state text,
  postal_code text,
  preferred_language text default 'en' check (preferred_language in ('en', 'es')),
  notes text,
  sample_data_key text,
  status text not null default 'active' check (status in ('active', 'inactive', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table leads (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid,
  name text not null,
  phone text,
  email text,
  address text,
  service_type text,
  source text,
  estimated_value numeric(12,2),
  status lead_status not null default 'new',
  priority text default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  notes text,
  sample_data_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table projects (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  description text,
  project_type text,
  address text,
  status project_status not null default 'lead',
  estimated_value numeric(12,2),
  contract_value numeric(12,2),
  start_date date,
  target_end_date date,
  completed_at timestamptz,
  notes text,
  sample_data_key text,
  public_portal_token text not null default replace(gen_random_uuid()::text, '-', ''),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

alter table leads
  add constraint leads_project_id_fkey foreign key (project_id) references projects(id) on delete set null;

create table estimates (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  lead_id uuid references leads(id) on delete set null,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  estimate_number text,
  title text not null,
  scope_of_work text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  discount_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  deposit_percentage numeric(5,2),
  materials_included boolean not null default true,
  payment_terms text,
  sample_data_key text,
  status estimate_status not null default 'draft',
  sent_at timestamptz,
  approved_at timestamptz,
  rejected_at timestamptz,
  converted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table contracts (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  contract_number text,
  title text not null,
  scope_of_work text,
  terms text,
  total_amount numeric(12,2) not null default 0,
  deposit_amount numeric(12,2),
  payment_terms text,
  sample_data_key text,
  status contract_status not null default 'draft',
  sent_at timestamptz,
  signed_at timestamptz,
  signed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table invoices (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  contract_id uuid references contracts(id) on delete set null,
  invoice_number text,
  title text not null,
  description text,
  customer_notes text,
  line_items jsonb not null default '[]'::jsonb,
  subtotal numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  amount_paid numeric(12,2) not null default 0,
  amount_due numeric(12,2) generated always as (total_amount - amount_paid) stored,
  status invoice_status not null default 'draft',
  issue_date date,
  due_date date,
  sent_at timestamptz,
  paid_at timestamptz,
  sample_data_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table payments (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  contract_id uuid references contracts(id) on delete set null,
  estimate_id uuid references estimates(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  invoice_id uuid references invoices(id) on delete set null,
  amount numeric(12,2) not null,
  payment_type text,
  payment_date date default current_date,
  payment_method text,
  method text,
  reference_number text,
  status payment_status not null default 'recorded',
  notes text,
  sample_data_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table events (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  title text not null,
  description text,
  event_type text,
  event_date date,
  start_time text,
  end_time text,
  type event_type not null default 'appointment',
  status text not null default 'scheduled' check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  starts_at timestamptz not null,
  ends_at timestamptz,
  location text,
  notes text,
  reminder text,
  sample_data_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table project_photos (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  client_id uuid references clients(id) on delete set null,
  project_id uuid references projects(id) on delete cascade,
  uploaded_by_member_id uuid references contractor_members(id) on delete set null,
  file_path text not null,
  thumbnail_path text,
  file_size bigint,
  mime_type text,
  category photo_category not null default 'other',
  caption text,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

comment on table project_photos is 'Storage-ready metadata for future Supabase Storage project photos. Actual files should live in a contractor-scoped storage bucket/path.';

create table company_settings (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors(id) on delete cascade,
  company_name text,
  owner_name text,
  phone text,
  email text,
  business_address text,
  website text,
  license_number text,
  logo_file_path text,
  primary_brand_color text,
  accepted_payment_methods jsonb not null default '{"methods":[],"otherLabel":""}'::jsonb,
  default_payment_terms text,
  default_tax_rate numeric(6,3) not null default 0 check (default_tax_rate between 0 and 100),
  default_estimate_expiration_days integer not null default 30 check (default_estimate_expiration_days between 1 and 365),
  default_currency text not null default 'USD' check (default_currency in ('USD', 'CAD', 'MXN')),
  default_deposit_percentage numeric(5,2),
  default_invoice_due_days integer not null default 14,
  default_materials_included boolean not null default true,
  contractor_app_language text not null default 'en' check (contractor_app_language in ('en', 'es')),
  simple_mode boolean not null default false,
  customer_portal_language text not null default 'en' check (customer_portal_language in ('en', 'es')),
  show_payments_in_portal boolean not null default true,
  show_photos_in_portal boolean not null default true,
  show_documents_in_portal boolean not null default true,
  onboarding_completed boolean not null default false,
  onboarding_dismissed boolean not null default false,
  onboarding_step integer not null default 1 check (onboarding_step between 1 and 5),
  sample_workspace jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint company_settings_accepted_payment_methods_shape_check check (
    jsonb_typeof(accepted_payment_methods) = 'object'
    and jsonb_typeof(accepted_payment_methods -> 'methods') = 'array'
    and jsonb_typeof(accepted_payment_methods -> 'otherLabel') = 'string'
  ),
  constraint company_settings_one_per_contractor unique (contractor_id)
);

comment on table company_settings is 'Company defaults reused by estimates, contracts, invoices, and the customer portal. Data is stored once; UI labels remain bilingual in the frontend translation system.';

-- -----------------------------------------------------------------------------
-- Indexes
-- -----------------------------------------------------------------------------

-- contractor_id indexes
create index idx_contractors_contractor_id on contractors(contractor_id);
create index idx_contractor_members_contractor_id on contractor_members(contractor_id);
create index idx_clients_contractor_id on clients(contractor_id);
create index idx_leads_contractor_id on leads(contractor_id);
create index idx_projects_contractor_id on projects(contractor_id);
create unique index projects_public_portal_token_idx on projects(public_portal_token);
create index idx_estimates_contractor_id on estimates(contractor_id);
create index idx_contracts_contractor_id on contracts(contractor_id);
create index idx_invoices_contractor_id on invoices(contractor_id);
create index idx_payments_contractor_id on payments(contractor_id);
create index idx_events_contractor_id on events(contractor_id);
create index idx_project_photos_contractor_id on project_photos(contractor_id);
create index idx_company_settings_contractor_id on company_settings(contractor_id);

-- client_id indexes
create index idx_leads_client_id on leads(client_id);
create index idx_projects_client_id on projects(client_id);
create index idx_estimates_client_id on estimates(client_id);
create index idx_contracts_client_id on contracts(client_id);
create index idx_invoices_client_id on invoices(client_id);
create index idx_payments_client_id on payments(client_id);
create index idx_events_client_id on events(client_id);
create index idx_project_photos_client_id on project_photos(client_id);

-- project_id indexes
create index idx_leads_project_id on leads(project_id);
create index idx_estimates_project_id on estimates(project_id);
create index idx_estimates_lead_id on estimates(lead_id);
create index idx_contracts_project_id on contracts(project_id);
create index idx_invoices_project_id on invoices(project_id);
create index idx_payments_project_id on payments(project_id);
create index idx_payments_contract_id on payments(contract_id);
create index idx_payments_estimate_id on payments(estimate_id);
create index idx_payments_lead_id on payments(lead_id);
create index idx_events_project_id on events(project_id);
create index idx_events_lead_id on events(lead_id);
create index idx_project_photos_project_id on project_photos(project_id);

-- status indexes
create index idx_clients_status on clients(status);
create index idx_leads_status on leads(status);
create index idx_projects_status on projects(status);
create index idx_estimates_status on estimates(status);
create index idx_contracts_status on contracts(status);
create index idx_invoices_status on invoices(status);
create index idx_payments_status on payments(status);
create index idx_events_status on events(status);

-- created_at indexes
create index idx_contractors_created_at on contractors(created_at);
create index idx_contractor_members_created_at on contractor_members(created_at);
create index idx_clients_created_at on clients(created_at);
create index idx_leads_created_at on leads(created_at);
create index idx_projects_created_at on projects(created_at);
create index idx_estimates_created_at on estimates(created_at);
create index idx_contracts_created_at on contracts(created_at);
create index idx_invoices_created_at on invoices(created_at);
create index idx_payments_created_at on payments(created_at);
create index idx_events_created_at on events(created_at);
create index idx_project_photos_created_at on project_photos(created_at);
create index idx_company_settings_created_at on company_settings(created_at);

-- Useful beta lookup indexes
create index idx_contractor_members_user_id on contractor_members(user_id) where user_id is not null;
create index idx_contractor_members_status on contractor_members(status);
create index idx_clients_email on clients(email) where email is not null;
create index idx_invoices_due_date on invoices(due_date) where due_date is not null;
create index idx_events_starts_at on events(starts_at);

-- Prevent duplicate Aymero demo records while keeping ordinary records unrestricted.
create unique index clients_contractor_sample_data_key_idx on clients(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index leads_contractor_sample_data_key_idx on leads(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index projects_contractor_sample_data_key_idx on projects(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index estimates_contractor_sample_data_key_idx on estimates(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index contracts_contractor_sample_data_key_idx on contracts(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index invoices_contractor_sample_data_key_idx on invoices(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index payments_contractor_sample_data_key_idx on payments(contractor_id, sample_data_key) where sample_data_key is not null;
create unique index events_contractor_sample_data_key_idx on events(contractor_id, sample_data_key) where sample_data_key is not null;

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

create trigger set_contractors_updated_at before update on contractors
  for each row execute function set_updated_at();

create trigger set_contractor_members_updated_at before update on contractor_members
  for each row execute function set_updated_at();

create trigger set_clients_updated_at before update on clients
  for each row execute function set_updated_at();

create trigger set_leads_updated_at before update on leads
  for each row execute function set_updated_at();

create trigger set_projects_updated_at before update on projects
  for each row execute function set_updated_at();

create trigger set_estimates_updated_at before update on estimates
  for each row execute function set_updated_at();

create trigger set_contracts_updated_at before update on contracts
  for each row execute function set_updated_at();

create trigger set_invoices_updated_at before update on invoices
  for each row execute function set_updated_at();

create trigger set_payments_updated_at before update on payments
  for each row execute function set_updated_at();

create trigger set_events_updated_at before update on events
  for each row execute function set_updated_at();

create trigger set_project_photos_updated_at before update on project_photos
  for each row execute function set_updated_at();

create trigger set_company_settings_updated_at before update on company_settings
  for each row execute function set_updated_at();

-- -----------------------------------------------------------------------------
-- Future Row Level Security placeholders only. RLS intentionally not enabled yet.
-- -----------------------------------------------------------------------------

-- Future policy direction after Supabase Auth is added:
-- 1. Enable RLS on every contractor-owned table.
-- 2. Add a helper function that checks whether auth.uid() belongs to contractor_members.
-- 3. Allow users to select/insert/update/archive rows only when their contractor_members
--    row matches the record contractor_id and has status = active.
-- 4. Keep project_photos storage paths contractor-scoped, for example:
--    contractor_id/project_id/photo_id/original.jpg
-- 5. Add Storage bucket policies that use the same contractor membership check.
--
-- Example only, not active:
-- alter table clients enable row level security;
-- create policy "members can read their contractor clients"
--   on clients for select
--   using (exists (
--     select 1 from contractor_members cm
--     where cm.contractor_id = clients.contractor_id
--       and cm.user_id = auth.uid()
--       and cm.status = 'active'
--       and cm.archived_at is null
--   ));
