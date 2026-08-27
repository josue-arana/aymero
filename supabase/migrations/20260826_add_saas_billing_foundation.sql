-- Aymero SaaS billing foundation.
--
-- Domain boundary:
--   billing_* records describe contractor businesses paying Aymero.
--   payments/invoices describe contractor customers paying contractors.
--
-- Stripe-backed rows are readable by active tenant members but are writable
-- only through trusted server-side code using the service role.

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

create table if not exists public.billing_customers (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  stripe_customer_id text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_customers_contractor_id_key unique (contractor_id),
  constraint billing_customers_stripe_customer_id_key unique (stripe_customer_id),
  constraint billing_customers_stripe_customer_id_check check (btrim(stripe_customer_id) <> '')
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references public.contractors(id) on delete cascade,
  stripe_subscription_id text not null,
  stripe_price_id text not null,
  plan_key text not null,
  status text not null,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  last_payment_status text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint billing_subscriptions_stripe_subscription_id_key unique (stripe_subscription_id),
  constraint billing_subscriptions_stripe_subscription_id_check check (btrim(stripe_subscription_id) <> ''),
  constraint billing_subscriptions_stripe_price_id_check check (btrim(stripe_price_id) <> ''),
  constraint billing_subscriptions_plan_key_check check (btrim(plan_key) <> ''),
  constraint billing_subscriptions_status_check check (
    status in (
      'incomplete',
      'incomplete_expired',
      'trialing',
      'active',
      'past_due',
      'canceled',
      'unpaid',
      'paused'
    )
  ),
  constraint billing_subscriptions_last_payment_status_check check (
    last_payment_status is null or last_payment_status in ('paid', 'failed')
  )
);

create table if not exists public.billing_webhook_events (
  stripe_event_id text primary key,
  event_type text not null,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint billing_webhook_events_stripe_event_id_check check (btrim(stripe_event_id) <> ''),
  constraint billing_webhook_events_event_type_check check (btrim(event_type) <> '')
);

create index if not exists billing_subscriptions_contractor_id_idx
  on public.billing_subscriptions (contractor_id);

create index if not exists billing_subscriptions_contractor_status_idx
  on public.billing_subscriptions (contractor_id, status);

create index if not exists billing_webhook_events_processed_at_idx
  on public.billing_webhook_events (processed_at);

drop trigger if exists set_billing_customers_updated_at on public.billing_customers;
create trigger set_billing_customers_updated_at
before update on public.billing_customers
for each row execute function public.set_updated_at();

drop trigger if exists set_billing_subscriptions_updated_at on public.billing_subscriptions;
create trigger set_billing_subscriptions_updated_at
before update on public.billing_subscriptions
for each row execute function public.set_updated_at();

alter table public.billing_customers enable row level security;
alter table public.billing_subscriptions enable row level security;
alter table public.billing_webhook_events enable row level security;

drop policy if exists "active_members_can_read_billing_customers" on public.billing_customers;
create policy "active_members_can_read_billing_customers"
  on public.billing_customers
  for select
  to authenticated
  using (public.is_active_contractor_member(contractor_id));

drop policy if exists "active_members_can_read_billing_subscriptions" on public.billing_subscriptions;
create policy "active_members_can_read_billing_subscriptions"
  on public.billing_subscriptions
  for select
  to authenticated
  using (public.is_active_contractor_member(contractor_id));

-- There are intentionally no authenticated insert/update/delete policies on
-- billing tables and no client policy at all on the webhook idempotency ledger.
revoke all on table public.billing_customers from anon;
revoke all on table public.billing_subscriptions from anon;
revoke all on table public.billing_webhook_events from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.billing_customers from authenticated;
revoke insert, update, delete, truncate, references, trigger on table public.billing_subscriptions from authenticated;
grant select on table public.billing_customers to authenticated;
grant select on table public.billing_subscriptions to authenticated;

comment on table public.billing_customers is
  'One Aymero SaaS Stripe Customer per contractor business. Separate from contractor/customer commerce.';

comment on table public.billing_subscriptions is
  'Stripe subscription state for contractor businesses paying Aymero. Webhook synchronized; never client-written.';

comment on table public.billing_webhook_events is
  'Private Stripe webhook idempotency ledger. Accessible only to trusted server-side service-role code.';
