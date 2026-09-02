# Aymero greenfield database bootstrap

Aymero's original SQL schema predates its active migration directory. The active migrations are a forward history from that already-existing schema and cannot initialize an empty Supabase project by themselves. Production is reconciled against that historical model; all new schema changes continue to use ordinary forward migrations and are validated in staging before production.

## Environment boundary

| Environment | Project | Ref | Region |
| --- | --- | --- | --- |
| Production | Aymero - Production | `qespkkmxaxzsfqrlghev` | `us-east-1` |
| Staging | Aymero Staging | `mhaxxekgupjxifmjukop` | `us-east-1` |

The greenfield bootstrap is for **empty non-production projects only**. Never run it against Aymero Production or a populated project. It creates schema objects only and never copies contractor, customer, auth, billing, webhook, Stripe, storage-object, or secret data.

## Audit conclusion

The current `supabase/schema.sql` is not itself the historical baseline: it includes the locally pending Scope Assistant column and omits later migration-owned objects such as SaaS billing tables and final RLS policies. Production's already-completed reconciliation proves the durable effects through `20260829191542`. The reproducible greenfield state is therefore the immutable pre-migration schema plus the reusable historical migrations below.

| Version/file | Classification | Empty-environment treatment |
| --- | --- | --- |
| `20260622_create_miguel_contractor_profile.sql` | Production/account data | Do not execute; reconcile as intentionally excluded |
| `20260622235647_enable_self_service_beta_onboarding.sql` | Schema evolution | Replay |
| `20260622235648_link_miguel_contractor_membership.sql` | Production/account data | Do not execute; reconcile as intentionally excluded |
| `20260624_enable_payments_supabase_beta.sql` | Schema evolution | Replay |
| `20260625_enable_events_supabase_beta.sql` | Schema evolution | Replay |
| `20260629002608_enable_project_photos_storage_beta.sql` | Schema/storage foundation | Replay |
| `20260629002610_fix_project_photos_identity_rls.sql` | Schema/RLS evolution | Replay final active history |
| `20260630_add_analytics_mode_to_company_settings.sql` | Schema evolution | Replay |
| `20260707152523_add_client_language_preferences.sql` | Schema evolution | Replay |
| `20260707170751_add_estimate_language.sql` | Schema evolution | Replay |
| `20260718_add_premium_onboarding_state.sql` | Schema evolution | Replay; backfill is empty-safe |
| `20260719020608_add_sample_workspace_manifest.sql` | Schema evolution | Replay |
| `20260719020609_connect_sample_workspace_journey.sql` | Schema evolution | Replay; cleanup is empty-safe |
| `20260721003929_enable_invoices_supabase_rls.sql` | Schema/RLS evolution | Replay |
| `20260721173314_enable_contracts_delete_rls.sql` | Schema/RLS evolution | Replay |
| `20260721173315_enable_estimates_delete_rls.sql` | Schema/RLS evolution | Replay |
| `20260725_add_company_accepted_payment_methods.sql` | Schema evolution | Replay; normalization is empty-safe |
| `20260726_add_invoice_customer_notes.sql` | Schema evolution | Replay |
| `20260812_add_public_client_portal_tokens.sql` | Schema evolution | Replay; token backfill is empty-safe |
| `20260816_add_public_estimate_share_tokens.sql` | Schema evolution | Replay; token backfill is empty-safe |
| `20260826_add_saas_billing_foundation.sql` | Schema/security evolution | Replay with zero billing rows |
| `20260828_add_billing_subscription_cancel_at.sql` | Schema evolution | Replay |
| `20260829191542_restrict_beta_onboarding_function_execute.sql` | Forward ACL correction | Replay |
| `20260831_add_estimate_scope_assistant_state.sql` | Genuinely pending forward migration | Exclude from baseline; apply normally afterward |
| `20260901143000_enable_core_crm_rls.sql` | Forward RLS reconciliation | Apply normally after the baseline; materializes the existing standalone core CRM policies in active history |

The archived `20260628211023_add_simple_mode_to_company_settings.sql` and `20260629002609_fix_project_photos_rls.sql` files remain superseded/history-only and are neither replayed nor recorded in a new active ledger.

## Historical baseline model

`supabase/bootstrap/greenfield-manifest.json` identifies the immutable pre-migration schema at Git commit `b8ee1e7c58b6c5a86d25173256c6883984f0db4c`. The bootstrap verifies its SHA-256 before use and rejects any baseline containing row-data statements. The Scope Assistant column is absent from this historical schema.

The guarded bootstrap script materializes that schema only inside a temporary Supabase workspace, then replays every reusable historical migration through `20260829191542`. It never places the baseline in `supabase/migrations`, so production will never propose it as a forward migration.

Two active versions are production-only historical data setup and are never executed in reusable environments:

- `20260622_create_miguel_contractor_profile.sql`
- `20260622235648_link_miguel_contractor_membership.sql`

After the schema effects are installed, the script removes its temporary ledger marker and records those two versions as intentionally satisfied without executing their data SQL. The two archived superseded migrations remain outside active history and are not recorded. Forward migrations remain pending so they can be validated normally after the historical baseline. During staging runtime preparation, authenticated estimate creation proved that the standalone Settings/Clients/Leads/Projects/Estimates/Contracts beta policy files had never been represented in active migration history. `20260901143000_enable_core_crm_rls.sql` closes that greenfield gap without changing historical migrations or weakening tenant checks.

## Safe bootstrap sequence

First verify the target directly:

```bash
supabase projects list
```

For the current staging project:

```bash
node scripts/bootstrap-aymero-greenfield.mjs \
  --project-ref mhaxxekgupjxifmjukop \
  --expected-project-name "Aymero Staging" \
  --confirm-empty-non-production
```

The script verifies the ref/name through the management API before each write, rejects the production ref, verifies there are zero public application tables, verifies the baseline hash and schema-only content, and uses `--project-ref` for every database or ledger mutation.

After successful historical reconciliation, verify that only the forward Scope Assistant migration is pending:

```bash
supabase db push --project-ref mhaxxekgupjxifmjukop --dry-run
```

Then apply it normally:

```bash
supabase db push --project-ref mhaxxekgupjxifmjukop --yes
```

Never use these commands with `qespkkmxaxzsfqrlghev` during staging validation.

Run the staging-only catalog assertions after the forward migration. This uses a temporary assertion-only migration and then removes its ledger entry; it refuses the production ref and verifies the target identity before both writes:

```bash
node scripts/verify-aymero-staging-schema.mjs \
  --project-ref mhaxxekgupjxifmjukop \
  --expected-project-name "Aymero Staging"
```

## Frontend and functions

Local or preview frontend configuration belongs in ignored environment files and must use the staging Supabase URL and staging publishable/anon key. Do not commit browser configuration or enable the AI client flag during database bootstrap.

Staging Function secrets belong only in the Aymero Staging Supabase secret store. Never copy production Stripe keys, webhook secrets, customer mappings, or live billing data. Function deployment and AI configuration occur only after database reconciliation succeeds.

## Promotion

Forward migrations are validated in staging, reviewed, committed, and then proposed separately to production with an explicit production change approval. The historical greenfield bootstrap is never promoted or applied to production.
