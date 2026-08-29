alter table public.estimates
  add column if not exists estimate_language text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_estimate_language_check'
  ) then
    alter table public.estimates
      add constraint estimates_estimate_language_check
      check (estimate_language in ('en', 'es') or estimate_language is null);
  end if;
end $$;
