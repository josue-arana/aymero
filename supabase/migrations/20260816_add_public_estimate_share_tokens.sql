-- Public estimate bearer tokens.
--
-- Anonymous visitors never receive direct SELECT access to CRM tables. The
-- super-endpoint Edge Function resolves this token with the service role,
-- applies the estimate/tenant boundary, and returns a reduced client-safe shape.

alter table public.estimates
  add column if not exists public_share_token text;

update public.estimates
set public_share_token = replace(gen_random_uuid()::text, '-', '')
where public_share_token is null
   or btrim(public_share_token) = '';

alter table public.estimates
  alter column public_share_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column public_share_token set not null;

create unique index if not exists estimates_public_share_token_idx
  on public.estimates (public_share_token);

comment on column public.estimates.public_share_token is
  'Opaque bearer token used to resolve one public estimate. Never use this token for general CRM table access.';

-- Keep table privileges and existing authenticated RLS policies unchanged.
revoke all on table public.estimates from anon;
