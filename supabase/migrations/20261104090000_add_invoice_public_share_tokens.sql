-- Opaque bearer tokens resolve one customer-facing Invoice through the
-- super-endpoint. Anonymous users do not receive direct table access.
alter table public.invoices
  add column if not exists public_share_token text;

create unique index if not exists invoices_public_share_token_idx
  on public.invoices (public_share_token)
  where public_share_token is not null;

comment on column public.invoices.public_share_token is
  'Opaque bearer token used to resolve one public Invoice. Never use this token for general CRM table access.';
