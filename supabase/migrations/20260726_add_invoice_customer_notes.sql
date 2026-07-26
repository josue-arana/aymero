-- Explicit customer-facing message printed on invoices.
-- Existing invoice RLS continues to enforce contractor ownership.

alter table public.invoices
  add column if not exists customer_notes text;

comment on column public.invoices.customer_notes is
  'Customer-facing invoice note. Internal CRM and activity notes must not be stored in this field.';

notify pgrst, 'reload schema';
