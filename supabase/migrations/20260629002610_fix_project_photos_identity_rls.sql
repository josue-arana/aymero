-- Align project photo RLS with the app's real contractor ownership model.
--
-- Why this exists:
-- - working Supabase entities use contractor_members.user_id = auth.uid()
--   to prove contractor membership
-- - project photo uploads also include uploaded_by_member_id
-- - validating uploaded_by_member_id through an inline contractor_members lookup
--   adds another RLS dependency that can fail even when contractor/project ownership
--   is otherwise correct
--
-- Scope:
-- - photo-only helper functions
-- - public.project_photos policies only
-- - storage.objects policies for the private project-photos bucket only

create or replace function public.is_active_contractor_member(target_contractor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contractor_members cm
    where cm.contractor_id = target_contractor_id
      and cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.archived_at is null
  );
$$;

create or replace function public.can_access_project_photo_project(target_contractor_id uuid, target_project_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_contractor_id is not null
    and target_project_id is not null
    and public.is_active_contractor_member(target_contractor_id)
    and exists (
      select 1
      from public.projects p
      where p.id = target_project_id
        and p.contractor_id = target_contractor_id
    );
$$;

create or replace function public.can_assign_project_photo_uploader(target_contractor_id uuid, target_uploaded_by_member_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    target_uploaded_by_member_id is null
    or exists (
      select 1
      from public.contractor_members cm
      where cm.id = target_uploaded_by_member_id
        and cm.contractor_id = target_contractor_id
        and cm.status = 'active'
        and cm.archived_at is null
    );
$$;

comment on function public.can_assign_project_photo_uploader(uuid, uuid)
  is 'Returns true when uploaded_by_member_id is null or belongs to an active member of the same contractor.';

create or replace function public.can_access_project_photo_storage_path(path_contractor_id text, path_project_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.contractor_members cm
    join public.projects p
      on p.contractor_id = cm.contractor_id
    where cm.user_id = auth.uid()
      and cm.status = 'active'
      and cm.archived_at is null
      and cm.contractor_id::text = path_contractor_id
      and p.id::text = path_project_id
  );
$$;

alter table public.project_photos enable row level security;

drop policy if exists "beta_active_members_can_select_project_photos" on public.project_photos;
create policy "beta_active_members_can_select_project_photos"
  on public.project_photos
  for select
  using (
    archived_at is null
    and public.can_access_project_photo_project(contractor_id, project_id)
  );

drop policy if exists "beta_active_members_can_insert_project_photos" on public.project_photos;
create policy "beta_active_members_can_insert_project_photos"
  on public.project_photos
  for insert
  with check (
    contractor_id is not null
    and project_id is not null
    and public.can_access_project_photo_project(contractor_id, project_id)
    and public.can_assign_project_photo_uploader(contractor_id, uploaded_by_member_id)
  );

drop policy if exists "beta_active_members_can_update_project_photos" on public.project_photos;
create policy "beta_active_members_can_update_project_photos"
  on public.project_photos
  for update
  using (public.can_access_project_photo_project(contractor_id, project_id))
  with check (
    contractor_id is not null
    and project_id is not null
    and public.can_access_project_photo_project(contractor_id, project_id)
    and public.can_assign_project_photo_uploader(contractor_id, uploaded_by_member_id)
  );

drop policy if exists "beta_active_members_can_delete_project_photos" on public.project_photos;
create policy "beta_active_members_can_delete_project_photos"
  on public.project_photos
  for delete
  using (public.can_access_project_photo_project(contractor_id, project_id));

update storage.buckets
set public = false
where id = 'project-photos'
   or name = 'project-photos';

drop policy if exists "beta_active_members_can_select_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_select_project_photo_objects"
  on storage.objects
  for select
  using (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and public.can_access_project_photo_storage_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "beta_active_members_can_insert_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_insert_project_photo_objects"
  on storage.objects
  for insert
  with check (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and public.can_access_project_photo_storage_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "beta_active_members_can_update_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_update_project_photo_objects"
  on storage.objects
  for update
  using (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and public.can_access_project_photo_storage_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  )
  with check (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and public.can_access_project_photo_storage_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );

drop policy if exists "beta_active_members_can_delete_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_delete_project_photo_objects"
  on storage.objects
  for delete
  using (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and public.can_access_project_photo_storage_path(
      (storage.foldername(name))[1],
      (storage.foldername(name))[2]
    )
  );
