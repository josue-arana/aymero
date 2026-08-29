# Production database reconciliation

## Decision

Sprint 3.44F.1 remains **NO-GO** for production migration repair and Stripe live-mode cutover. Production already contains much of the intended schema, but the ledger has only two rows and the local directory has five duplicate-version groups. Schema presence does not prove account inserts, backfills, policy bodies, grants, or historical execution.

No production migration history, schema, data, Stripe object, secret, configuration, or Edge Function was changed. The executable future sequence is documented in [PRODUCTION_MIGRATION_REPAIR_PLAN.md](./PRODUCTION_MIGRATION_REPAIR_PLAN.md).

## Authoritative production evidence

The remote ledger records exactly:

| Version | Name | Statement count |
| --- | --- | ---: |
| `20260622` | `create_miguel_contractor_profile` | 1 |
| `20260828` | `add_billing_subscription_cancel_at` | 2 |

The linked dry run fails with `LegacyDbPushMissingRemoteError`. There are 24 local SQL files, 15 distinct versions, and duplicate groups at `20260622`, `20260628`, `20260707`, `20260719`, and `20260721`.

Read-only production evidence also confirms:

- `billing_customers`, `billing_subscriptions`, and `billing_webhook_events` have every expected column, constraint, index, foreign key, RLS setting, policy, privilege boundary, and billing updated-at trigger. `billing_subscriptions.cancel_at` is a nullable timestamp with time zone.
- Billing foreign keys point to `contractors`; no CRM table depends on a billing table.
- `is_active_contractor_member`, `complete_beta_contractor_onboarding`, `can_access_project_photo_project`, `can_access_project_photo_storage_path`, and `can_assign_project_photo_uploader` exist as `SECURITY DEFINER` functions. Existence does not by itself prove an exact body, configuration, owner, or ACL.
- The supplied Company Settings inventory includes `analytics_mode`, onboarding fields, `sample_workspace`, and `accepted_payment_methods`. `company_settings.simple_mode` is absent.
- The supplied CRM inventory confirms the named language, sample-data, relationship, customer-note, public-token, Payment, Event, and Project Photo columns. It confirms the documented CRM indexes and broad foreign-key direction.
- The database inventory is approximately 1 billing Customer row, 1 billing Subscription row, and 10 webhook Event rows. It does not store a `livemode` discriminator, so these rows are not yet proven test-mode objects.

The [read-only audit SQL](./PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql) remains the approved way to collect missing catalog and data evidence. It must not be replaced by inference.

## Classification rules

- `FULLY PRESENT`: every substantive schema, security, and migration-time data effect is proven, or the exact migration is already recorded remotely.
- `PARTIALLY PRESENT`: some schema effects are proven, but a non-data definition such as a check constraint or function ACL/body is not.
- `SUPERSEDED`: production intentionally reflects a later design and the older migration must not be applied or falsely recorded as current.
- `NOT PRESENT`: authoritative evidence proves the intended effect is absent and no later design supersedes it.
- `CANNOT DETERMINE`: a migration contains account data, backfills, storage configuration, RLS/grants, or other effects that the supplied read-only evidence cannot prove completely.

An `UPDATE`/`INSERT` migration is not classified as safely applied merely because its columns or indexes exist.

## Migration-by-migration reconciliation matrix

| Local filename | Version | Purpose | Duplicate group | Intended schema/data effects | Production evidence found | Production evidence missing | Classification | Safe to mark applied? | Rationale | Recommended action |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `20260622_create_miguel_contractor_profile.sql` | `20260622` | Seed Miguel contractor profile | `20260622` (3 files) | Idempotent account-specific `contractors` INSERT for Skinner Division Contractor / Miguel Giron | Exact remote ledger row: `20260622`, matching name, 1 statement | Current target row state is not supplied, but that is not needed to prove the recorded migration executed | `FULLY PRESENT` | YES — already recorded; no new repair | The remote identity matches this file exactly. Later row changes would not erase that ledger fact. | Preserve filename/version and remote row; do not repair or rename. |
| `20260622_enable_self_service_beta_onboarding.sql` | `20260622` | Self-service beta onboarding RPC | `20260622` (3 files) | Create/replace onboarding `SECURITY DEFINER` function; idempotent contractor/member/settings creation when called; revoke PUBLIC; grant authenticated EXECUTE; comment | Function name and `SECURITY DEFINER` state confirmed | Exact function body/signature result, owner, `search_path`, PUBLIC ACL, authenticated EXECUTE ACL, comment | `PARTIALLY PRESENT` | ONLY AFTER exact function definition and ACL evidence | Function existence is strong but not enough to prove its security and callable surface match the migration. | Query `pg_get_functiondef`, `proconfig`, owner, and ACL; reclassify only on exact match. |
| `20260622_link_miguel_contractor_membership.sql` | `20260622` | Link Miguel auth user to contractor | `20260622` (3 files) | Idempotent account-specific `contractor_members` INSERT for a hard-coded auth UUID and contractor identity | Required tables/relationship exist | Exact contractor row, auth user, membership row, role/status/archive state, and whether this migration ever inserted it | `CANNOT DETERMINE` | ONLY AFTER exact read-only account-row proof and human confirmation | The sibling remote version does not cover this separate SQL. Schema cannot prove an account insert. | Hold. Query exact IDs privately; never replay blindly or infer from the Miguel profile ledger row. |
| `20260624_enable_payments_supabase_beta.sql` | `20260624` | Enable Supabase-backed CRM Payments | — | Create/alter Payments fields/FKs/defaults; copy legacy `method` to `payment_method`; create 8 indexes; helper; RLS and CRUD policies | Payment columns (including old/new method fields), relationships, and expected indexes are confirmed; helper exists | Exact defaults/nullability, all policy roles/expressions, RLS catalog state, and backfill postcondition | `CANNOT DETERMINE` | ONLY AFTER policy/default catalog and data-backfill queries | Substantial schema exists, but the migration includes a data UPDATE and security behavior not proven by column inventory. | Run narrow read-only policy/default/backfill checks; use corrective SQL later if any effect differs. |
| `20260625_enable_events_supabase_beta.sql` | `20260625` | Enable Supabase-backed CRM Events | — | Add Event link/scheduling fields; backfill date/time/type from legacy fields; create 6 indexes; helper; RLS and CRUD policies | Old/new Event representations, relationships, and expected indexes confirmed; helper exists | Exact RLS/policies and each backfill postcondition | `CANNOT DETERMINE` | ONLY AFTER policy and data-backfill queries | Additive columns prove only part of a migration containing four UPDATE statements and policy work. | Hold and verify policies plus null/source-value backfill predicates read-only. |
| `20260628_add_simple_mode_to_company_settings.sql` | `20260628` | Add legacy Simple Mode flag | `20260628` (4 files) | Add non-null `simple_mode` Boolean with default false | `simple_mode` is absent; later `analytics_mode` exists | No evidence needed to establish absence; historical intent behind manual transition is not recorded | `SUPERSEDED` | NO | Applying or marking it now would claim an obsolete intermediate model that production does not contain. | Preserve in a legacy archive during approved normalization; never execute or repair it as present. |
| `20260628_enable_project_photos_storage_beta.sql` | `20260628` | Create private Project Photo storage and baseline RLS | `20260628` (4 files) | Helper; enable Project Photo RLS; CRUD policies; update/insert private bucket with size/MIME limits; Storage object policies | Project Photo table/columns/indexes and membership helper confirmed | Bucket row/settings, exact Project Photo policies, exact Storage policies, RLS catalog details | `CANNOT DETERMINE` | ONLY AFTER bucket and policy catalog evidence | This migration mutates Storage configuration and installs security policy; Project Photo schema is not proof. | Hold; inspect `storage.buckets`, `pg_policies`, roles, `qual`, and `with_check`. |
| `20260628_fix_project_photos_rls.sql` | `20260628` | First contractor/project ownership RLS fix | `20260628` (4 files) | Replace helpers and Project Photo/Storage policies; inline uploader/member validation; force bucket private | Shared access helpers exist | Exact historical policy body is not needed as current intent because a later uploader-aware fix replaces it | `SUPERSEDED` | NO | The later identity fix centralizes uploader validation in `can_assign_project_photo_uploader`, which exists in production. Recording both as current would obscure the final policy lineage. | Preserve in legacy archive; use the identity fix as the only canonical final-policy candidate after evidence. |
| `20260628_fix_project_photos_identity_rls.sql` | `20260628` | Final uploader-aware Project Photo RLS fix | `20260628` (4 files) | Create/replace three photo helpers plus member helper; RLS CRUD policies; Storage object policies; private bucket update | All named `SECURITY DEFINER` helpers, Project Photo columns, and indexes confirmed | Exact helper bodies/config/ACLs, bucket state, RLS flag, and every current Project Photo/Storage policy expression | `CANNOT DETERMINE` | ONLY AFTER exact final helper, bucket, and policy evidence | Helper existence identifies the later design but does not prove the policies actually call it or that Storage matches. | Hold; collect final policy definitions and bucket settings before reclassification. |
| `20260630_add_analytics_mode_to_company_settings.sql` | `20260630` | Replace legacy mode with Analytics Mode | — | Add nullable flag; conditional backfill from inverse `simple_mode` or true; set default; fill nulls; set NOT NULL; reload schema | `analytics_mode` exists and `simple_mode` is absent | Exact default/NOT NULL metadata and row-level backfill postcondition | `CANNOT DETERMINE` | ONLY AFTER metadata and zero-null data proof | The current column supports the later design, but its UPDATE statements cannot be inferred from existence. | Confirm `is_nullable`, default, and zero nulls; do not recreate `simple_mode`. |
| `20260707_add_client_language_preferences.sql` | `20260707` | Add Lead and Client language preferences | `20260707` (2 files) | Add `leads.client_language`, `clients.preferred_language`; add two en/es/null checks | Both columns confirmed | Named check constraints and definitions | `PARTIALLY PRESENT` | ONLY AFTER both check constraints match | No data backfill exists, but the constraints are substantive and not in the supplied evidence. | Query both checks; repair candidate only if exact. |
| `20260707_add_estimate_language.sql` | `20260707` | Add Estimate language | `20260707` (2 files) | Add `estimate_language`; add en/es/null check | Column confirmed | Named check constraint and definition | `PARTIALLY PRESENT` | ONLY AFTER the check constraint matches | Column presence alone does not prove allowed values are enforced. | Query the named check; repair candidate only if exact. |
| `20260718_add_premium_onboarding_state.sql` | `20260718` | Add premium onboarding and defaults | — | Add 7 settings fields/defaults; mark existing rows complete at step 5; add four checks; comments | Every intended column is confirmed | Exact defaults/nullability/checks/comments and historical-row UPDATE postcondition | `CANNOT DETERMINE` | ONLY AFTER catalog and data-backfill proof | The migration intentionally changes existing rows; current columns do not prove that state transition. | Hold; query constraints/defaults and identify any pre-migration row still not in the intended completed state. |
| `20260719_add_sample_workspace_manifest.sql` | `20260719` | Add sample-workspace manifest and entity keys | `20260719` (2 files) | Add settings JSON manifest; add sample keys on seven CRM tables; create seven partial unique contractor/key indexes; comment | Manifest column, all seven entity columns, and all seven partial unique indexes confirmed | Column comment is not material to runtime correctness | `FULLY PRESENT` | ONLY AFTER unique renumbering | All substantive effects are present and there is no migration-time data backfill, but the shared version cannot be repaired safely. | Rename to proposed canonical version in reviewed normalization, then repair that exact version individually. |
| `20260719_connect_sample_workspace_journey.sql` | `20260719` | Connect Estimate→Lead and Invoice sample identity | `20260719` (2 files) | Add Estimate lead column/FK; clear orphan legacy references; validate FK; add Invoice sample key; create two indexes | Columns, FK direction, and both expected indexes confirmed | Direct retained evidence for the migration-time orphan cleanup/data postcondition | `CANNOT DETERMINE` | ONLY AFTER read-only orphan/backfill proof and unique renumbering | The validated relationship is strong current-state evidence, but the brief requires conservative treatment of UPDATE migrations. | Query the exact orphan predicate; then decide whether it can be promoted or needs a baseline decision. |
| `20260721_enable_invoices_supabase_rls.sql` | `20260721` | Enable Invoice tenant RLS | `20260721` (3 files) | Helper; enable RLS; replace legacy policy; create Invoice SELECT/INSERT/UPDATE/DELETE policies | Invoice table and helper exist | Invoice `relrowsecurity`, roles, commands, `qual`, and `with_check` for all four policies | `CANNOT DETERMINE` | ONLY AFTER exact RLS/policy evidence | The supplied production security proof is billing-specific; it does not establish Invoice policies. | Query Invoice RLS and all policy expressions; keep chronological precedence before later delete-only fixes. |
| `20260721_enable_contracts_delete_rls.sql` | `20260721` | Add Contract DELETE policy | `20260721` (3 files) | Helper; enable Contract RLS; authenticated tenant-scoped DELETE policy | Contract table and helper exist | Contract RLS flag and exact DELETE policy role/expression | `CANNOT DETERMINE` | ONLY AFTER exact RLS/policy evidence | Table/function existence does not prove DELETE authorization. | Query `pg_class`/`pg_policies`; do not test by deleting data. |
| `20260721_enable_estimates_delete_rls.sql` | `20260721` | Add Estimate DELETE policy | `20260721` (3 files) | Helper; enable Estimate RLS; authenticated tenant-scoped DELETE policy | Estimate table and helper exist | Estimate RLS flag and exact DELETE policy role/expression | `CANNOT DETERMINE` | ONLY AFTER exact RLS/policy evidence | Table/function existence does not prove DELETE authorization. | Query `pg_class`/`pg_policies`; do not test by deleting data. |
| `20260725_add_company_accepted_payment_methods.sql` | `20260725` | Add canonical invoice payment-method config | — | Add non-null/default JSON; rewrite malformed values; add shape check; comment; schema reload | Column confirmed | Default/NOT NULL/check/comment and proof every row has canonical object/array/string shape | `CANNOT DETERMINE` | ONLY AFTER catalog and row-shape queries | A column does not prove the normalization UPDATE or shape constraint. | Hold; query metadata, constraint definition, and malformed-row count. |
| `20260726_add_invoice_customer_notes.sql` | `20260726` | Add customer-facing Invoice note | — | Add nullable text column; comment; schema reload | Nullable `customer_notes` column confirmed | Comment/reload side effect is not material to persistent runtime schema | `FULLY PRESENT` | YES — after normalization approval and fresh ledger snapshot | The sole substantive persistent effect is present and no data backfill/security change exists. | Candidate for later single-version repair; do not execute in this sprint. |
| `20260812_add_public_client_portal_tokens.sql` | `20260812` | Add Project public portal bearer tokens | — | Add token; populate every row; set generated default and NOT NULL; unique index; comment; revoke anon table access | Column and unique index confirmed | Default/NOT NULL, all rows populated/nonblank/unique, exact anon privileges | `CANNOT DETERMINE` | ONLY AFTER token data, metadata, and privilege proof | The token population UPDATE and anonymous revoke are security-critical and cannot be inferred from an index. | Hold; query counts/metadata/privileges without exposing token values. |
| `20260816_add_public_estimate_share_tokens.sql` | `20260816` | Add Estimate public share bearer tokens | — | Add token; populate every row; set generated default and NOT NULL; unique index; comment; revoke anon table access | Column and unique index confirmed | Default/NOT NULL, all rows populated/nonblank/unique, exact anon privileges | `CANNOT DETERMINE` | ONLY AFTER token data, metadata, and privilege proof | The token population UPDATE and anonymous revoke are security-critical and cannot be inferred from an index. | Hold; query counts/metadata/privileges without exposing token values. |
| `20260826_add_saas_billing_foundation.sql` | `20260826` | Create Aymero SaaS billing foundation | — | Member helper; 3 tables; all constraints/FKs/indexes/triggers; RLS; authenticated SELECT-only policies; anon/auth revokes; service-role boundary; comments | Every intended billing column, constraint, index, FK, RLS setting, policy, browser privilege boundary, service-role access, and updated-at trigger is confirmed | Table/function comments are not material; helper's existence/security is corroborated by the same production evidence set | `FULLY PRESENT` | YES — after normalization approval and fresh catalog snapshot | Unlike the CRM policy migrations, the supplied evidence explicitly proves the complete billing security and schema surface. | Candidate for later single-version repair; do not execute in this sprint. |
| `20260828_add_billing_subscription_cancel_at.sql` | `20260828` | Persist Stripe scheduled cancellation timestamp | — | Add nullable `cancel_at timestamptz`; comment | Exact remote ledger row with 2 statements; column exists as timestamp with time zone | None material | `FULLY PRESENT` | YES — already recorded; no new repair | Both ledger identity and schema effect match. | Preserve unchanged. |

## Classification totals

| Classification | Count |
| --- | ---: |
| `FULLY PRESENT` | 5 |
| `PARTIALLY PRESENT` | 3 |
| `SUPERSEDED` | 2 |
| `NOT PRESENT` | 0 |
| `CANNOT DETERMINE` | 14 |
| **Total** | **24** |

## Duplicate groups

| Version | Files | Remote correspondence | Resolution |
| --- | --- | --- | --- |
| `20260622` | Miguel profile; onboarding RPC; Miguel membership | Only `create_miguel_contractor_profile` corresponds to the remote row | Preserve that file/version. Give the other two unique timestamps only after their evidence disposition is approved. |
| `20260628` | `simple_mode`; photo storage; first photo fix; identity photo fix | None recorded | Archive `simple_mode` and the first photo fix as superseded. Canonically order storage before final identity fix; do not repair without bucket/policy evidence. |
| `20260707` | Client/Lead languages; Estimate language | None recorded | Renumber by repository creation time; prove each named check before repair. |
| `20260719` | Sample manifest; connected journey | None recorded | Renumber manifest before journey. Manifest is eligible; journey remains held for its UPDATE evidence. |
| `20260721` | Invoice RLS; Contract DELETE; Estimate DELETE | None recorded | Renumber Invoice first by actual creation time, then Contract and Estimate delete migrations. Prove policies separately. |

All five groups remain blockers in the current worktree. Renumbering is planned, not performed. The exact proposed identities are in the repair plan.

## Billing and Stripe isolation

Production's billing schema is compatible with the current Checkout, Customer Portal, and signature-verified webhook functions, including `cancel_at`. Anonymous callers have no billing-table privileges; authenticated users have SELECT only on Customers and Subscriptions; the webhook ledger has no browser policy; trusted service-role code has full access.

The approximately 1 Customer, 1 Subscription, and 10 Event rows are only believed to be sandbox artifacts. Database IDs do not prove Stripe mode, and no payload/`livemode` field is stored. The rollback-first [sandbox cleanup SQL](./STRIPE_SANDBOX_BILLING_CLEANUP.sql) remains blocked until each exact Stripe object is independently verified as `livemode=false`. No cleanup and no live configuration belongs in ledger reconciliation.

## Actions taken and forbidden

Completed in this sprint:

- Inspected all 24 local migration files in chronological order.
- Mapped every intended table/column/constraint/index/function/trigger/RLS/policy/grant/backfill/seed effect against the supplied production evidence.
- Classified every file using one required classification.
- Documented a canonical duplicate-version strategy and future single-version repair sequence.
- Updated deterministic, read-only repository verification.

Not performed:

- No migration file was renamed, moved, deleted, or executed.
- No `supabase migration repair` was run.
- No actual `supabase db push` was run and `--include-all` was not used.
- No production row, schema object, privilege, or ledger entry was mutated.
- No Stripe row/object was cleaned up.
- No live Stripe secret or configuration was changed.

## Exact next manual action

Review and approve the normalization mapping in [PRODUCTION_MIGRATION_REPAIR_PLAN.md](./PRODUCTION_MIGRATION_REPAIR_PLAN.md), especially the two legacy-archive decisions. Then run the existing read-only production audit and retain the missing catalog/data result sets. Migration repair cannot safely proceed yet.

Production Stripe billing remains **NO-GO** until ledger reconciliation, exact test-mode classification, and the existing live-cutover gates all pass.
