-- MANUAL REVIEW REQUIRED — DO NOT RUN AUTOMATICALLY
--
-- This rollback-first template removes only Stripe objects whose exact IDs were
-- independently verified in Stripe as `livemode=false`. It never deletes a
-- contractor, member, CRM record, invoice, CRM payment, auth user, or storage row.
--
-- Required before use:
-- 1. Run PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql and export all billing rows.
-- 2. Open every Customer, Subscription/Price, and Event in Stripe test mode.
-- 3. Record evidence that every object is `livemode=false`.
-- 4. Add every reviewed ID using the commented INSERT shapes below.
-- 5. Run this file with `rollback` unchanged and inspect all counts.
-- 6. Only during an approved maintenance window may `rollback` be replaced by
--    `commit`, after a fresh restricted export and peer review.

begin;

-- Capture pre-delete counts in the same transaction.
select 'billing_customers' as table_name, count(*) as rows_before
from public.billing_customers
union all
select 'billing_subscriptions', count(*)
from public.billing_subscriptions
union all
select 'billing_webhook_events', count(*)
from public.billing_webhook_events
order by table_name;

create temporary table reviewed_sandbox_customers (
  stripe_customer_id text primary key,
  evidence text not null check (btrim(evidence) <> '')
) on commit drop;

create temporary table reviewed_sandbox_subscriptions (
  stripe_subscription_id text primary key,
  evidence text not null check (btrim(evidence) <> '')
) on commit drop;

create temporary table reviewed_sandbox_webhook_events (
  stripe_event_id text primary key,
  evidence text not null check (btrim(evidence) <> '')
) on commit drop;

-- Add one row per exact Stripe object after independent mode verification.
-- Do not use prefixes, LIKE patterns, contractor-wide assumptions, or dates.
--
-- insert into reviewed_sandbox_customers values
--   ('cus_exact_id', 'Stripe Dashboard test mode: livemode=false; reviewed YYYY-MM-DD by NAME');
--
-- insert into reviewed_sandbox_subscriptions values
--   ('sub_exact_id', 'Stripe Dashboard test mode: subscription and Price livemode=false; reviewed YYYY-MM-DD by NAME');
--
-- insert into reviewed_sandbox_webhook_events values
--   ('evt_exact_id', 'Stripe Workbench event payload: livemode=false; reviewed YYYY-MM-DD by NAME');

-- Preview the exact matched rows. Save this result with the cleanup evidence.
select
  'customer' as object_type,
  customer.stripe_customer_id as stripe_object_id,
  customer.contractor_id,
  reviewed.evidence
from public.billing_customers as customer
join reviewed_sandbox_customers as reviewed
  on reviewed.stripe_customer_id = customer.stripe_customer_id
union all
select
  'subscription',
  subscription.stripe_subscription_id,
  subscription.contractor_id,
  reviewed.evidence
from public.billing_subscriptions as subscription
join reviewed_sandbox_subscriptions as reviewed
  on reviewed.stripe_subscription_id = subscription.stripe_subscription_id
union all
select
  'webhook_event',
  webhook_event.stripe_event_id,
  null::uuid,
  reviewed.evidence
from public.billing_webhook_events as webhook_event
join reviewed_sandbox_webhook_events as reviewed
  on reviewed.stripe_event_id = webhook_event.stripe_event_id
order by object_type, stripe_object_id;

-- Fail closed unless every production billing row is explicitly reviewed and
-- every reviewed ID still exists. This prevents partial or stale criteria.
do $$
begin
  if exists (
    select 1
    from public.billing_customers as customer
    where not exists (
      select 1
      from reviewed_sandbox_customers as reviewed
      where reviewed.stripe_customer_id = customer.stripe_customer_id
    )
  ) then
    raise exception 'Unclassified billing customer exists; cleanup stopped.';
  end if;

  if exists (
    select 1
    from reviewed_sandbox_customers as reviewed
    where not exists (
      select 1
      from public.billing_customers as customer
      where customer.stripe_customer_id = reviewed.stripe_customer_id
    )
  ) then
    raise exception 'Reviewed billing customer no longer matches production; cleanup stopped.';
  end if;

  if exists (
    select 1
    from public.billing_subscriptions as subscription
    where not exists (
      select 1
      from reviewed_sandbox_subscriptions as reviewed
      where reviewed.stripe_subscription_id = subscription.stripe_subscription_id
    )
  ) then
    raise exception 'Unclassified billing subscription exists; cleanup stopped.';
  end if;

  if exists (
    select 1
    from reviewed_sandbox_subscriptions as reviewed
    where not exists (
      select 1
      from public.billing_subscriptions as subscription
      where subscription.stripe_subscription_id = reviewed.stripe_subscription_id
    )
  ) then
    raise exception 'Reviewed billing subscription no longer matches production; cleanup stopped.';
  end if;

  if exists (
    select 1
    from public.billing_webhook_events as webhook_event
    where not exists (
      select 1
      from reviewed_sandbox_webhook_events as reviewed
      where reviewed.stripe_event_id = webhook_event.stripe_event_id
    )
  ) then
    raise exception 'Unclassified billing webhook event exists; cleanup stopped.';
  end if;

  if exists (
    select 1
    from reviewed_sandbox_webhook_events as reviewed
    where not exists (
      select 1
      from public.billing_webhook_events as webhook_event
      where webhook_event.stripe_event_id = reviewed.stripe_event_id
    )
  ) then
    raise exception 'Reviewed webhook event no longer matches production; cleanup stopped.';
  end if;
end $$;

-- Logical deletion order: historical Subscriptions, reusable Customer mapping,
-- then the independent Event ledger. Every DELETE uses an exact reviewed ID.
delete from public.billing_subscriptions as subscription
using reviewed_sandbox_subscriptions as reviewed
where subscription.stripe_subscription_id = reviewed.stripe_subscription_id;

delete from public.billing_customers as customer
using reviewed_sandbox_customers as reviewed
where customer.stripe_customer_id = reviewed.stripe_customer_id;

delete from public.billing_webhook_events as webhook_event
using reviewed_sandbox_webhook_events as reviewed
where webhook_event.stripe_event_id = reviewed.stripe_event_id;

select 'billing_customers' as table_name, count(*) as rows_after
from public.billing_customers
union all
select 'billing_subscriptions', count(*)
from public.billing_subscriptions
union all
select 'billing_webhook_events', count(*)
from public.billing_webhook_events
order by table_name;

-- Safe default. Replace with COMMIT only after an approved dry run, restricted
-- backup/export, exact Stripe mode evidence, and peer review.
rollback;
