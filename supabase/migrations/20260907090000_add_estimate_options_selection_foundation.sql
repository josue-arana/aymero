-- Sprint 3.48B: preserve alternative estimate identity and explicit project selection.
-- This migration is intentionally additive and has not been applied remotely.

alter table public.estimates
  add column if not exists option_name text;

alter table public.projects
  add column if not exists selected_estimate_id uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'projects_selected_estimate_id_fkey'
      and conrelid = 'public.projects'::regclass
  ) then
    alter table public.projects
      add constraint projects_selected_estimate_id_fkey
      foreign key (selected_estimate_id)
      references public.estimates(id)
      on delete set null;
  end if;
end
$$;

create index if not exists idx_projects_selected_estimate_id
  on public.projects(selected_estimate_id);

comment on column public.estimates.option_name is
  'Optional contractor-entered commercial option label. Null preserves legacy single-estimate behavior.';

comment on column public.projects.selected_estimate_id is
  'Optional estimate designated as the project commercial basis. This does not imply client approval or contract signature.';
