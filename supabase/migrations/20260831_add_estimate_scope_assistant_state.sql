alter table public.estimates
  add column if not exists scope_assistant_state jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'estimates_scope_assistant_state_object_check'
      and conrelid = 'public.estimates'::regclass
  ) then
    alter table public.estimates
      add constraint estimates_scope_assistant_state_object_check
      check (jsonb_typeof(scope_assistant_state) = 'object');
  end if;
end
$$;

comment on column public.estimates.scope_assistant_state is
  'Optional versioned AI Scope Assistant workflow state. An empty object means the assistant has never been used.';
