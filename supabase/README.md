# Supabase Setup Notes

## Project Photos Storage

Project Workspace photo uploads use the private Supabase Storage bucket named `project-photos`.

Before testing or enabling photo uploads, apply:

- `supabase/migrations/20260628_enable_project_photos_storage_beta.sql`
- `supabase/migrations/20260628_fix_project_photos_rls.sql`
- `supabase/migrations/20260628_fix_project_photos_identity_rls.sql`

Those migrations:

- creates or updates the private `project-photos` bucket
- enables contractor-scoped RLS on `public.project_photos`
- adds contractor-scoped `storage.objects` policies for project photo files

## Aymero SaaS Billing

The contractor-to-Aymero Stripe subscription foundation is documented in
`docs/SAAS_BILLING_FOUNDATION.md`. Apply
`supabase/migrations/20260826_add_saas_billing_foundation.sql` before deploying
the dedicated Checkout and webhook Edge Functions.

If this migration has not been applied yet, the app will show:

- `Project photo storage is not set up yet.`
