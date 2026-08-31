# Production migration ledger repair plan

## Status

**DATABASE MIGRATION RECONCILIATION COMPLETE.** Query 17 matched, local normalization completed in commit `8d752a9`, all 20 ledger-only repairs succeeded, and Sprint 3.44F.6 applied the forward ACL migration normally. Final ACL, function integrity, ledger pairing, and zero-pending dry run are verified.

Before repair, production recorded exactly:

| Version | Name | Statements |
| --- | --- | ---: |
| `20260622` | `create_miguel_contractor_profile` | 1 |
| `20260828` | `add_billing_subscription_cancel_at` | 2 |

Final classifications across 25 repository files are 23 `FULLY PRESENT`, 0 `PARTIALLY PRESENT`, 2 `SUPERSEDED`, 0 `NOT PRESENT`, and 0 `CANNOT DETERMINE`. The completed repair set contains 20 ledger-only entries; the ACL correction was applied separately as real forward SQL.

## Complete repository normalization mapping

This approved mapping has been applied locally. The two recorded identities remain unchanged, historical SQL bytes are preserved, and the two superseded files live outside the active migration directory.

| Current filename | Current version | Proposed canonical filename/version | Final class | Future repository action | Future ledger action | Order/dependency |
| --- | --- | --- | --- | --- | --- | --- |
| `20260622_create_miguel_contractor_profile.sql` | `20260622` | unchanged | `FULLY PRESENT` | Keep | Keep existing | Recorded owner of `20260622` |
| `20260622235647_enable_self_service_beta_onboarding.sql` | `20260622235647` | unchanged | `FULLY PRESENT` | Normalized active file | Applied ledger entry | Historical divergence resolved by the explicit verified forward migration |
| `20260622235648_link_miguel_contractor_membership.sql` | `20260622235648` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Requires target contractor/auth user |
| `20260624_enable_payments_supabase_beta.sql` | `20260624` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Query 17 exactly matched the three remaining column definitions |
| `20260625_enable_events_supabase_beta.sql` | `20260625` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Before sample workspace keys |
| `20260628211023_add_simple_mode_to_company_settings.sql` | `20260628211023` | unchanged | `SUPERSEDED` | Archived under `supabase/migrations_archive` | Do not mark | Historical predecessor to Analytics Mode; never execute |
| `20260629002608_enable_project_photos_storage_beta.sql` | `20260629002608` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Bucket foundation before photo fixes |
| `20260629002609_fix_project_photos_rls.sql` | `20260629002609` | unchanged | `SUPERSEDED` | Archived under `supabase/migrations_archive` | Do not mark | Intermediate inline-uploader policy before final fix |
| `20260629002610_fix_project_photos_identity_rls.sql` | `20260629002610` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Final photo policy after bucket foundation |
| `20260630_add_analytics_mode_to_company_settings.sql` | `20260630` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Intentional successor to Simple Mode |
| `20260707152523_add_client_language_preferences.sql` | `20260707152523` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Before Estimate language by repository time |
| `20260707170751_add_estimate_language.sql` | `20260707170751` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | After Client/Lead languages |
| `20260718_add_premium_onboarding_state.sql` | `20260718` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Before sample manifest |
| `20260719020608_add_sample_workspace_manifest.sql` | `20260719020608` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Must precede connected journey |
| `20260719020609_connect_sample_workspace_journey.sql` | `20260719020609` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | Depends on manifest/key schema |
| `20260721003929_enable_invoices_supabase_rls.sql` | `20260721003929` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | First 20260721 file by repository time |
| `20260721173314_enable_contracts_delete_rls.sql` | `20260721173314` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | After Invoice RLS |
| `20260721173315_enable_estimates_delete_rls.sql` | `20260721173315` | unchanged | `FULLY PRESENT` | Normalized active file | Mark applied | After Contract DELETE |
| `20260725_add_company_accepted_payment_methods.sql` | `20260725` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Before Invoice customer notes |
| `20260726_add_invoice_customer_notes.sql` | `20260726` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | After Invoice RLS/settings |
| `20260812_add_public_client_portal_tokens.sql` | `20260812` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Independent of billing |
| `20260816_add_public_estimate_share_tokens.sql` | `20260816` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | After Project portal tokens chronologically |
| `20260826_add_saas_billing_foundation.sql` | `20260826` | unchanged | `FULLY PRESENT` | Keep filename | Mark applied | Must precede `cancel_at` |
| `20260828_add_billing_subscription_cancel_at.sql` | `20260828` | unchanged | `FULLY PRESENT` | Keep | Keep existing | Recorded final identity |
| `20260829191542_restrict_beta_onboarding_function_execute.sql` | `20260829191542` | unchanged | `FULLY PRESENT` | Keep active | Applied normally; never repaired | Paired local/remote and verified in Sprint 3.44F.6 |

The normalization operation is isolated from historical SQL changes. Archived SQL is preserved under `supabase/migrations_archive`; the active `supabase/migrations` directory now has 23 unique versions.

## Evidence gates

### Repair candidates and conditional gates

- Retain the Query 01–16 outputs privately with project ref and UTC capture time.
- Reconfirm the two exact remote ledger rows immediately before any repair.
- Query 17 returned exactly the expected metadata for `amount`, `payment_date`, and `status`; `20260624` is promoted to `FULLY PRESENT`.
- The forward ACL strategy is approved. Representing the canonical onboarding historical version remains a sequencing decision, not a claim that its current ACL already matches.
- The normalized repository preserves the new `20260829191542` file and excludes only the two approved superseded files from the active historical chain.
- Re-run the adjusted repository verifier after normalization and before any ledger repair.
- Capture a fresh billing catalog snapshot before repairing `20260826`.

### Historical migrations excluded from repair

- Archived `simple_mode`: intentionally superseded.
- Archived first Project Photo RLS fix: no unique current effect proves the intermediate migration separately from the final fix.

The ACL correction was correctly excluded from ledger repair and later applied normally through `supabase db push --linked`.

## Executed applied-repair commands

**Approved only for Sprint 3.44F.5 ledger reconciliation.** Run one command at a time in this exact order, stop on any non-zero exit, and never execute historical SQL:

```sh
supabase migration repair 20260622235647 --status applied --linked
supabase migration repair 20260622235648 --status applied --linked
supabase migration repair 20260624 --status applied --linked
supabase migration repair 20260625 --status applied --linked
supabase migration repair 20260629002608 --status applied --linked
supabase migration repair 20260629002610 --status applied --linked
supabase migration repair 20260630 --status applied --linked
supabase migration repair 20260707152523 --status applied --linked
supabase migration repair 20260707170751 --status applied --linked
supabase migration repair 20260718 --status applied --linked
supabase migration repair 20260719020608 --status applied --linked
supabase migration repair 20260719020609 --status applied --linked
supabase migration repair 20260721003929 --status applied --linked
supabase migration repair 20260721173314 --status applied --linked
supabase migration repair 20260721173315 --status applied --linked
supabase migration repair 20260725 --status applied --linked
supabase migration repair 20260726 --status applied --linked
supabase migration repair 20260812 --status applied --linked
supabase migration repair 20260816 --status applied --linked
supabase migration repair 20260826 --status applied --linked
```

Do not repair the already-recorded `20260622` or `20260828` entries again. Never use a blanket loop or `--include-all`.

## Command results

Every command returned exit status `0` and `Migration history repaired`; none executed schema SQL.

| Order | Version | Status | Exit |
| ---: | --- | --- | ---: |
| 1 | `20260622235647` | applied | 0 |
| 2 | `20260622235648` | applied | 0 |
| 3 | `20260624` | applied | 0 |
| 4 | `20260625` | applied | 0 |
| 5 | `20260629002608` | applied | 0 |
| 6 | `20260629002610` | applied | 0 |
| 7 | `20260630` | applied | 0 |
| 8 | `20260707152523` | applied | 0 |
| 9 | `20260707170751` | applied | 0 |
| 10 | `20260718` | applied | 0 |
| 11 | `20260719020608` | applied | 0 |
| 12 | `20260719020609` | applied | 0 |
| 13 | `20260721003929` | applied | 0 |
| 14 | `20260721173314` | applied | 0 |
| 15 | `20260721173315` | applied | 0 |
| 16 | `20260725` | applied | 0 |
| 17 | `20260726` | applied | 0 |
| 18 | `20260812` | applied | 0 |
| 19 | `20260816` | applied | 0 |
| 20 | `20260826` | applied | 0 |

## Exact inverse ledger rollback commands

These inverse commands remove only a mistaken ledger entry; they do not undo schema or data. If a future operator observes any unexpected ledger row, stop and run only the inverse for the last command that was just applied:

```sh
supabase migration repair 20260622235647 --status reverted --linked
supabase migration repair 20260622235648 --status reverted --linked
supabase migration repair 20260624 --status reverted --linked
supabase migration repair 20260625 --status reverted --linked
supabase migration repair 20260629002608 --status reverted --linked
supabase migration repair 20260629002610 --status reverted --linked
supabase migration repair 20260630 --status reverted --linked
supabase migration repair 20260707152523 --status reverted --linked
supabase migration repair 20260707170751 --status reverted --linked
supabase migration repair 20260718 --status reverted --linked
supabase migration repair 20260719020608 --status reverted --linked
supabase migration repair 20260719020609 --status reverted --linked
supabase migration repair 20260721003929 --status reverted --linked
supabase migration repair 20260721173314 --status reverted --linked
supabase migration repair 20260721173315 --status reverted --linked
supabase migration repair 20260725 --status reverted --linked
supabase migration repair 20260726 --status reverted --linked
supabase migration repair 20260812 --status reverted --linked
supabase migration repair 20260816 --status reverted --linked
supabase migration repair 20260826 --status reverted --linked
```

Rollback order in an incident is reverse chronological from the last successfully inserted entry. Do not touch the two original ledger rows.

## Post-repair linked ledger

The exact CLI output is also retained in [PRODUCTION_DATABASE_RECONCILIATION.md](./PRODUCTION_DATABASE_RECONCILIATION.md). Every active historical local/remote version pairs exactly; the only blank remote value is the forward ACL version:

```json
{"migrations":[{"local":"20260622","remote":"20260622","time":"20260622"},{"local":"20260622235647","remote":"20260622235647","time":"2026-06-22 23:56:47"},{"local":"20260622235648","remote":"20260622235648","time":"2026-06-22 23:56:48"},{"local":"20260624","remote":"20260624","time":"20260624"},{"local":"20260625","remote":"20260625","time":"20260625"},{"local":"20260629002608","remote":"20260629002608","time":"2026-06-29 00:26:08"},{"local":"20260629002610","remote":"20260629002610","time":"2026-06-29 00:26:10"},{"local":"20260630","remote":"20260630","time":"20260630"},{"local":"20260707152523","remote":"20260707152523","time":"2026-07-07 15:25:23"},{"local":"20260707170751","remote":"20260707170751","time":"2026-07-07 17:07:51"},{"local":"20260718","remote":"20260718","time":"20260718"},{"local":"20260719020608","remote":"20260719020608","time":"2026-07-19 02:06:08"},{"local":"20260719020609","remote":"20260719020609","time":"2026-07-19 02:06:09"},{"local":"20260721003929","remote":"20260721003929","time":"2026-07-21 00:39:29"},{"local":"20260721173314","remote":"20260721173314","time":"2026-07-21 17:33:14"},{"local":"20260721173315","remote":"20260721173315","time":"2026-07-21 17:33:15"},{"local":"20260725","remote":"20260725","time":"20260725"},{"local":"20260726","remote":"20260726","time":"20260726"},{"local":"20260812","remote":"20260812","time":"20260812"},{"local":"20260816","remote":"20260816","time":"20260816"},{"local":"20260826","remote":"20260826","time":"20260826"},{"local":"20260828","remote":"20260828","time":"20260828"},{"local":"20260829191542","remote":"","time":"2026-08-29 19:15:42"}],"message":"Migrations listed"}
```

## Linked dry-run result

`supabase db push --linked --dry-run` exited `0` and showed exactly one pending forward migration:

- `20260829191542_restrict_beta_onboarding_function_execute.sql`

Exact result:

```text
Initialising login role...
DRY RUN: migrations will *not* be pushed to the database.
Connecting to remote database...
Would push these migrations:
 • 20260829191542_restrict_beta_onboarding_function_execute.sql
{"upToDate":false,"dryRun":true,"migrations":["20260829191542_restrict_beta_onboarding_function_execute.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

`LegacyDbPushMissingRemoteError` was gone. There was no historical migration proposal and no `--include-all`. Sprint 3.44F.5 stopped with the ACL migration unapplied.

## Sprint 3.44F.6 forward deployment and closure

Preflight again proposed only `20260829191542_restrict_beta_onboarding_function_execute.sql`. The normal linked deployment command was:

```sh
supabase db push --linked
```

It exited `0`:

```text
Applying migration 20260829191542_restrict_beta_onboarding_function_execute.sql...
{"upToDate":false,"dryRun":false,"migrations":["20260829191542_restrict_beta_onboarding_function_execute.sql"],"seeds":[],"roles":[],"message":"Finished supabase db push."}
```

Read-only catalog verification produced:

| ACL/integrity check | Result |
| --- | --- |
| PUBLIC EXECUTE | false |
| anon EXECUTE | false |
| authenticated EXECUTE | true |
| service_role EXECUTE | true |
| SECURITY DEFINER | true |
| Identity signature | unchanged, five text arguments |
| Return table | unchanged, ten fields |
| `search_path` | `public, auth` |
| `auth.uid()` assignment/null rejection | retained |

The final linked ledger pairs `20260829191542` local/remote. The final dry run exited `0`:

```text
DRY RUN: migrations will *not* be pushed to the database.
{"upToDate":true,"dryRun":true,"migrations":[],"seeds":[],"roles":[],"message":"Remote database is up to date."}
```

Zero migrations remain pending.

## Manual review sequence

1. Query 17 matched local SQL.
2. The authenticated/service-role ACL target was approved.
3. The 25-file normalization map was approved and applied.
4. Isolated normalization commit `8d752a9` preserved SQL bytes.
5. Pre-repair ledger contained only the two known remote rows.
6. All 20 ordered repairs succeeded.
7. Post-repair ledger pairs all active historical versions.
8. The dry run shows only the ACL migration.
9. Stop. Review/apply that forward migration only in Sprint 3.44F.6.

## Recovery boundaries

- Migration repair changes ledger state only. It does not roll schema or data backward.
- A normalization commit is recovered with an isolated Git revert.
- The forward ACL correction is idempotent role-state SQL; rollback would require a separately reviewed forward ACL decision, not historical file editing.
- Billing sandbox cleanup and Stripe live objects are outside this plan.

## Final checklist

- [x] Query 01–16 outputs retained privately.
- [x] Query 17 exact Payment metadata matches.
- [x] Onboarding ACL disposition approved.
- [x] New ACL migration was applied normally only in Sprint 3.44F.6.
- [x] Full normalization map approved and applied.
- [x] No duplicate remains in the active migration directory.
- [x] Recorded `20260622` and `20260828` identities unchanged.
- [x] Superseded SQL preserved outside the active directory.
- [x] Each repair candidate matches resolved production evidence.
- [x] Ledger captured before repair and commands checked individually.
- [x] Exact inverse commands remain documented.
- [x] Default linked dry run shows only approved post-head SQL.
- [x] No Stripe configuration/data change was combined with ledger repair.

## Exact next manual action

Sprint 3.44G may begin Stripe live-mode production cutover. Do not combine that separate work with database reconciliation.
