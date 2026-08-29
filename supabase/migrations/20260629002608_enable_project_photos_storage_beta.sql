-- Enable contractor-scoped project photo metadata and private Supabase Storage
-- for the Project Workspace beta rollout.
--
-- This migration is idempotent:
-- - creates the private `project-photos` bucket with image-only restrictions
-- - enables contractor-member RLS on public.project_photos
-- - adds storage object policies that only allow authenticated active members
--   to access objects inside their own contractor_id/project_id paths
--
-- IMPORTANT:
-- Apply this migration before testing Project Workspace photo uploads.
-- Without the `project-photos` bucket, the app will show:
-- "Project photo storage is not set up yet."

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

alter table public.project_photos enable row level security;

drop policy if exists "beta_active_members_can_select_project_photos" on public.project_photos;
create policy "beta_active_members_can_select_project_photos"
  on public.project_photos
  for select
  using (
    archived_at is null
    and public.is_active_contractor_member(contractor_id)
  );

drop policy if exists "beta_active_members_can_insert_project_photos" on public.project_photos;
create policy "beta_active_members_can_insert_project_photos"
  on public.project_photos
  for insert
  with check (
    contractor_id is not null
    and project_id is not null
    and public.is_active_contractor_member(contractor_id)
  );

drop policy if exists "beta_active_members_can_update_project_photos" on public.project_photos;
create policy "beta_active_members_can_update_project_photos"
  on public.project_photos
  for update
  using (public.is_active_contractor_member(contractor_id))
  with check (
    contractor_id is not null
    and project_id is not null
    and public.is_active_contractor_member(contractor_id)
  );

drop policy if exists "beta_active_members_can_delete_project_photos" on public.project_photos;
create policy "beta_active_members_can_delete_project_photos"
  on public.project_photos
  for delete
  using (public.is_active_contractor_member(contractor_id));

update storage.buckets
set public = false,
    file_size_limit = 10485760,
    allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
where id = 'project-photos'
   or name = 'project-photos';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
select
  'project-photos',
  'project-photos',
  false,
  10485760,
  array['image/jpeg', 'image/png', 'image/webp']
where not exists (
  select 1
  from storage.buckets
  where id = 'project-photos'
     or name = 'project-photos'
);

drop policy if exists "beta_active_members_can_select_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_select_project_photo_objects"
  on storage.objects
  for select
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1
      from public.contractor_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.archived_at is null
        and cm.contractor_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "beta_active_members_can_insert_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_insert_project_photo_objects"
  on storage.objects
  for insert
  with check (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and exists (
      select 1
      from public.contractor_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.archived_at is null
        and cm.contractor_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "beta_active_members_can_update_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_update_project_photo_objects"
  on storage.objects
  for update
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1
      from public.contractor_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.archived_at is null
        and cm.contractor_id::text = (storage.foldername(name))[1]
    )
  )
  with check (
    bucket_id = 'project-photos'
    and array_length(storage.foldername(name), 1) >= 2
    and exists (
      select 1
      from public.contractor_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.archived_at is null
        and cm.contractor_id::text = (storage.foldername(name))[1]
    )
  );

drop policy if exists "beta_active_members_can_delete_project_photo_objects" on storage.objects;
create policy "beta_active_members_can_delete_project_photo_objects"
  on storage.objects
  for delete
  using (
    bucket_id = 'project-photos'
    and exists (
      select 1
      from public.contractor_members cm
      where cm.user_id = auth.uid()
        and cm.status = 'active'
        and cm.archived_at is null
        and cm.contractor_id::text = (storage.foldername(name))[1]
    )
  );
