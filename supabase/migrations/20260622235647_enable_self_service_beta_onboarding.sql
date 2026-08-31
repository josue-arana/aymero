-- Enable self-service beta onboarding for authenticated users who do not yet
-- have an active contractor_members row.
--
-- This function creates:
-- - contractors
-- - contractor_members
-- - company_settings
--
-- It is idempotent for a given auth.uid(): if an active membership already
-- exists, the existing contractor and settings records are returned instead of
-- creating duplicates.

create or replace function public.complete_beta_contractor_onboarding(
  company_name_input text,
  owner_name_input text,
  phone_input text default null,
  business_email_input text default null,
  business_address_input text default null
)
returns table (
  contractor_id uuid,
  membership_id uuid,
  settings_id uuid,
  company_name text,
  owner_name text,
  phone text,
  business_email text,
  business_address text,
  onboarding_completed boolean,
  existing_membership boolean
)
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_user_id uuid;
  normalized_company_name text;
  normalized_owner_name text;
  normalized_phone text;
  normalized_business_email text;
  normalized_business_address text;
  authenticated_email text;
  fallback_membership_email text;
  existing_membership_row public.contractor_members%rowtype;
  existing_contractor_row public.contractors%rowtype;
  created_contractor public.contractors%rowtype;
  created_membership public.contractor_members%rowtype;
  existing_settings_row public.company_settings%rowtype;
begin
  current_user_id := auth.uid();

  if current_user_id is null then
    raise exception 'An authenticated user is required to complete onboarding.'
      using errcode = '42501';
  end if;

  normalized_company_name := nullif(trim(company_name_input), '');
  normalized_owner_name := nullif(trim(owner_name_input), '');
  normalized_phone := nullif(trim(phone_input), '');
  normalized_business_email := nullif(trim(business_email_input), '');
  normalized_business_address := nullif(trim(business_address_input), '');

  if normalized_company_name is null then
    raise exception 'Company name is required.'
      using errcode = 'P0001';
  end if;

  if normalized_owner_name is null then
    raise exception 'Owner name is required.'
      using errcode = 'P0001';
  end if;

  select au.email
    into authenticated_email
  from auth.users as au
  where au.id = current_user_id;

  normalized_business_email := coalesce(normalized_business_email, nullif(trim(authenticated_email), ''));
  fallback_membership_email := coalesce(
    normalized_business_email,
    nullif(trim(authenticated_email), ''),
    format('user-%s@contractorflow.local', current_user_id)
  );

  select cm.*
    into existing_membership_row
  from public.contractor_members as cm
  where cm.user_id = current_user_id
    and cm.status = 'active'
    and cm.archived_at is null
  order by cm.created_at asc
  limit 1;

  if existing_membership_row.id is not null then
    select contractor.*
      into existing_contractor_row
    from public.contractors as contractor
    where contractor.id = existing_membership_row.contractor_id
    limit 1;

    select cs.*
      into existing_settings_row
    from public.company_settings as cs
    where cs.contractor_id = existing_membership_row.contractor_id
    limit 1;

    if existing_settings_row.id is null then
      insert into public.company_settings (
        contractor_id,
        company_name,
        owner_name,
        phone,
        email,
        business_address,
        created_at,
        updated_at
      )
      values (
        existing_membership_row.contractor_id,
        coalesce(existing_contractor_row.company_name, normalized_company_name),
        coalesce(existing_contractor_row.owner_name, normalized_owner_name),
        coalesce(existing_contractor_row.phone, normalized_phone),
        coalesce(existing_contractor_row.email, normalized_business_email),
        coalesce(existing_contractor_row.business_address, normalized_business_address),
        now(),
        now()
      )
      returning * into existing_settings_row;
    elsif existing_settings_row.archived_at is not null then
      update public.company_settings
      set
        archived_at = null,
        company_name = coalesce(existing_contractor_row.company_name, normalized_company_name),
        owner_name = coalesce(existing_contractor_row.owner_name, normalized_owner_name),
        phone = coalesce(existing_contractor_row.phone, normalized_phone),
        email = coalesce(existing_contractor_row.email, normalized_business_email),
        business_address = coalesce(existing_contractor_row.business_address, normalized_business_address),
        updated_at = now()
      where id = existing_settings_row.id
      returning * into existing_settings_row;
    end if;

    return query
    select
      existing_membership_row.contractor_id,
      existing_membership_row.id,
      existing_settings_row.id,
      coalesce(existing_contractor_row.company_name, normalized_company_name),
      coalesce(existing_contractor_row.owner_name, normalized_owner_name),
      coalesce(existing_contractor_row.phone, normalized_phone),
      coalesce(existing_contractor_row.email, normalized_business_email),
      coalesce(existing_contractor_row.business_address, normalized_business_address),
      true,
      true;
    return;
  end if;

  insert into public.contractors (
    company_name,
    owner_name,
    phone,
    email,
    business_address,
    created_at,
    updated_at
  )
  values (
    normalized_company_name,
    normalized_owner_name,
    normalized_phone,
    normalized_business_email,
    normalized_business_address,
    now(),
    now()
  )
  returning * into created_contractor;

  insert into public.contractor_members (
    contractor_id,
    user_id,
    name,
    email,
    phone,
    role,
    status,
    joined_at,
    created_at,
    updated_at
  )
  values (
    created_contractor.id,
    current_user_id,
    normalized_owner_name,
    fallback_membership_email,
    normalized_phone,
    'owner',
    'active',
    now(),
    now(),
    now()
  )
  returning * into created_membership;

  insert into public.company_settings (
    contractor_id,
    company_name,
    owner_name,
    phone,
    email,
    business_address,
    created_at,
    updated_at
  )
  values (
    created_contractor.id,
    normalized_company_name,
    normalized_owner_name,
    normalized_phone,
    normalized_business_email,
    normalized_business_address,
    now(),
    now()
  )
  returning * into existing_settings_row;

  return query
  select
    created_contractor.id,
    created_membership.id,
    existing_settings_row.id,
    created_contractor.company_name,
    created_contractor.owner_name,
    created_contractor.phone,
    created_contractor.email,
    created_contractor.business_address,
    true,
    false;
end;
$$;

revoke all on function public.complete_beta_contractor_onboarding(text, text, text, text, text) from public;
grant execute on function public.complete_beta_contractor_onboarding(text, text, text, text, text) to authenticated;

comment on function public.complete_beta_contractor_onboarding(text, text, text, text, text)
  is 'Self-service beta onboarding helper. Creates a contractor, owner membership, and company settings for auth.uid() when no active membership exists yet.';
