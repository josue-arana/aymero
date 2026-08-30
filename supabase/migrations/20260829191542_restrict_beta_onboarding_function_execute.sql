-- Restrict the self-service onboarding SECURITY DEFINER function to trusted roles.
--
-- The historical onboarding migration intended authenticated-only browser access,
-- but production currently exposes EXECUTE through PostgreSQL's PUBLIC default.
-- Keep the function's internal auth.uid() guard unchanged and make the role
-- boundary explicit. service_role remains available for trusted server/admin use.

revoke execute on function public.complete_beta_contractor_onboarding(text, text, text, text, text)
  from public;

revoke execute on function public.complete_beta_contractor_onboarding(text, text, text, text, text)
  from anon;

grant execute on function public.complete_beta_contractor_onboarding(text, text, text, text, text)
  to authenticated;

grant execute on function public.complete_beta_contractor_onboarding(text, text, text, text, text)
  to service_role;
