alter table public.leads
  add column if not exists client_language text;

alter table public.clients
  add column if not exists preferred_language text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_client_language_check'
  ) then
    alter table public.leads
      add constraint leads_client_language_check
      check (client_language is null or client_language in ('en', 'es'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'clients_preferred_language_check'
  ) then
    alter table public.clients
      add constraint clients_preferred_language_check
      check (preferred_language is null or preferred_language in ('en', 'es'));
  end if;
end $$;
