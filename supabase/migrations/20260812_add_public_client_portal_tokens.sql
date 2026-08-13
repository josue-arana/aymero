-- Public Client Portal bearer tokens.
--
-- Anonymous visitors never receive direct SELECT access to CRM tables. The
-- public-client-portal Edge Function resolves this token with the service role,
-- applies the project/tenant boundary, and returns a reduced client-safe shape.

alter table public.projects
  add column if not exists public_portal_token text;

update public.projects
set public_portal_token = replace(gen_random_uuid()::text, '-', '')
where public_portal_token is null
   or btrim(public_portal_token) = '';

alter table public.projects
  alter column public_portal_token set default replace(gen_random_uuid()::text, '-', ''),
  alter column public_portal_token set not null;

create unique index if not exists projects_public_portal_token_idx
  on public.projects (public_portal_token);

comment on column public.projects.public_portal_token is
  'Opaque bearer token used to resolve one public Client Portal workspace. Never use this token for general CRM table access.';

-- Keep table privileges and existing authenticated RLS policies unchanged.
revoke all on table public.projects from anon;
