alter table public.company_settings
  add column if not exists simple_mode boolean not null default false;
