# Production migration ledger repair plan

## Status and decision

**NO-GO for repair and Stripe live-mode cutover.** This document is a plan only. Sprint 3.44F.1 does not rename migration files, run `supabase migration repair`, push schema changes, change production data, clean up Stripe rows, or change Stripe configuration.

Production has 24 local migration files represented by only 15 local versions. The production ledger records exactly two rows:

| Version | Name | Statements |
| --- | --- | ---: |
| `20260622` | `create_miguel_contractor_profile` | 1 |
| `20260828` | `add_billing_subscription_cancel_at` | 2 |

The complete evidence matrix is in [PRODUCTION_DATABASE_RECONCILIATION.md](./PRODUCTION_DATABASE_RECONCILIATION.md). Its current counts are:

| Classification | Files |
| --- | ---: |
| `FULLY PRESENT` | 5 |
| `PARTIALLY PRESENT` | 3 |
| `SUPERSEDED` | 2 |
| `NOT PRESENT` | 0 |
| `CANNOT DETERMINE` | 14 |

`company_settings.simple_mode` is absent and `company_settings.analytics_mode` is present. That is evidence of a later design state, not permission to claim that the `simple_mode` migration ran.

## Repair eligibility

### Already recorded; do not repair

- `20260622_create_miguel_contractor_profile.sql` matches the exact remote `20260622 | create_miguel_contractor_profile` row. Preserve its version and filename.
- `20260828_add_billing_subscription_cancel_at.sql` matches the exact remote `20260828 | add_billing_subscription_cancel_at` row. Preserve its version and filename.

### Fully present candidates

These are the only unrecorded migrations whose complete substantive effects are proven by the supplied production evidence:

| Current migration | Eligibility | Required gate |
| --- | --- | --- |
| `20260719_add_sample_workspace_manifest.sql` | Candidate after renumbering | Give it a unique canonical version and confirm the normalized filename is the one being recorded. |
| `20260726_add_invoice_customer_notes.sql` | Candidate | First complete and approve the local-history normalization; then capture a fresh ledger snapshot. |
| `20260826_add_saas_billing_foundation.sql` | Candidate | First complete and approve the local-history normalization; then capture a fresh billing catalog snapshot. |

This is not authorization to run repair. Even these candidates should be recorded one at a time only after the active local migration chain is canonical and reviewed.

### Not safe to repair

- `PARTIALLY PRESENT`: onboarding function ACL/body, language checks, or other required effects have not been fully evidenced.
- `CANNOT DETERMINE`: these include account-specific inserts, backfills, storage configuration, RLS policies, grants, and token population whose data or catalog state is not proven.
- `SUPERSEDED`: `simple_mode` and the earlier project-photo RLS fix must not be represented as current production migrations merely because a later design exists.
- `NOT PRESENT`: none are currently classified here. Any future file in this class must remain unapplied until a separately reviewed migration is intentionally executed.

The exact migrations currently prohibited from repair are:

| Migration | Classification | Gate or disposition |
| --- | --- | --- |
| `20260622_enable_self_service_beta_onboarding.sql` | `PARTIALLY PRESENT` | Exact function definition/configuration/ACL evidence |
| `20260622_link_miguel_contractor_membership.sql` | `CANNOT DETERMINE` | Exact account-row proof and human confirmation |
| `20260624_enable_payments_supabase_beta.sql` | `CANNOT DETERMINE` | Defaults, policies, and backfill postconditions |
| `20260625_enable_events_supabase_beta.sql` | `CANNOT DETERMINE` | Policies and four backfill postconditions |
| `20260628_add_simple_mode_to_company_settings.sql` | `SUPERSEDED` | Legacy archive; never apply as current state |
| `20260628_enable_project_photos_storage_beta.sql` | `CANNOT DETERMINE` | Bucket and exact Project Photo/Storage policies |
| `20260628_fix_project_photos_rls.sql` | `SUPERSEDED` | Legacy archive; replaced by final identity fix |
| `20260628_fix_project_photos_identity_rls.sql` | `CANNOT DETERMINE` | Exact helper, bucket, and policy evidence |
| `20260630_add_analytics_mode_to_company_settings.sql` | `CANNOT DETERMINE` | Default/NOT NULL and zero-null backfill proof |
| `20260707_add_client_language_preferences.sql` | `PARTIALLY PRESENT` | Two named check constraints |
| `20260707_add_estimate_language.sql` | `PARTIALLY PRESENT` | Named Estimate language check |
| `20260718_add_premium_onboarding_state.sql` | `CANNOT DETERMINE` | Defaults/checks and legacy-row backfill proof |
| `20260719_connect_sample_workspace_journey.sql` | `CANNOT DETERMINE` | Orphan-cleanup postcondition and unique renumbering |
| `20260721_enable_invoices_supabase_rls.sql` | `CANNOT DETERMINE` | Exact Invoice RLS policies |
| `20260721_enable_contracts_delete_rls.sql` | `CANNOT DETERMINE` | Exact Contract DELETE policy |
| `20260721_enable_estimates_delete_rls.sql` | `CANNOT DETERMINE` | Exact Estimate DELETE policy |
| `20260725_add_company_accepted_payment_methods.sql` | `CANNOT DETERMINE` | JSON metadata/check and row-shape proof |
| `20260812_add_public_client_portal_tokens.sql` | `CANNOT DETERMINE` | Token backfill/default/NOT NULL and anon privilege proof |
| `20260816_add_public_estimate_share_tokens.sql` | `CANNOT DETERMINE` | Token backfill/default/NOT NULL and anon privilege proof |

## Duplicate-version resolution

The duplicate versions `20260622`, `20260628`, `20260707`, `20260719`, and `20260721` block a truthful linked history. The canonical strategy is:

1. Preserve every recorded remote identity exactly.
2. Use 14-digit timestamps for unrecorded files, based on repository creation time and semantic dependency order.
3. Keep a one-to-one mapping in this document and in the normalization commit.
4. Move superseded historical SQL out of the active `supabase/migrations` directory in that reviewed commit; preserve it in a clearly named legacy archive rather than deleting it.
5. Do not move unresolved data migrations out of the active chain until a human decides whether read-only evidence can prove them or they require an explicit production baseline decision.

Proposed mapping (not performed in this sprint):

| Current filename | Proposed canonical identity | Disposition |
| --- | --- | --- |
| `20260622_create_miguel_contractor_profile.sql` | unchanged | Recorded remotely; never renumber casually. |
| `20260622_enable_self_service_beta_onboarding.sql` | `20260622235647_enable_self_service_beta_onboarding.sql` | Active only after missing function-definition and ACL evidence is resolved. |
| `20260622_link_miguel_contractor_membership.sql` | `20260622235648_link_miguel_contractor_membership.sql` | Hold; account-specific data evidence required. |
| `20260628_add_simple_mode_to_company_settings.sql` | `20260628211023_add_simple_mode_to_company_settings.sql` | Legacy archive; superseded and absent in production. |
| `20260628_enable_project_photos_storage_beta.sql` | `20260629002608_enable_project_photos_storage_beta.sql` | Hold for bucket/RLS evidence. |
| `20260628_fix_project_photos_rls.sql` | `20260629002609_fix_project_photos_rls.sql` | Legacy archive; replaced by the uploader-aware fix. |
| `20260628_fix_project_photos_identity_rls.sql` | `20260629002610_fix_project_photos_identity_rls.sql` | Hold for exact final policy and bucket evidence. |
| `20260707_add_client_language_preferences.sql` | `20260707152523_add_client_language_preferences.sql` | Hold until both check constraints are confirmed. |
| `20260707_add_estimate_language.sql` | `20260707170751_add_estimate_language.sql` | Hold until the check constraint is confirmed. |
| `20260719_add_sample_workspace_manifest.sql` | `20260719020608_add_sample_workspace_manifest.sql` | Fully present repair candidate after rename. |
| `20260719_connect_sample_workspace_journey.sql` | `20260719020609_connect_sample_workspace_journey.sql` | Hold for the data-update postcondition evidence. |
| `20260721_enable_invoices_supabase_rls.sql` | `20260721003929_enable_invoices_supabase_rls.sql` | Hold for exact RLS/policy evidence. |
| `20260721_enable_contracts_delete_rls.sql` | `20260721173314_enable_contracts_delete_rls.sql` | Hold for exact DELETE-policy evidence. |
| `20260721_enable_estimates_delete_rls.sql` | `20260721173315_enable_estimates_delete_rls.sql` | Hold for exact DELETE-policy evidence. |

The `20260629` photo timestamps reflect the files' repository creation time and make the semantic order explicit: bucket foundation, first ownership fix, final uploader-aware fix. The two recorded remote files remain unchanged, so normalization does not reinterpret either production ledger row.

## Evidence required before reclassification

Use read-only production queries only. The existing [PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql](./PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql) is the starting point; extend it narrowly if a required result is absent.

| Area | Required evidence |
| --- | --- |
| Self-service onboarding | Exact `pg_get_functiondef`, owner, `prosecdef`, `proconfig`, PUBLIC revoke, and authenticated EXECUTE grant. |
| Miguel membership | Exact contractor/member/auth UUID relationship and archival state; do not infer it from the contractor row. |
| Payments and Events | Defaults/nullability, all intended RLS policies, and queries proving the migration backfill postconditions. |
| Project photos | Bucket existence/settings and exact `public.project_photos` plus `storage.objects` policy commands/expressions. |
| Analytics and onboarding | Defaults, NOT NULL/check constraints, and row queries proving no legacy rows missed the backfills. |
| Language fields | The three named check constraints and their definitions. |
| Connected sample journey | Validated Estimate→Lead FK plus a query proving no unresolved legacy relationship; retain the conservative data review even if the FK is valid. |
| Contract/Estimate/Invoice RLS | `relrowsecurity`, roles, commands, `qual`, and `with_check` for every named policy. |
| Payment method JSON | Default, NOT NULL, named shape check, and a row query proving every value has the canonical shape. |
| Public tokens | NOT NULL/default/index, anon privileges, and row queries proving every token is populated, nonblank, and unique. |

If all effects of a migration are proven, promote it to `FULLY PRESENT`. If any effect is missing, do not repair the historical version. Design a narrow, idempotent corrective migration after the current head under separate approval. If a data migration's historical state remains unknowable, keep it unresolved and make an explicit baseline/archive decision; do not manufacture ledger history.

## Recommended future repair sequence

The sequence below is intentionally gated and must be executed in a later, approved production-change sprint.

1. Export the complete production ledger and the read-only catalog result sets. Record the project ref and UTC timestamp privately.
2. Create and review one local-history normalization commit using the mapping above. Do not combine it with production repair.
3. Re-run the verifier and compare every active filename/version with the approved matrix.
4. Resolve all `PARTIALLY PRESENT` and `CANNOT DETERMINE` rows using the evidence table. Archive only migrations explicitly approved as legacy/superseded or historically unknowable; never silently drop them.
5. Capture a fresh `supabase migration list --linked`. Abort if either known remote row changed or any unexpected row appeared.
6. Repair only the approved `FULLY PRESENT` candidates, one version per command and in canonical chronological order. The expected candidate order is:
   1. `20260719020608_add_sample_workspace_manifest.sql`
   2. `20260726_add_invoice_customer_notes.sql`
   3. `20260826_add_saas_billing_foundation.sql`
7. After each single repair, re-list the linked ledger and verify the exact new row before continuing.
8. Run `supabase db push --linked --dry-run` without `--include-all`. A clean, explainable no-op is required. Any proposed SQL or legacy-history error returns the decision to NO-GO.
9. Only after the database ledger is clean may the separate Stripe sandbox classification/cleanup and live-mode cutover gates resume.

Never use a blanket loop, `--include-all`, or “mark every missing version applied.” The future operator must substitute only a reviewed exact version into `supabase migration repair <exact-version> --status applied --linked`.

## Recovery considerations

- A repair changes the ledger only; it does not create or remove schema objects. Therefore a ledger rollback cannot repair schema drift.
- Before each repair, save the exact ledger rows. If a newly inserted ledger entry is wrong, stop immediately and use a separately reviewed single-version `--status reverted` repair for that exact version. Re-list the ledger afterward.
- Local filename normalization is recoverable through a dedicated Git revert because it must be isolated in its own commit.
- Never roll back either recorded remote identity (`20260622_create_miguel_contractor_profile` or `20260828_add_billing_subscription_cancel_at`) as part of this plan.
- A corrective SQL migration needs its own database backup/rollback design. It is not covered by ledger-only recovery.
- Stripe objects and billing rows are outside this repair. The lack of a stored `livemode` discriminator keeps sandbox cleanup blocked until every exact Stripe ID is verified independently.

## Final pre-repair checklist

- [ ] Human approval exists for the local normalization mapping and legacy archive decisions.
- [ ] The worktree contains no unrelated changes.
- [ ] All 24 original files remain traceable in the matrix and Git history.
- [ ] No duplicate version remains in the active migration directory.
- [ ] The two recorded remote identities are unchanged.
- [ ] Every repair candidate is `FULLY PRESENT` with retained read-only evidence.
- [ ] Every account-specific/backfill migration is proven or explicitly held out; none is inferred from columns alone.
- [ ] `simple_mode` remains absent and is not scheduled for accidental execution.
- [ ] Exact photo, CRM, and billing RLS policies/grants match the approved target.
- [ ] The production ledger was freshly exported immediately before repair.
- [ ] A single-version recovery command and operator are identified.
- [ ] Sandbox Stripe objects remain untouched.
- [ ] No live Stripe secret or configuration has changed.
- [ ] Post-repair linked list and dry-run commands are ready.

## Exact next manual action

Review and approve the proposed local normalization mapping—especially the legacy archive treatment for `simple_mode` and the earlier photo RLS fix—then run the existing read-only production audit and retain the missing result sets listed above. Do **not** run migration repair yet.
