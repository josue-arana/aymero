# Production database reconciliation

## Database migration reconciliation closure

**DATABASE MIGRATION RECONCILIATION COMPLETE.** Sprint 3.44F.6 applied the sole pending forward migration through `supabase db push --linked`. Production ACL and function integrity were then verified read-only, the migration ledger paired every active file, and the final linked dry run reported that the remote database is up to date.

### F.6 preflight and deployment

The preflight ledger showed `20260829191542` as the only local-only version. The exact dry-run proposal was:

```text
Would push these migrations:
 • 20260829191542_restrict_beta_onboarding_function_execute.sql
{"upToDate":false,"dryRun":true,"migrations":["20260829191542_restrict_beta_onboarding_function_execute.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

The real forward deployment command was `supabase db push --linked`. It exited `0`:

```text
Applying migration 20260829191542_restrict_beta_onboarding_function_execute.sql...
{"upToDate":false,"dryRun":false,"migrations":["20260829191542_restrict_beta_onboarding_function_execute.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

No migration repair or manual production SQL was used for this migration.

### Verified final ACL and function integrity

A read-only production transaction inspected `pg_proc`, `aclexplode`, `has_function_privilege`, and `pg_get_functiondef` without invoking the function:

| Check | Result |
| --- | --- |
| Function exists | true |
| PUBLIC can execute | false |
| anon can execute | false |
| authenticated can execute | true |
| service_role can execute | true |
| SECURITY DEFINER | true |
| Identity arguments | `company_name_input text, owner_name_input text, phone_input text, business_email_input text, business_address_input text` |
| Return structure | `TABLE(contractor_id uuid, membership_id uuid, settings_id uuid, company_name text, owner_name text, phone text, business_email text, business_address text, onboarding_completed boolean, existing_membership boolean)` |
| Function config | `search_path=public, auth` |
| Assigns `auth.uid()` | true |
| Rejects null `auth.uid()` | true |
| Retains authenticated-user error | true |

The verification ran inside `BEGIN READ ONLY` and rolled back. No onboarding RPC or production business-data mutation was performed.

### Final ledger and dry run

The post-deployment ledger pairs `20260829191542` locally and remotely. The final `supabase db push --linked --dry-run` exited `0` with:

```text
DRY RUN: migrations will *not* be pushed to the database.
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

Zero migrations remain pending. There is no `LegacyDbPushMissingRemoteError`, historical proposal, ACL proposal, seed, or role change.

## Sprint 3.44F.5 controlled ledger repair evidence

Query 17 was manually executed against production and matched the local Payments migration exactly: `amount` is numeric/NOT NULL/default `0`, `payment_date` is date/nullable/default `CURRENT_DATE`, and `status` is `payment_status`/NOT NULL/default `'recorded'::payment_status`. Payments is now `FULLY PRESENT`.

At the F.5 checkpoint, the historical implementation remained `PARTIALLY PRESENT` because production had broader effective EXECUTE privileges, while the divergence was represented honestly by the unapplied forward ACL correction.

Local history was normalized to 23 unique active migrations. The two approved superseded files were preserved under `supabase/migrations_archive`. F.5 executed no historical or forward ACL SQL.

**MIGRATION LEDGER: RECONCILED.** All 20 approved ledger-only repairs succeeded. The linked dry run is clean and proposes only the unapplied onboarding ACL correction.

## Pre-repair linked ledger snapshot

Captured immediately before normalization and any ledger repair. The only non-empty remote identities are the two expected rows:

```text
Initialising login role...
Connecting to remote database...
{"migrations":[{"local":"20260622","remote":"20260622","time":"20260622"},{"local":"20260622","remote":"","time":"20260622"},{"local":"20260622","remote":"","time":"20260622"},{"local":"20260624","remote":"","time":"20260624"},{"local":"20260625","remote":"","time":"20260625"},{"local":"20260628","remote":"","time":"20260628"},{"local":"20260628","remote":"","time":"20260628"},{"local":"20260628","remote":"","time":"20260628"},{"local":"20260628","remote":"","time":"20260628"},{"local":"20260630","remote":"","time":"20260630"},{"local":"20260707","remote":"","time":"20260707"},{"local":"20260707","remote":"","time":"20260707"},{"local":"20260718","remote":"","time":"20260718"},{"local":"20260719","remote":"","time":"20260719"},{"local":"20260719","remote":"","time":"20260719"},{"local":"20260721","remote":"","time":"20260721"},{"local":"20260721","remote":"","time":"20260721"},{"local":"20260721","remote":"","time":"20260721"},{"local":"20260725","remote":"","time":"20260725"},{"local":"20260726","remote":"","time":"20260726"},{"local":"20260812","remote":"","time":"20260812"},{"local":"20260816","remote":"","time":"20260816"},{"local":"20260826","remote":"","time":"20260826"},{"local":"20260828","remote":"20260828","time":"20260828"},{"local":"20260829191542","remote":"","time":"2026-08-29 19:15:42"}],"message":"Migrations listed"}
```

After normalization and immediately before the first repair, `supabase migration list --linked` still showed only the same two remote versions. The temporary split display for local/remote `20260828` was caused by the 20 missing intervening ledger rows and resolved after repair:

```text
Initialising login role...
Connecting to remote database...
{"migrations":[{"local":"20260622","remote":"20260622","time":"20260622"},{"local":"","remote":"20260828","time":"20260828"},{"local":"20260622235647","remote":"","time":"2026-06-22 23:56:47"},{"local":"20260622235648","remote":"","time":"2026-06-22 23:56:48"},{"local":"20260624","remote":"","time":"20260624"},{"local":"20260625","remote":"","time":"20260625"},{"local":"20260629002608","remote":"","time":"2026-06-29 00:26:08"},{"local":"20260629002610","remote":"","time":"2026-06-29 00:26:10"},{"local":"20260630","remote":"","time":"20260630"},{"local":"20260707152523","remote":"","time":"2026-07-07 15:25:23"},{"local":"20260707170751","remote":"","time":"2026-07-07 17:07:51"},{"local":"20260718","remote":"","time":"20260718"},{"local":"20260719020608","remote":"","time":"2026-07-19 02:06:08"},{"local":"20260719020609","remote":"","time":"2026-07-19 02:06:09"},{"local":"20260721003929","remote":"","time":"2026-07-21 00:39:29"},{"local":"20260721173314","remote":"","time":"2026-07-21 17:33:14"},{"local":"20260721173315","remote":"","time":"2026-07-21 17:33:15"},{"local":"20260725","remote":"","time":"20260725"},{"local":"20260726","remote":"","time":"20260726"},{"local":"20260812","remote":"","time":"20260812"},{"local":"20260816","remote":"","time":"20260816"},{"local":"20260826","remote":"","time":"20260826"},{"local":"20260828","remote":"","time":"20260828"},{"local":"20260829191542","remote":"","time":"2026-08-29 19:15:42"}],"message":"Migrations listed"}
```

## Post-repair linked ledger snapshot

```text
Initialising login role...
Connecting to remote database...
{"migrations":[{"local":"20260622","remote":"20260622","time":"20260622"},{"local":"20260622235647","remote":"20260622235647","time":"2026-06-22 23:56:47"},{"local":"20260622235648","remote":"20260622235648","time":"2026-06-22 23:56:48"},{"local":"20260624","remote":"20260624","time":"20260624"},{"local":"20260625","remote":"20260625","time":"20260625"},{"local":"20260629002608","remote":"20260629002608","time":"2026-06-29 00:26:08"},{"local":"20260629002610","remote":"20260629002610","time":"2026-06-29 00:26:10"},{"local":"20260630","remote":"20260630","time":"20260630"},{"local":"20260707152523","remote":"20260707152523","time":"2026-07-07 15:25:23"},{"local":"20260707170751","remote":"20260707170751","time":"2026-07-07 17:07:51"},{"local":"20260718","remote":"20260718","time":"20260718"},{"local":"20260719020608","remote":"20260719020608","time":"2026-07-19 02:06:08"},{"local":"20260719020609","remote":"20260719020609","time":"2026-07-19 02:06:09"},{"local":"20260721003929","remote":"20260721003929","time":"2026-07-21 00:39:29"},{"local":"20260721173314","remote":"20260721173314","time":"2026-07-21 17:33:14"},{"local":"20260721173315","remote":"20260721173315","time":"2026-07-21 17:33:15"},{"local":"20260725","remote":"20260725","time":"20260725"},{"local":"20260726","remote":"20260726","time":"20260726"},{"local":"20260812","remote":"20260812","time":"20260812"},{"local":"20260816","remote":"20260816","time":"20260816"},{"local":"20260826","remote":"20260826","time":"20260826"},{"local":"20260828","remote":"20260828","time":"20260828"},{"local":"20260829191542","remote":"","time":"2026-08-29 19:15:42"}],"message":"Migrations listed"}
```

## Linked dry-run result

Command: `supabase db push --linked --dry-run`
Exit status: `0`

```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260829191542_restrict_beta_onboarding_function_execute.sql
{"upToDate":false,"dryRun":true,"migrations":["20260829191542_restrict_beta_onboarding_function_execute.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

`LegacyDbPushMissingRemoteError` is gone. No historical SQL was proposed or executed. The ACL migration was not applied.

## State layers

- **Production schema state:** most local schema/security effects are present, including the final Project Photo design, CRM RLS, public-token boundaries, sample journey, and SaaS billing foundation.
- **Production data postconditions:** Miguel account state, Payment/Event backfills, onboarding backfill, accepted-method shape, token population, and sample-workspace manifests were inspected read-only.
- **Production ledger state:** the original `20260622` and `20260828` identities plus all 20 approved historical reconciliation versions are recorded. `20260829191542` remains unrecorded.
- **Repository state:** 25 files: 23 uniquely versioned active files and two preserved superseded archives. The active set includes the new post-head `20260829191542` ACL correction.
- **Ledger mutation:** all 20 historical single-version `applied` repairs completed with exit code 0 and are documented in [PRODUCTION_MIGRATION_REPAIR_PLAN.md](./PRODUCTION_MIGRATION_REPAIR_PLAN.md). The new ACL migration remains a legitimate pending forward migration.

## Classification totals by gate

| State | Fully | Partially | Superseded | Not present | Cannot determine | Scope |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| Final F.5 evidence | 21 | 1 | 2 | 1 | 0 | Payments promoted; onboarding historical remained partial; ACL correction pending |
| After ACL strategy approval, before production apply | 21 | 1 | 2 | 1 | 0 | Onboarding is ledger-eligible only as part of the correction sequence, not reclassified |
| Final F.6 production state | 23 | 0 | 2 | 0 | 0 | Historical onboarding divergence resolved by the verified forward correction |

## Final 25-file classification

| Filename | Version | Purpose | Production evidence | Final classification | Ledger action | Rationale |
| --- | --- | --- | --- | --- | --- | --- |
| `20260622_create_miguel_contractor_profile.sql` | `20260622` | Miguel contractor seed | Exact remote identity; Query 02 finds exactly one active target contractor | `FULLY PRESENT` | `KEEP EXISTING` | The recorded one-statement migration maps exactly to this file. |
| `20260622235647_enable_self_service_beta_onboarding.sql` | `20260622235647` | Onboarding RPC and ACL | Query 01 proved the implementation and historical ACL divergence; F.6 verified the intended ACL after the explicit forward correction | `FULLY PRESENT` | `MARK APPLIED` | History remains unchanged; the known divergence is resolved transparently by `20260829191542`. |
| `20260622235648_link_miguel_contractor_membership.sql` | `20260622235648` | Miguel owner membership seed | Query 02: one auth user, one qualifying active Owner membership, one settings row | `FULLY PRESENT` | `MARK APPLIED` | The separate data postcondition is proven and the canonical version is unique. |
| `20260624_enable_payments_supabase_beta.sql` | `20260624` | Payments schema, backfill, indexes, and RLS | Queries 03–04 plus Query 17 prove all fields, exact metadata, backfills, indexes, relationships, and RLS | `FULLY PRESENT` | `MARK APPLIED` | Query 17 exactly matched numeric/default `0`, date/default `CURRENT_DATE`, and `payment_status`/default `recorded`. |
| `20260625_enable_events_supabase_beta.sql` | `20260625` | Event scheduling fields, backfills, indexes, RLS | Query 05: RLS CRUD policies and zero violations for all four backfills; columns/indexes previously confirmed | `FULLY PRESENT` | `MARK APPLIED` | The migration is additive; it never drops legacy `type`, `starts_at`, or `ends_at`. Retaining old/new representations is expected. |
| `20260628211023_add_simple_mode_to_company_settings.sql` | `20260628211023` | Legacy Simple Mode flag | Query 09: `simple_mode` absent; `analytics_mode` exact, non-null/default true, zero nulls | `SUPERSEDED` | `ARCHIVE AFTER APPROVAL` | Preserved outside the active migration directory; never restore or mark applied. |
| `20260629002608_enable_project_photos_storage_beta.sql` | `20260629002608` | Private bucket and baseline photo/storage RLS | Queries 03, 06–07 prove its durable bucket foundation and restrictions | `FULLY PRESENT` | `MARK APPLIED` | Canonical active version is unique. |
| `20260629002609_fix_project_photos_rls.sql` | `20260629002609` | First project-ownership policy fix | Query 07 shows the later uploader-helper policy bodies, not this inline membership version | `SUPERSEDED` | `ARCHIVE AFTER APPROVAL` | Preserved outside the active migration directory; never mark applied. |
| `20260629002610_fix_project_photos_identity_rls.sql` | `20260629002610` | Final uploader-aware photo RLS | Queries 03 and 07 exactly confirm final helpers and Project Photo/Storage policy semantics | `FULLY PRESENT` | `MARK APPLIED` | Production uses the final uploader and path/project checks. |
| `20260630_add_analytics_mode_to_company_settings.sql` | `20260630` | Analytics Mode and backfill | Query 09: Boolean NOT NULL default true, no null rows, no `simple_mode` | `FULLY PRESENT` | `MARK APPLIED` | Exact final schema and data invariant are present. |
| `20260707152523_add_client_language_preferences.sql` | `20260707152523` | Client/Lead language fields and checks | Query 08: both named validated en/es checks | `FULLY PRESENT` | `MARK APPLIED` | Canonical active version is unique. |
| `20260707170751_add_estimate_language.sql` | `20260707170751` | Estimate language field and check | Query 08: named validated en/es/null check | `FULLY PRESENT` | `MARK APPLIED` | Exact substantive effect is present. |
| `20260718_add_premium_onboarding_state.sql` | `20260718` | Premium onboarding fields/defaults/checks/backfill | Query 10: all seven exact columns, four validated checks, five pre-file rows, zero violations | `FULLY PRESENT` | `MARK APPLIED` | Schema and bounded existing-row postcondition match. |
| `20260719020608_add_sample_workspace_manifest.sql` | `20260719020608` | Manifest, seven initial sample keys, and partial unique indexes | Prior schema/index evidence plus Query 12's installed v2 manifests | `FULLY PRESENT` | `MARK APPLIED` | Canonical active version precedes the connected journey. |
| `20260719020609_connect_sample_workspace_journey.sql` | `20260719020609` | Estimate→Lead FK, Invoice sample key, cleanup/indexes | Query 11: validated ON DELETE SET NULL FK, both indexes, Invoice key, zero orphans | `FULLY PRESENT` | `MARK APPLIED` | Both schema and cleanup postcondition are proven. |
| `20260721003929_enable_invoices_supabase_rls.sql` | `20260721003929` | Invoice CRUD RLS | Query 13: RLS and four PUBLIC-role policies calling membership helper | `FULLY PRESENT` | `MARK APPLIED` | Canonical active version is unique. |
| `20260721173314_enable_contracts_delete_rls.sql` | `20260721173314` | Authenticated Contract DELETE policy | Query 13: Contract RLS and authenticated tenant delete semantics | `FULLY PRESENT` | `MARK APPLIED` | Exact migration-specific DELETE effect is present. |
| `20260721173315_enable_estimates_delete_rls.sql` | `20260721173315` | Authenticated Estimate DELETE policy | Query 13: Estimate RLS and authenticated tenant delete semantics | `FULLY PRESENT` | `MARK APPLIED` | Exact migration-specific DELETE effect is present. |
| `20260725_add_company_accepted_payment_methods.sql` | `20260725` | Canonical payment-method JSON | Query 14: exact JSONB NOT NULL/default/check, five rows, zero invalid shapes | `FULLY PRESENT` | `MARK APPLIED` | Schema and normalization invariant match. |
| `20260726_add_invoice_customer_notes.sql` | `20260726` | Customer-facing Invoice note | Production nullable text column previously confirmed | `FULLY PRESENT` | `MARK APPLIED` | Sole substantive persistent effect is present. |
| `20260812_add_public_client_portal_tokens.sql` | `20260812` | Project portal bearer tokens | Query 15: exact NOT NULL/default/index, 38 populated unique rows, no anon privileges | `FULLY PRESENT` | `MARK APPLIED` | Schema, backfill, uniqueness, and revoke postconditions all match. |
| `20260816_add_public_estimate_share_tokens.sql` | `20260816` | Estimate share bearer tokens | Query 16: exact NOT NULL/default/index, 23 populated unique rows, no anon privileges | `FULLY PRESENT` | `MARK APPLIED` | Schema, backfill, uniqueness, and revoke postconditions all match. |
| `20260826_add_saas_billing_foundation.sql` | `20260826` | SaaS billing tables/security | Complete prior billing evidence: tables, constraints, indexes, FKs, RLS, policies, privileges, triggers | `FULLY PRESENT` | `MARK APPLIED` | Complete billing schema/security surface is evidenced and isolated from CRM commerce. |
| `20260828_add_billing_subscription_cancel_at.sql` | `20260828` | Stripe scheduled-cancellation timestamp | Exact remote identity plus `cancel_at timestamptz` | `FULLY PRESENT` | `KEEP EXISTING` | Preserve the recorded two-statement migration unchanged. |
| `20260829191542_restrict_beta_onboarding_function_execute.sql` | `20260829191542` | Forward onboarding ACL correction | Applied normally; read-only verification confirms exact effective ACL and unchanged function integrity | `FULLY PRESENT` | `KEEP EXISTING` | Paired local/remote; final dry run is up to date. |

## Function ACL conclusion

- `complete_beta_contractor_onboarding`: before F.6, production effective anon EXECUTE was true despite the historical migration's explicit PUBLIC revoke. F.6 now verifies PUBLIC=false, anon=false, authenticated=true, and service_role=true.
- **Application path:** `AuthOnboardingPage` is rendered only after `isAuthenticated`; `AuthContext` owns the call; the REST client sends the stored session access token and falls back to the anon key only when no session exists. No auth page, public portal, or Edge Function calls the RPC. Removing anonymous execution does not break a repository-supported onboarding path.
- **Forward ACL target:** revoke EXECUTE from PUBLIC and `anon`; explicitly grant `authenticated` and trusted `service_role`; keep the internal `auth.uid()` guard. `service_role` is not used by the current app call path, but an explicit trusted grant preserves server/admin compatibility without relying on PUBLIC.
- `is_active_contractor_member` and the three Project Photo helpers: local migrations do not revoke default PUBLIC EXECUTE. Production effective anon EXECUTE therefore matches local ACL behavior. Each helper ultimately relies on `auth.uid()`/active membership.
- Invoice and Project Photo policies omit `TO`, so production role `{public}` matches local SQL. Table privileges alone do not bypass RLS.

## New unapplied forward migration

`20260829191542_restrict_beta_onboarding_function_execute.sql` is now `FULLY PRESENT` and paired in the production ledger. It changes ACLs only:

- revokes EXECUTE from PUBLIC;
- revokes direct EXECUTE from `anon`;
- grants EXECUTE to `authenticated`;
- explicitly grants trusted `service_role`;
- does not replace the function or weaken `auth.uid()` validation.

The resolution chain remains explicit: historical onboarding migration → production ACL divergence → migration-ledger reconciliation → forward-only ACL correction → verified intended production state. Both onboarding migrations are now fully represented without rewriting history.

## Domain conclusions

- **Simple Mode:** intentionally superseded by Analytics Mode. No drift, restoration, repair entry, or new migration is warranted.
- **Project Photos:** bucket, limits, MIME restrictions, helpers, table RLS, and Storage policies match the final design. The baseline is represented; the first fix is an unprovable/superseded intermediate; the identity fix is final.
- **Payments/Events:** retained legacy `method`/`type` and newer fields are additive by local SQL. Query 17 matched the exact remaining Payments metadata, so both migrations are fully present.
- **Sample workspace:** local `ENTITY_KEYS` contains eight keys: `lead`, `client`, `estimate`, `project`, `contract`, `event`, `invoice`, `payment`. The omitted eighth summary category is `project`, stored as `aymero_sample_data:project`. Query 11 fully proves the connected migration; Query 12 shows two installed version-2 manifests with eight record keys.
- **SaaS billing:** the foundation is fully present and is an evidence-backed future repair candidate. `cancel_at` remains the already-recorded final migration.

## Verification and next gate

The exact proposed repairs, inverse ledger commands, normalization prerequisites, and dry-run prediction are in [PRODUCTION_MIGRATION_REPAIR_PLAN.md](./PRODUCTION_MIGRATION_REPAIR_PLAN.md).

Database reconciliation is complete. The final linked dry run reports the remote database is up to date with zero pending migrations.
