-- Explicit contractor-configured payment methods shown on customer invoices.
-- Existing company_settings RLS continues to enforce contractor membership.

alter table public.company_settings
  add column if not exists accepted_payment_methods jsonb
  not null
  default '{"methods":[],"otherLabel":""}'::jsonb;

update public.company_settings
set accepted_payment_methods = '{"methods":[],"otherLabel":""}'::jsonb
where jsonb_typeof(accepted_payment_methods) is distinct from 'object'
  or jsonb_typeof(accepted_payment_methods -> 'methods') is distinct from 'array'
  or jsonb_typeof(accepted_payment_methods -> 'otherLabel') is distinct from 'string';

alter table public.company_settings
  drop constraint if exists company_settings_accepted_payment_methods_shape_check,
  add constraint company_settings_accepted_payment_methods_shape_check check (
    jsonb_typeof(accepted_payment_methods) = 'object'
    and jsonb_typeof(accepted_payment_methods -> 'methods') = 'array'
    and jsonb_typeof(accepted_payment_methods -> 'otherLabel') = 'string'
  );

comment on column public.company_settings.accepted_payment_methods is
  'Canonical invoice display configuration: {"methods": string[], "otherLabel": string}. Empty methods means no payment-method section is printed.';

notify pgrst, 'reload schema';
