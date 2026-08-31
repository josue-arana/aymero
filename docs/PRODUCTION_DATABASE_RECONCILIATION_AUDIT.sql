-- Sprint 3.44F production database reconciliation evidence.
-- READ ONLY: every statement in this file is a SELECT.
-- Run in the linked production project's Supabase SQL Editor and export the
-- results to a restricted location. Do not commit returned Stripe IDs or user data.

-- 1. Exact remote migration ledger, including names hidden by `migration list`.
select
  version,
  name,
  cardinality(statements) as statement_count
from supabase_migrations.schema_migrations
order by version, name;

-- 2. Public schema columns, types, defaults, and nullability for migration targets.
select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'contractors',
    'contractor_members',
    'company_settings',
    'clients',
    'leads',
    'estimates',
    'contracts',
    'projects',
    'project_photos',
    'invoices',
    'payments',
    'events',
    'billing_customers',
    'billing_subscriptions',
    'billing_webhook_events'
  )
order by table_name, ordinal_position;

-- 3. Primary, unique, foreign-key, and check constraints.
select
  constrained_table.relname as table_name,
  constraint_record.conname as constraint_name,
  constraint_record.contype as constraint_type,
  constraint_record.convalidated as is_validated,
  pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_constraint as constraint_record
join pg_class as constrained_table
  on constrained_table.oid = constraint_record.conrelid
join pg_namespace as table_schema
  on table_schema.oid = constrained_table.relnamespace
where table_schema.nspname = 'public'
  and constrained_table.relname in (
    'company_settings',
    'clients',
    'leads',
    'estimates',
    'contracts',
    'projects',
    'project_photos',
    'invoices',
    'payments',
    'events',
    'billing_customers',
    'billing_subscriptions',
    'billing_webhook_events'
  )
order by constrained_table.relname, constraint_record.conname;

-- 4. Exact index definitions, including partial predicates and uniqueness.
select
  tablename as table_name,
  indexname as index_name,
  indexdef as definition
from pg_indexes
where schemaname = 'public'
  and tablename in (
    'company_settings',
    'clients',
    'leads',
    'estimates',
    'contracts',
    'projects',
    'project_photos',
    'invoices',
    'payments',
    'events',
    'billing_customers',
    'billing_subscriptions',
    'billing_webhook_events'
  )
order by tablename, indexname;

-- 5. RLS enablement and force-RLS state.
select
  namespace_record.nspname as table_schema,
  table_record.relname as table_name,
  table_record.relrowsecurity as rls_enabled,
  table_record.relforcerowsecurity as force_rls
from pg_class as table_record
join pg_namespace as namespace_record
  on namespace_record.oid = table_record.relnamespace
where namespace_record.nspname in ('public', 'storage')
  and table_record.relkind = 'r'
  and (
    table_record.relname in (
      'payments',
      'events',
      'project_photos',
      'contracts',
      'estimates',
      'invoices',
      'billing_customers',
      'billing_subscriptions',
      'billing_webhook_events'
    )
    or (namespace_record.nspname = 'storage' and table_record.relname = 'objects')
  )
order by namespace_record.nspname, table_record.relname;

-- 6. Actual policies and predicates.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where (
  schemaname = 'public'
  and tablename in (
    'payments',
    'events',
    'project_photos',
    'contracts',
    'estimates',
    'invoices',
    'billing_customers',
    'billing_subscriptions',
    'billing_webhook_events'
  )
)
or (schemaname = 'storage' and tablename = 'objects')
order by schemaname, tablename, policyname;

-- 7. Effective billing-table privileges for browser and service roles.
with billing_tables(table_name) as (
  values
    ('billing_customers'),
    ('billing_subscriptions'),
    ('billing_webhook_events')
), inspected_roles(role_name) as (
  values ('anon'), ('authenticated'), ('service_role')
), inspected_privileges(privilege_name) as (
  values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')
)
select
  billing_tables.table_name,
  inspected_roles.role_name,
  inspected_privileges.privilege_name,
  has_table_privilege(
    inspected_roles.role_name,
    format('public.%I', billing_tables.table_name),
    inspected_privileges.privilege_name
  ) as is_granted
from billing_tables
cross join inspected_roles
cross join inspected_privileges
order by billing_tables.table_name, inspected_roles.role_name, inspected_privileges.privilege_name;

-- 8. Trigger and function evidence required by billing and onboarding.
select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('billing_customers', 'billing_subscriptions')
order by event_object_table, trigger_name, event_manipulation;

select
  routine_name,
  routine_type,
  security_type,
  data_type
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'complete_beta_contractor_onboarding',
    'is_active_contractor_member',
    'can_access_project_photo_project',
    'can_assign_project_photo_uploader',
    'can_access_project_photo_storage_path'
  )
order by routine_name;

-- 9. Account-specific data migrations. Keep this export restricted.
select id, company_name, owner_name, archived_at
from public.contractors
where company_name = 'Skinner Division Contractor'
  and owner_name = 'Miguel Giron';

select id, contractor_id, user_id, role, status, archived_at
from public.contractor_members
where user_id = '9efaa103-9a36-40af-a304-9f6ac88bdc2d'::uuid;

-- 10. Billing inventory for mode classification. Stripe IDs are identifiers,
-- not proof of mode. Verify every object in Stripe and record `livemode=false`.
select
  customer.contractor_id,
  customer.stripe_customer_id,
  customer.created_at,
  customer.updated_at
from public.billing_customers as customer
order by customer.created_at, customer.stripe_customer_id;

select
  subscription.contractor_id,
  subscription.stripe_subscription_id,
  subscription.stripe_price_id,
  subscription.plan_key,
  subscription.status,
  subscription.current_period_start,
  subscription.current_period_end,
  subscription.cancel_at_period_end,
  subscription.cancel_at,
  subscription.last_payment_status,
  subscription.created_at,
  subscription.updated_at
from public.billing_subscriptions as subscription
order by subscription.created_at, subscription.stripe_subscription_id;

select
  webhook_event.stripe_event_id,
  webhook_event.event_type,
  webhook_event.created_at,
  webhook_event.processed_at
from public.billing_webhook_events as webhook_event
order by webhook_event.created_at, webhook_event.stripe_event_id;

-- 11. Billing-to-CRM dependency direction. Expected: billing tables reference
-- contractors; no CRM operational table references a billing table.
select
  source_namespace.nspname as source_schema,
  source_table.relname as source_table,
  constraint_record.conname as constraint_name,
  target_namespace.nspname as target_schema,
  target_table.relname as target_table,
  pg_get_constraintdef(constraint_record.oid, true) as definition
from pg_constraint as constraint_record
join pg_class as source_table
  on source_table.oid = constraint_record.conrelid
join pg_namespace as source_namespace
  on source_namespace.oid = source_table.relnamespace
join pg_class as target_table
  on target_table.oid = constraint_record.confrelid
join pg_namespace as target_namespace
  on target_namespace.oid = target_table.relnamespace
where constraint_record.contype = 'f'
  and (
    source_table.relname like 'billing\_%' escape '\'
    or target_table.relname like 'billing\_%' escape '\'
  )
order by source_schema, source_table, constraint_name;
