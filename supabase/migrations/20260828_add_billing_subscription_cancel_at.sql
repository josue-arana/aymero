-- Persist Stripe's explicit scheduled cancellation timestamp.
--
-- Stripe can represent end-of-period cancellation with a future cancel_at
-- while cancel_at_period_end remains false. Final cancellation continues to
-- be determined by the authoritative subscription status.

alter table public.billing_subscriptions
  add column if not exists cancel_at timestamptz;

comment on column public.billing_subscriptions.cancel_at is
  'Stripe scheduled cancellation timestamp. Null when no explicit cancellation date is scheduled.';
