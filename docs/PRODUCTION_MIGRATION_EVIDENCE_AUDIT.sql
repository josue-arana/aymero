-- Sprint 3.44F.2 targeted production migration evidence audit.
-- READ ONLY: every numbered item is exactly one SELECT or WITH ... SELECT.
-- Run each query independently in the production Supabase SQL Editor and retain
-- each result set privately. Do not commit production-returned IDs or definitions.

-- Query 01 — Self-service onboarding function definition and ACL.
-- Migration: 20260622_enable_self_service_beta_onboarding.sql.
-- FULLY PRESENT: exactly one five-text-argument row; SECURITY DEFINER=true;
-- stable search_path is public, auth; authenticated can EXECUTE; anon/PUBLIC
-- cannot EXECUTE; and function_definition matches the local migration.
-- PARTIAL/ABSENT: no row, a different signature/body/configuration, SECURITY
-- DEFINER=false, or a different effective EXECUTE surface.
-- Absence of rows is meaningful and means the function signature is absent.
select
  namespace_record.nspname as function_schema,
  function_record.proname as function_name,
  pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
  pg_get_function_result(function_record.oid) as return_type,
  function_record.prosecdef as security_definer,
  case function_record.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
  pg_get_userbyid(function_record.proowner) as function_owner,
  function_record.proconfig as function_configuration,
  has_function_privilege('anon', function_record.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', function_record.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', function_record.oid, 'EXECUTE') as service_role_can_execute,
  pg_get_functiondef(function_record.oid) as function_definition
from pg_proc as function_record
join pg_namespace as namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.proname = 'complete_beta_contractor_onboarding'
  and oidvectortypes(function_record.proargtypes) = 'text, text, text, text, text';

-- Query 02 — Miguel-specific contractor, membership, settings, and auth state.
-- Migrations: 20260622_create_miguel_contractor_profile.sql and
-- 20260622_link_miguel_contractor_membership.sql.
-- FULLY PRESENT: contractor_rows>=1 proves the recorded profile result remains;
-- membership_rows>=1 with owner/active/non-archived proves the separate membership
-- postcondition; auth_user_exists=true and settings_rows>=1 are supporting account
-- state but were not effects of the recorded one-statement profile migration.
-- PARTIAL/ABSENT: zero contractor rows, zero qualifying memberships, or duplicates
-- requiring account review. Absence is meaningful. Only IDs/counts/status are returned.
with target_contractors as (
  select contractor.id
  from public.contractors as contractor
  where contractor.company_name = 'Skinner Division Contractor'
    and contractor.owner_name = 'Miguel Giron'
    and contractor.archived_at is null
), target_memberships as (
  select membership.contractor_id, membership.role, membership.status, membership.archived_at
  from public.contractor_members as membership
  join target_contractors as contractor
    on contractor.id = membership.contractor_id
  where membership.user_id = '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid
)
select
  (select count(*) from target_contractors) as contractor_rows,
  (select array_agg(id order by id) from target_contractors) as contractor_ids,
  (select count(*) from target_memberships) as membership_rows,
  (select count(*) from target_memberships where role = 'owner' and status = 'active' and archived_at is null) as qualifying_owner_memberships,
  (select coalesce(array_agg(distinct role order by role), array[]::text[]) from target_memberships) as membership_roles,
  (select coalesce(array_agg(distinct status::text order by status::text), array[]::text[]) from target_memberships) as membership_statuses,
  exists(select 1 from auth.users where id = '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid) as auth_user_exists,
  (select count(*) from public.company_settings as settings join target_contractors as contractor on contractor.id = settings.contractor_id where settings.archived_at is null) as settings_rows;

-- Query 03 — Shared membership and Project Photo helper definitions/ACLs.
-- Migrations: 20260624_enable_payments_supabase_beta.sql,
-- 20260625_enable_events_supabase_beta.sql,
-- 20260628_enable_project_photos_storage_beta.sql,
-- 20260628_fix_project_photos_identity_rls.sql, and the 20260721 RLS files.
-- FULLY PRESENT: one exact expected signature per helper, SECURITY DEFINER=true,
-- stable volatility, expected search_path, and bodies matching the final local intent.
-- PARTIAL/ABSENT: missing/duplicate signatures or differing body/security/config/ACL.
-- Absence of any expected helper row is meaningful.
select
  function_record.proname as function_name,
  pg_get_function_identity_arguments(function_record.oid) as identity_arguments,
  pg_get_function_result(function_record.oid) as return_type,
  function_record.prosecdef as security_definer,
  case function_record.provolatile when 'i' then 'immutable' when 's' then 'stable' else 'volatile' end as volatility,
  pg_get_userbyid(function_record.proowner) as function_owner,
  function_record.proconfig as function_configuration,
  has_function_privilege('anon', function_record.oid, 'EXECUTE') as anon_can_execute,
  has_function_privilege('authenticated', function_record.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('service_role', function_record.oid, 'EXECUTE') as service_role_can_execute,
  pg_get_functiondef(function_record.oid) as function_definition
from pg_proc as function_record
join pg_namespace as namespace_record
  on namespace_record.oid = function_record.pronamespace
where namespace_record.nspname = 'public'
  and function_record.proname in (
    'is_active_contractor_member',
    'can_access_project_photo_project',
    'can_access_project_photo_storage_path',
    'can_assign_project_photo_uploader'
  )
order by function_record.proname, pg_get_function_identity_arguments(function_record.oid);

-- Query 04 — Payments defaults, RLS/policies, and legacy-method backfill.
-- Migration: 20260624_enable_payments_supabase_beta.sql.
-- FULLY PRESENT: RLS enabled; four named policies have exact commands and
-- membership predicates; metadata matches local defaults/nullability; helper is
-- exact per Query 03; backfill_violations=0.
-- PARTIAL/ABSENT: any missing/different metadata/policy/helper or violations>0.
-- Absence: empty policy JSON or missing column entries is meaningful; zero
-- Payment rows still validly satisfies the aggregate backfill invariant.
with column_evidence as (
  select jsonb_agg(jsonb_build_object(
    'column', column_name,
    'nullable', is_nullable,
    'default', column_default,
    'type', data_type,
    'udt', udt_name
  ) order by ordinal_position) as value
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'payments'
    and column_name in ('amount', 'payment_date', 'status', 'contract_id', 'estimate_id', 'lead_id', 'payment_type', 'payment_method', 'notes', 'archived_at')
), table_evidence as (
  select table_record.relrowsecurity as rls_enabled, table_record.relforcerowsecurity as force_rls
  from pg_class as table_record
  join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
  where namespace_record.nspname = 'public' and table_record.relname = 'payments'
), policy_evidence as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', policyname,
    'command', cmd,
    'roles', roles,
    'using', qual,
    'with_check', with_check
  ) order by policyname), '[]'::jsonb) as value
  from pg_policies
  where schemaname = 'public' and tablename = 'payments'
)
select
  (select value from column_evidence) as column_metadata,
  (select rls_enabled from table_evidence) as rls_enabled,
  (select force_rls from table_evidence) as force_rls,
  (select value from policy_evidence) as policies,
  count(*) filter (where payment_method is null and method is not null) as backfill_violations,
  count(*) as payment_rows
from public.payments;

-- Query 05 — Events RLS/policies and four backfill invariants.
-- Migration: 20260625_enable_events_supabase_beta.sql.
-- FULLY PRESENT: RLS and the four named policies match exactly; helper matches
-- Query 03; all four violation counts are zero.
-- PARTIAL/ABSENT: missing/different policy/RLS/helper or any violation count>0.
-- Absence: empty policy JSON is meaningful; zero Event rows validly satisfies aggregates.
with table_evidence as (
  select table_record.relrowsecurity as rls_enabled, table_record.relforcerowsecurity as force_rls
  from pg_class as table_record
  join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
  where namespace_record.nspname = 'public' and table_record.relname = 'events'
), policy_evidence as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', policyname,
    'command', cmd,
    'roles', roles,
    'using', qual,
    'with_check', with_check
  ) order by policyname), '[]'::jsonb) as value
  from pg_policies
  where schemaname = 'public' and tablename = 'events'
)
select
  (select rls_enabled from table_evidence) as rls_enabled,
  (select force_rls from table_evidence) as force_rls,
  (select value from policy_evidence) as policies,
  count(*) filter (where starts_at is not null and event_date is null) as event_date_backfill_violations,
  count(*) filter (where starts_at is not null and start_time is null) as start_time_backfill_violations,
  count(*) filter (where ends_at is not null and end_time is null) as end_time_backfill_violations,
  count(*) filter (where event_type is null) as event_type_backfill_violations,
  count(*) as event_rows
from public.events;

-- Query 06 — Project Photo storage bucket and effective table privileges.
-- Migration: 20260628_enable_project_photos_storage_beta.sql and both later
-- Project Photo RLS fixes.
-- FULLY PRESENT for bucket effects: exactly one project-photos bucket, private,
-- 10 MiB limit, and JPEG/PNG/WebP MIME list. Privileges are contextual evidence;
-- policy semantics are resolved by Query 07.
-- PARTIAL/ABSENT: null bucket evidence, duplicate identity, public=true, or
-- different restrictions. Absence of the bucket row is meaningful.
with bucket_evidence as (
  select jsonb_agg(jsonb_build_object(
    'id', id,
    'name', name,
    'public', public,
    'file_size_limit', file_size_limit,
    'allowed_mime_types', allowed_mime_types
  ) order by id) as value
  from storage.buckets
  where id = 'project-photos' or name = 'project-photos'
), inspected_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), inspected_privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')
), privilege_evidence as (
  select jsonb_agg(jsonb_build_object(
    'role', role_name,
    'privilege', privilege_name,
    'granted', has_table_privilege(role_name, 'storage.objects', privilege_name)
  ) order by role_name, privilege_name) as value
  from inspected_roles cross join inspected_privileges
)
select
  (select value from bucket_evidence) as project_photos_bucket,
  (select value from privilege_evidence) as storage_objects_privileges;

-- Query 07 — Exact Project Photo and Storage object policies plus RLS state.
-- Migrations: 20260628_enable_project_photos_storage_beta.sql,
-- 20260628_fix_project_photos_rls.sql, and
-- 20260628_fix_project_photos_identity_rls.sql.
-- FULLY PRESENT for the final migration: Project Photo RLS enabled and four
-- current policies exactly use the final access/uploader helpers; four relevant
-- storage policies validate bucket/path with the final storage helper.
-- PARTIAL/ABSENT: missing policies, differing roles/commands/predicates, or RLS
-- disabled. Absence: a table row with null policy fields means no matching policy
-- exists and is meaningful.
with target_tables(table_schema, table_name) as (
  values ('public', 'project_photos'), ('storage', 'objects')
)
select
  target_tables.table_schema,
  target_tables.table_name,
  table_record.relrowsecurity as rls_enabled,
  table_record.relforcerowsecurity as force_rls,
  policy_record.policyname,
  policy_record.permissive,
  policy_record.roles,
  policy_record.cmd,
  policy_record.qual,
  policy_record.with_check
from target_tables
join pg_namespace as namespace_record
  on namespace_record.nspname = target_tables.table_schema
join pg_class as table_record
  on table_record.relnamespace = namespace_record.oid
 and table_record.relname = target_tables.table_name
left join pg_policies as policy_record
  on policy_record.schemaname = target_tables.table_schema
 and policy_record.tablename = target_tables.table_name
 and (
   target_tables.table_name = 'project_photos'
   or policy_record.policyname like '%project_photo%'
 )
order by target_tables.table_schema, target_tables.table_name, policy_record.policyname;

-- Query 08 — Exact language check constraints.
-- Migrations: 20260707_add_client_language_preferences.sql and
-- 20260707_add_estimate_language.sql.
-- FULLY PRESENT: exactly the three named, validated CHECK constraints with
-- en/es/null semantics matching local SQL.
-- PARTIAL/ABSENT: a missing, unvalidated, differently typed, or semantically
-- different constraint. Absence of any named row is meaningful.
select
  table_record.relname as table_name,
  constraint_record.conname as constraint_name,
  constraint_record.contype as constraint_type,
  constraint_record.convalidated as validated,
  pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_constraint as constraint_record
join pg_class as table_record on table_record.oid = constraint_record.conrelid
join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace
where namespace_record.nspname = 'public'
  and constraint_record.conname in (
    'leads_client_language_check',
    'clients_preferred_language_check',
    'estimates_estimate_language_check'
  )
order by constraint_record.conname;

-- Query 09 — Analytics Mode metadata and null-backfill invariant.
-- Migration: 20260630_add_analytics_mode_to_company_settings.sql.
-- FULLY PRESENT as current final state: analytics_mode is Boolean, NOT NULL,
-- default true, null_rows=0, and simple_mode_exists=false.
-- PARTIAL/ABSENT: missing/wrong metadata, null_rows>0, or legacy simple_mode still
-- present. Absence of the analytics column is represented by null metadata.
with column_evidence as (
  select jsonb_agg(jsonb_build_object(
    'column', column_name,
    'type', data_type,
    'nullable', is_nullable,
    'default', column_default
  ) order by column_name) as value
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'company_settings'
    and column_name in ('analytics_mode', 'simple_mode')
)
select
  (select value from column_evidence) as mode_column_metadata,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'company_settings' and column_name = 'simple_mode'
  ) as simple_mode_exists,
  count(*) filter (where analytics_mode is null) as null_rows,
  count(*) as settings_rows
from public.company_settings;

-- Query 10 — Premium onboarding metadata, checks, and bounded backfill evidence.
-- Migration: 20260718_add_premium_onboarding_state.sql.
-- FULLY PRESENT: seven columns have local defaults/nullability, four named checks
-- match, and pre-file rows violating completed=true/dismissed=false/step=5 equal 0.
-- The UTC cutoff is the repository creation instant; any older row necessarily
-- predated a later production application of this file.
-- PARTIAL/ABSENT: missing/different metadata/checks or pre_file_backfill_violations>0.
-- Absence: zero settings rows is meaningful and vacuously satisfies only the data invariant.
with column_evidence as (
  select jsonb_agg(jsonb_build_object(
    'column', column_name,
    'type', data_type,
    'nullable', is_nullable,
    'default', column_default
  ) order by ordinal_position) as value
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'company_settings'
    and column_name in ('onboarding_completed', 'onboarding_dismissed', 'onboarding_step', 'primary_brand_color', 'default_tax_rate', 'default_estimate_expiration_days', 'default_currency')
), constraint_evidence as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', constraint_record.conname,
    'validated', constraint_record.convalidated,
    'definition', pg_get_constraintdef(constraint_record.oid, true)
  ) order by constraint_record.conname), '[]'::jsonb) as value
  from pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.company_settings'::regclass
    and constraint_record.conname in ('company_settings_onboarding_step_check', 'company_settings_default_tax_rate_check', 'company_settings_estimate_expiration_check', 'company_settings_currency_check')
)
select
  (select value from column_evidence) as onboarding_column_metadata,
  (select value from constraint_evidence) as onboarding_constraints,
  count(*) filter (
    where created_at < timestamptz '2026-07-19 04:41:44+00'
      and (onboarding_completed is distinct from true or onboarding_dismissed is distinct from false or onboarding_step is distinct from 5)
  ) as pre_file_backfill_violations,
  count(*) filter (where created_at < timestamptz '2026-07-19 04:41:44+00') as pre_file_settings_rows,
  count(*) as settings_rows
from public.company_settings;

-- Query 11 — Connected sample-journey schema and orphan-cleanup invariant.
-- Migration: 20260719_connect_sample_workspace_journey.sql.
-- FULLY PRESENT: validated estimates_lead_id_fkey with ON DELETE SET NULL,
-- both exact indexes, invoice sample_data_key column, and orphan_lead_ids=0.
-- PARTIAL/ABSENT: missing/unvalidated/different FK/index/column or orphan count>0.
-- Absence: zero Estimate rows is meaningful and vacuously satisfies the orphan invariant.
with constraint_evidence as (
  select jsonb_agg(jsonb_build_object(
    'name', constraint_record.conname,
    'validated', constraint_record.convalidated,
    'delete_action', constraint_record.confdeltype,
    'definition', pg_get_constraintdef(constraint_record.oid, true)
  )) as value
  from pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.estimates'::regclass
    and constraint_record.conname = 'estimates_lead_id_fkey'
), index_evidence as (
  select jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef) order by indexname) as value
  from pg_indexes
  where schemaname = 'public'
    and indexname in ('estimates_lead_id_idx', 'invoices_contractor_sample_data_key_idx')
)
select
  (select value from constraint_evidence) as estimate_lead_constraint,
  (select value from index_evidence) as journey_indexes,
  exists(
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'invoices' and column_name = 'sample_data_key'
  ) as invoice_sample_key_exists,
  count(*) filter (where estimate.lead_id is not null and lead.id is null) as orphan_lead_ids,
  count(*) as estimate_rows
from public.estimates as estimate
left join public.leads as lead on lead.id = estimate.lead_id;

-- Query 12 — Sample-workspace manifest versus actual seeded records.
-- Migration context: 20260719_add_sample_workspace_manifest.sql and
-- 20260719_connect_sample_workspace_journey.sql. The SQL migrations add schema;
-- the application, not a migration, creates aymero_sample_data:* rows.
-- FULLY PRESENT for an installed application workspace: one exact key per entity
-- for a contractor plus identifier=aymero_sample_data, version=2, status=installed,
-- and eight manifest record keys. This result is supplemental and must not be used
-- to claim the schema migrations ran historically.
-- PARTIAL/ABSENT: manifest and entity counts disagree or are incomplete.
-- Absence of rows means no current sample workspace; it does not mean schema is absent.
with sample_counts as (
  select contractor_id, 'client'::text as entity_key, count(*) as row_count from public.clients where sample_data_key = 'aymero_sample_data:client' group by contractor_id
  union all select contractor_id, 'lead', count(*) from public.leads where sample_data_key = 'aymero_sample_data:lead' group by contractor_id
  union all select contractor_id, 'project', count(*) from public.projects where sample_data_key = 'aymero_sample_data:project' group by contractor_id
  union all select contractor_id, 'estimate', count(*) from public.estimates where sample_data_key = 'aymero_sample_data:estimate' group by contractor_id
  union all select contractor_id, 'contract', count(*) from public.contracts where sample_data_key = 'aymero_sample_data:contract' group by contractor_id
  union all select contractor_id, 'invoice', count(*) from public.invoices where sample_data_key = 'aymero_sample_data:invoice' group by contractor_id
  union all select contractor_id, 'payment', count(*) from public.payments where sample_data_key = 'aymero_sample_data:payment' group by contractor_id
  union all select contractor_id, 'event', count(*) from public.events where sample_data_key = 'aymero_sample_data:event' group by contractor_id
), manifest_evidence as (
  select
    settings.contractor_id,
    settings.sample_workspace ->> 'status' as manifest_status,
    settings.sample_workspace ->> 'identifier' as manifest_identifier,
    settings.sample_workspace ->> 'version' as manifest_version,
    (select count(*) from jsonb_object_keys(coalesce(settings.sample_workspace -> 'records', '{}'::jsonb))) as manifest_record_keys
  from public.company_settings as settings
  where settings.sample_workspace <> '{}'::jsonb
), contractor_ids as (
  select contractor_id from sample_counts union select contractor_id from manifest_evidence
)
select
  contractor_ids.contractor_id,
  manifest_evidence.manifest_status,
  manifest_evidence.manifest_identifier,
  manifest_evidence.manifest_version,
  manifest_evidence.manifest_record_keys,
  coalesce(jsonb_object_agg(sample_counts.entity_key, sample_counts.row_count) filter (where sample_counts.entity_key is not null), '{}'::jsonb) as exact_sample_key_counts
from contractor_ids
left join manifest_evidence using (contractor_id)
left join sample_counts using (contractor_id)
group by contractor_ids.contractor_id, manifest_evidence.manifest_status, manifest_evidence.manifest_identifier, manifest_evidence.manifest_version, manifest_evidence.manifest_record_keys
order by contractor_ids.contractor_id;

-- Query 13 — Invoice, Contract, and Estimate RLS state and exact policies.
-- Migrations: all three 20260721 RLS files.
-- FULLY PRESENT: RLS enabled on each table; Invoice has exact CRUD policies;
-- Contract and Estimate have exact authenticated DELETE policies; shared helper
-- matches Query 03.
-- PARTIAL/ABSENT: disabled RLS or any missing/different role/command/predicate.
-- Absence: a table row with null policy fields means no policy exists and is meaningful.
with target_tables(table_name) as (
  values ('invoices'), ('contracts'), ('estimates')
)
select
  target_tables.table_name,
  table_record.relrowsecurity as rls_enabled,
  table_record.relforcerowsecurity as force_rls,
  policy_record.policyname,
  policy_record.permissive,
  policy_record.roles,
  policy_record.cmd,
  policy_record.qual,
  policy_record.with_check
from target_tables
join pg_class as table_record on table_record.relname = target_tables.table_name
join pg_namespace as namespace_record on namespace_record.oid = table_record.relnamespace and namespace_record.nspname = 'public'
left join pg_policies as policy_record on policy_record.schemaname = 'public' and policy_record.tablename = target_tables.table_name
order by target_tables.table_name, policy_record.policyname;

-- Query 14 — Accepted payment-method JSON metadata, check, and row invariant.
-- Migration: 20260725_add_company_accepted_payment_methods.sql.
-- FULLY PRESENT: JSONB NOT NULL with exact default; named validated CHECK matches;
-- invalid_shape_rows=0.
-- PARTIAL/ABSENT: missing/different metadata/check or invalid rows>0.
-- Absence: zero settings rows is meaningful and vacuously satisfies only the data invariant.
with column_evidence as (
  select jsonb_build_object('type', data_type, 'udt', udt_name, 'nullable', is_nullable, 'default', column_default) as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'company_settings' and column_name = 'accepted_payment_methods'
), constraint_evidence as (
  select jsonb_agg(jsonb_build_object(
    'name', constraint_record.conname,
    'validated', constraint_record.convalidated,
    'definition', pg_get_constraintdef(constraint_record.oid, true)
  )) as value
  from pg_constraint as constraint_record
  where constraint_record.conrelid = 'public.company_settings'::regclass
    and constraint_record.conname = 'company_settings_accepted_payment_methods_shape_check'
)
select
  (select value from column_evidence) as column_metadata,
  (select value from constraint_evidence) as shape_constraint,
  count(*) filter (
    where jsonb_typeof(accepted_payment_methods) is distinct from 'object'
       or jsonb_typeof(accepted_payment_methods -> 'methods') is distinct from 'array'
       or jsonb_typeof(accepted_payment_methods -> 'otherLabel') is distinct from 'string'
  ) as invalid_shape_rows,
  count(*) as settings_rows
from public.company_settings;

-- Query 15 — Project public-portal token metadata, population, uniqueness, ACL.
-- Migration: 20260812_add_public_client_portal_tokens.sql.
-- FULLY PRESENT: text NOT NULL with generated UUID-without-hyphens default;
-- exact unique index; blank_or_null=0; duplicate_groups=0; anon has no table
-- privileges.
-- PARTIAL/ABSENT: any mismatch or violation count>0.
-- Absence: zero Project rows validly satisfies population/uniqueness but does
-- not replace metadata/ACL evidence.
with column_evidence as (
  select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default) as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'projects' and column_name = 'public_portal_token'
), index_evidence as (
  select jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef)) as value
  from pg_indexes
  where schemaname = 'public' and tablename = 'projects' and indexname = 'projects_public_portal_token_idx'
), duplicate_evidence as (
  select count(*) as duplicate_groups
  from (select public_portal_token from public.projects group by public_portal_token having count(*) > 1) as duplicates
), inspected_privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
select
  (select value from column_evidence) as column_metadata,
  (select value from index_evidence) as unique_index,
  count(*) filter (where public_portal_token is null or btrim(public_portal_token) = '') as blank_or_null_tokens,
  (select duplicate_groups from duplicate_evidence) as duplicate_token_groups,
  (select jsonb_object_agg(privilege_name, has_table_privilege('anon', 'public.projects', privilege_name)) from inspected_privileges) as anon_privileges,
  count(*) as project_rows
from public.projects;

-- Query 16 — Estimate public-share token metadata, population, uniqueness, ACL.
-- Migration: 20260816_add_public_estimate_share_tokens.sql.
-- FULLY PRESENT: text NOT NULL with generated UUID-without-hyphens default;
-- exact unique index; blank_or_null=0; duplicate_groups=0; anon has no table
-- privileges.
-- PARTIAL/ABSENT: any mismatch or violation count>0.
-- Absence: zero Estimate rows validly satisfies population/uniqueness but does
-- not replace metadata/ACL evidence.
with column_evidence as (
  select jsonb_build_object('type', data_type, 'nullable', is_nullable, 'default', column_default) as value
  from information_schema.columns
  where table_schema = 'public' and table_name = 'estimates' and column_name = 'public_share_token'
), index_evidence as (
  select jsonb_agg(jsonb_build_object('name', indexname, 'definition', indexdef)) as value
  from pg_indexes
  where schemaname = 'public' and tablename = 'estimates' and indexname = 'estimates_public_share_token_idx'
), duplicate_evidence as (
  select count(*) as duplicate_groups
  from (select public_share_token from public.estimates group by public_share_token having count(*) > 1) as duplicates
), inspected_privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
select
  (select value from column_evidence) as column_metadata,
  (select value from index_evidence) as unique_index,
  count(*) filter (where public_share_token is null or btrim(public_share_token) = '') as blank_or_null_tokens,
  (select duplicate_groups from duplicate_evidence) as duplicate_token_groups,
  (select jsonb_object_agg(privilege_name, has_table_privilege('anon', 'public.estimates', privilege_name)) from inspected_privileges) as anon_privileges,
  count(*) as estimate_rows
from public.estimates;

-- Query 17 — Final unresolved Payments column metadata only.
-- Migration: 20260624_enable_payments_supabase_beta.sql.
-- FULLY PRESENT: amount is numeric/NOT NULL/default 0; payment_date is date,
-- nullable, and defaults to CURRENT_DATE; status uses public.payment_status,
-- is NOT NULL, and defaults to recorded. Queries 03–04 already proved every
-- other schema/security/backfill effect, so this intentionally returns only
-- these three column definitions.
-- PARTIAL/ABSENT: any missing row or different type/nullability/default.
-- Absence: fewer than three rows is meaningful and leaves the migration partial.
select
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'payments'
  and column_name in ('amount', 'payment_date', 'status')
order by case column_name
  when 'amount' then 1
  when 'payment_date' then 2
  when 'status' then 3
  else 4
end;
