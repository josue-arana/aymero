# Production database reconciliation

## Decision

Sprint 3.44F stops at **NO-GO**. No production migration history, schema, billing data, Stripe configuration, or Edge Function was changed.

The linked production schema proves that most historical migration effects exist even though their versions are missing from `supabase_migrations.schema_migrations`. It also proves that at least one effect does not exist: `company_settings.simple_mode` from `20260628_add_simple_mode_to_company_settings.sql` is absent, while the later `analytics_mode` is present. Therefore bulk `migration repair`, `db push --include-all`, or a filename-only reconciliation would make history less truthful.

The next evidence step is to run the read-only [production reconciliation audit](./PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql) in Supabase SQL Editor and retain its output outside source control. Until the exact policies, grants, constraints, triggers, migration names, account-specific rows, and Stripe IDs are reviewed, historical filenames must remain unchanged.

## Evidence captured on August 28, 2026

Read-only commands and probes:

- `supabase migration list --linked`: only remote versions `20260622` and `20260828` are recorded.
- `supabase db push --linked --dry-run`: fails with `LegacyDbPushMissingRemoteError` and proposes every unrecorded migration before `20260828`.
- `supabase gen types typescript --linked --schema public`: confirms production tables, columns, nullability represented by the generated Row/Insert shapes, functions, and foreign-key relationships.
- `supabase inspect db index-stats --linked`: confirms billing uniqueness and lookup indexes plus the sample-workspace, token, and CRM indexes described below.
- `supabase inspect db table-stats --linked`: estimates 1 billing Customer row, 1 Subscription row, and 10 webhook Event rows.
- `supabase db lint --linked --schema public --level warning`: reports no schema errors.
- Anonymous REST `SELECT` probes return HTTP 401 / PostgreSQL `42501 permission denied` for all three billing tables.
- A schema-only `supabase db dump` could not run because Docker is unavailable. The browser fallback was also unavailable, so direct catalog queries were not fabricated or replaced with assumptions.

## Full local migration inventory

`Remote` refers only to the version ledger, not schema reality. `Production evidence` is deliberately conservative: a migration containing unverified policy, grant, constraint, trigger, or data work is not classified fully applied.

| Version | Migration | Purpose | Duplicate | Remote | Production evidence | Classification |
| --- | --- | --- | --- | --- | --- | --- |
| `20260622` | `20260622_create_miguel_contractor_profile.sql` | Account-specific contractor insert | 3 files | Present, exact name not yet queried | Contractors exist; target row not queried | Ambiguous |
| `20260622` | `20260622_enable_self_service_beta_onboarding.sql` | Authenticated onboarding function and execute grant | 3 files | Ambiguous shared version | Function signature exists; body/security/grant unverified | Partially applied |
| `20260622` | `20260622_link_miguel_contractor_membership.sql` | Account-specific auth membership insert | 3 files | Ambiguous shared version | Membership table exists; target row not queried | Ambiguous |
| `20260624` | `20260624_enable_payments_supabase_beta.sql` | Payments columns, FKs, indexes, backfill, RLS | No | Missing | Table/columns and eight indexes exist; policies/backfill unverified | Partially applied |
| `20260625` | `20260625_enable_events_supabase_beta.sql` | Event scheduling columns, backfill, indexes, RLS | No | Missing | Columns and six indexes exist; policies/backfill unverified | Partially applied |
| `20260628` | `20260628_add_simple_mode_to_company_settings.sql` | Add `simple_mode` | 4 files | Missing | `simple_mode` is absent | Not applied; later model supersedes it |
| `20260628` | `20260628_enable_project_photos_storage_beta.sql` | Private photo bucket and baseline RLS | 4 files | Missing | Photo table exists; bucket/policies not queried | Partially applied |
| `20260628` | `20260628_fix_project_photos_identity_rls.sql` | Final uploader-aware photo helpers and policies | 4 files | Missing | `can_assign_project_photo_uploader` exists; policy predicates unverified | Partially applied |
| `20260628` | `20260628_fix_project_photos_rls.sql` | Earlier photo ownership-policy fix | 4 files | Missing | Shared helpers exist; final policy version is ambiguous | Ambiguous/superseded |
| `20260630` | `20260630_add_analytics_mode_to_company_settings.sql` | Add/backfill non-null `analytics_mode` | No | Missing | Non-null/default-capable column exists; historical backfill unverified | Partially applied |
| `20260707` | `20260707_add_client_language_preferences.sql` | Lead/client language columns and checks | 2 files | Missing | Both columns exist; checks unverified | Partially applied |
| `20260707` | `20260707_add_estimate_language.sql` | Estimate language column and check | 2 files | Missing | Column exists; check unverified | Partially applied |
| `20260718` | `20260718_add_premium_onboarding_state.sql` | Premium onboarding fields, checks, and backfill | No | Missing | All fields exist; checks/backfill unverified | Partially applied |
| `20260719` | `20260719_add_sample_workspace_manifest.sql` | Manifest/sample keys and unique partial indexes | 2 files | Missing | Manifest, keys, and all seven indexes exist | Applied with high confidence |
| `20260719` | `20260719_connect_sample_workspace_journey.sql` | Estimate→lead relationship and invoice sample key | 2 files | Missing | Columns, FK relationship, and both indexes exist | Applied with high confidence |
| `20260721` | `20260721_enable_contracts_delete_rls.sql` | Contractor-scoped Contract DELETE policy | 3 files | Missing | Table/function exist; actual policy unverified | Ambiguous |
| `20260721` | `20260721_enable_estimates_delete_rls.sql` | Contractor-scoped Estimate DELETE policy | 3 files | Missing | Table/function exist; actual policy unverified | Ambiguous |
| `20260721` | `20260721_enable_invoices_supabase_rls.sql` | Invoice SELECT/INSERT/UPDATE/DELETE policies | 3 files | Missing | Table/function exist; actual policies unverified | Ambiguous |
| `20260725` | `20260725_add_company_accepted_payment_methods.sql` | JSON payment-method configuration and shape check | No | Missing | Non-null/default-capable JSON column exists; check unverified | Partially applied |
| `20260726` | `20260726_add_invoice_customer_notes.sql` | Invoice customer-facing note | No | Missing | Nullable text column exists | Applied with high confidence |
| `20260812` | `20260812_add_public_client_portal_tokens.sql` | Non-null Project portal token, unique index, anon revoke | No | Missing | Column/index exist; exact default/grant require catalog output | Partially applied |
| `20260816` | `20260816_add_public_estimate_share_tokens.sql` | Non-null Estimate share token, unique index, anon revoke | No | Missing | Column/index exist; exact default/grant require catalog output | Partially applied |
| `20260826` | `20260826_add_saas_billing_foundation.sql` | Billing tables, constraints, indexes, RLS, grants, triggers | No | Missing | Tables/columns/FKs/unique and lookup indexes exist; anonymous reads denied; checks, policies, authenticated grants, triggers unverified | Partially applied |
| `20260828` | `20260828_add_billing_subscription_cancel_at.sql` | Add nullable `cancel_at` | No | Present | Nullable timestamp field exists and is used successfully | Applied with high confidence |

## Duplicate-version findings

Every duplicate group contains separate SQL, not duplicate copies:

- `20260622`: contractor data insert, onboarding function, and membership data insert. Only one remote ledger row can use this version. The exact remote `name` and both account-specific rows must be queried before normalization.
- `20260628`: obsolete `simple_mode`, storage setup, and two sequential photo-policy fixes. Filename sorting does not prove the intended final policy. The current helper function alone cannot distinguish which policy body is active.
- `20260707`: separate client/lead and estimate language migrations.
- `20260719`: manifest must precede the connected journey.
- `20260721`: three independent table-policy migrations.

The likely normalization is to preserve the one legitimately recorded `20260622` file, assign unique full timestamps to separately audited migrations, and exclude or supersede obsolete SQL through a documented baseline/corrective migration. That is a recommendation, not an action taken. Renaming now would create new versions that the CLI would attempt to run, and marking them applied now would overstate the evidence.

## Remote ledger and drift

| Layer | Finding | Drift class |
| --- | --- | --- |
| Local history | 24 files but only 15 distinct versions; five duplicate groups | Duplicate-version issue / blocker |
| Remote ledger | Only `20260622` and `20260828`; exact `20260622` name not available from CLI list | Missing history / ambiguous mapping |
| Production schema | Most later columns, tables, relationships, and indexes exist | Strong evidence of manual application |
| `simple_mode` | Intended locally, absent remotely, later `analytics_mode` present | Actual schema mismatch / superseded intent |
| RLS/grants/checks/triggers | Source intent known; complete production catalog evidence not yet captured | Ambiguous / blocker |
| Billing data | Rows exist but schema stores no `livemode` or payload | Mode classification blocker |
| Dry run | Fails before producing an explainable plan | Production blocker |

No remote entry is currently known to be unexpected: both versions have local files. However, version `20260622` cannot be mapped truthfully to one of its three files until its remote `name` is queried.

## Billing production schema

Actual generated production shapes confirm:

- `billing_customers`: `id`, `contractor_id`, `stripe_customer_id`, `created_at`, `updated_at`; contractor and Stripe Customer uniqueness indexes exist.
- `billing_subscriptions`: one-to-many contractor relationship; Stripe Subscription unique index; plan/status/Price/payment fields; period fields; `cancel_at_period_end`; nullable `cancel_at`; contractor and contractor/status indexes.
- `billing_webhook_events`: Stripe Event ID primary key; event type; created/processed timestamps; processed-at index; no relationship to CRM tables.
- Billing foreign keys point from billing rows to `contractors`. No production-generated relationship shows a CRM operational table pointing to a billing table. Deleting reviewed billing rows therefore has no outbound cascade into Leads, Clients, Estimates, Contracts, Projects, Invoices, CRM Payments, Events, auth users, or Client Portal data.
- Anonymous reads of all three billing tables are denied with PostgreSQL `42501`.

The read-only audit must still confirm actual RLS enablement, policy predicates, authenticated write privileges, service-role privileges, billing check constraints, and updated-at triggers. Source code remains secure: Checkout and Portal resolve Owner/Admin membership server-side; webhook service-role access occurs only after Stripe signature validation; the browser supplies no contractor, Customer, Subscription, or Price identifier for mutation.

## Edge Function compatibility

The three billing functions reference production fields that exist:

- `create-billing-checkout`: billing Customer lookup/insert and Subscription status lookup are schema-compatible; unique contractor mapping and active-status indexes exist.
- `create-billing-portal`: contractor-scoped Customer lookup is schema-compatible.
- `stripe-billing-webhook`: Event ledger insert/update/delete and Subscription upsert, including `cancel_at`, are schema-compatible; Event and Subscription conflict keys exist.

No Edge Function change is justified by the schema evidence collected in this sprint.

## Sandbox billing classification

Production table statistics currently estimate:

- 1 `billing_customers` row;
- 1 `billing_subscriptions` row;
- 10 `billing_webhook_events` rows.

These are consistent with the documented sandbox exercise, but are not sufficient proof. Stripe IDs do not encode mode reliably, the database stores no `livemode`, and the webhook ledger stores no payload. Each exact Customer, Subscription, Price, and Event must be opened in Stripe and verified as `livemode=false`. If any object is missing or ambiguous, cleanup must stop.

After classification, use the rollback-first [sandbox billing cleanup SQL](./STRIPE_SANDBOX_BILLING_CLEANUP.sql). Its temporary review tables require exact IDs and evidence; it fails closed when any production row is unclassified; every DELETE joins an exact reviewed ID; and its default outcome is `rollback`.

## Reconciliation actions taken

- Captured linked ledger and failed dry-run before-state.
- Generated actual public schema types.
- Captured actual production index and table statistics.
- Ran production schema lint successfully.
- Verified anonymous billing-table denial without attempting a write.
- Added read-only catalog/data audit SQL and rollback-first cleanup SQL.
- Did **not** rename migrations.
- Did **not** run `migration repair`.
- Did **not** run an actual `db push`.
- Did **not** delete or update production data.

Before and after migration status are therefore intentionally identical. A truthful repair plan requires the missing SQL Editor evidence first.

## Required next evidence and repair sequence

1. Run `PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql` in production SQL Editor and export every result set privately.
2. Classify each partial/ambiguous inventory row using full constraint, policy, grant, trigger, function, and data evidence.
3. Determine the exact remote name behind version `20260622`.
4. Design the unique-version normalization in a dedicated reviewed commit. Preserve effective chronological order, especially the final project-photo policy.
5. For partial migrations, create narrow idempotent corrective SQL; do not claim the historical migration was complete first.
6. Handle absent/superseded `simple_mode` explicitly through a documented baseline or archive decision; never apply it accidentally and never falsely mark it present.
7. Use `supabase migration repair <one-version> --status applied --linked` only after the full effect of that exact normalized migration is proven.
8. Run `supabase migration list --linked` after each individually justified repair.
9. Require `supabase db push --linked --dry-run` to finish successfully with no unexplained migration before any live Stripe secret change.

## Stripe live cutover preflight

The next sprint may proceed only after reconciliation and sandbox classification are complete:

- clean, explainable linked migration dry run;
- production billing schema/RLS/grants match repository intent;
- every billing row is proven sandbox-only, exported, and approved for cleanup;
- live Aymero Managed Product and licensed $100 USD monthly Price exist;
- live server key, live webhook signing secret, and live Price secret are ready;
- live Customer Portal is configured for payment methods/history and end-of-period cancellation only;
- `AYMERO_APP_URL=https://app.aymero.co` is confirmed;
- Checkout, Portal, and webhook Edge Functions plus the frontend are ready to deploy;
- no real Checkout starts during this reconciliation sprint.

Production Stripe billing remains **NO-GO** until every item above passes.
