# Aymero Staging runtime preparation

This runbook prepares the already-reconciled **Aymero Staging** project for Scope Assistant runtime validation without changing production or importing any production/customer/Stripe data.

| Environment | Project | Ref | Allowed action in this runbook |
| --- | --- | --- | --- |
| Staging | Aymero Staging | `mhaxxekgupjxifmjukop` | Synthetic Auth/CRM data, Scope Assistant function and AI flags |
| Production | Aymero - Production | `qespkkmxaxzsfqrlghev` | Read-only unchanged comparison only |

## Guarded synthetic setup

The repository must be linked to staging. Confirm both the local marker and management API result before every remote write:

```bash
sed -n '1p' supabase/.temp/project-ref
supabase projects list
```

Both must identify `mhaxxekgupjxifmjukop` as linked and production as not linked.

Audit Auth and the active target without changing data:

```bash
npm run prepare:staging-runtime
```

Create or reconcile the synthetic fixtures only after that audit passes:

```bash
npm run prepare:staging-runtime -- --apply
```

The preparation command is idempotent and refuses the production ref. It:

- reads the staging publishable and service-role keys in-process without printing them;
- creates confirmed synthetic Auth users `staging.owner@aymero.co` and `staging.isolation@aymero.co` through the staging Auth admin API;
- stores generated passwords only in ignored `.env.staging.test.local` with mode `0600`;
- signs in both users and creates both contractors/memberships through the real authenticated `complete_beta_contractor_onboarding` RPC;
- creates two primary synthetic clients (English and Spanish), the associated leads and editable draft estimates;
- creates one approved estimate and converts it to a draft contract through authenticated, tenant-scoped REST writes;
- creates the minimum isolation-tenant estimate;
- proves each tenant can read its own data and Tenant A cannot read or update Tenant B records;
- proves staging billing customer/subscription rows remain empty.

The onboarding RPC intentionally creates the member with the database default language. The current membership RLS allows selection but no browser update. For these staging-only synthetic fixtures, the script uses its already-required Auth admin context for the narrow `preferred_language = 'es'` correction after normal onboarding. It also sets Spanish app/portal language and completed onboarding state on the synthetic company settings. This does not weaken RLS or change production.

The first authenticated staging seed exposed a greenfield-only RLS history gap: the standalone core CRM beta policy files were not active migrations. Estimates had a DELETE-only policy from a later migration, while several earlier CRM tables did not have RLS enabled. The additive `20260901143000_enable_core_crm_rls.sql` migration materializes those existing membership-based policies for contractors, memberships, settings, clients, leads, projects, estimates, and contracts. Apply it to staging normally; do not repair or push it to production in this sprint.

## Staging Auth posture

The public `/auth/v1/settings` audit records only safe booleans. The required posture is:

- email/password provider enabled;
- signup allowed;
- email confirmation required;
- no production identity or password reuse.

The script admin-confirms only the two synthetic staging accounts, avoiding a dependency on email delivery while leaving project-wide confirmation requirements unchanged. The local redirect origin is `http://localhost:5173`. Remote hosted redirect allowlists remain a Dashboard configuration concern and are not changed by this runbook.

## Local frontend configuration

`--apply` writes ignored `.env.local` with the staging URL, staging browser-safe publishable key, local site/app/portal/auth origins, developer routes enabled, and the AI client flag initially disabled. If an earlier `.env.local` exists, it is copied once to ignored `.env.production.local` before staging becomes active.

Before AI UI validation, start the local app and verify ordinary login, contractor resolution, client loading, Estimate Builder open/save/preview, and the manual contract flow:

```bash
npm run dev
```

Credentials are in `.env.staging.test.local`; do not paste them into chat or commit them.

Only after the ordinary workflow passes, enable the client flag while preserving the same staging guard and fixtures:

```bash
npm run prepare:staging-runtime -- --apply --enable-ai-client
```

This writes `VITE_AI_SCOPE_ASSISTANT_ENABLED=true` to the ignored local environment. Restart Vite after changing the flag. The assistant must appear only after the flag is enabled; it must not request automatically or while typing. The Improve action remains explicit. `USE_SUPABASE` stays `false`; existing entity-specific Supabase beta flags and Auth remain the current data path.

To restore the prior local production-facing configuration when needed:

```bash
cp .env.production.local .env.local
```

This only changes ignored local configuration. It does not modify Netlify or any deployed frontend environment.

## Staging Edge Function and AI flags

Only the Scope Assistant function is required for Sprint 3.45C preparation. Reconfirm the target immediately before deploying it:

```bash
sed -n '1p' supabase/.temp/project-ref
supabase projects list
supabase functions deploy ai-scope-assistant \
  --project-ref mhaxxekgupjxifmjukop \
  --use-api
```

Do not pass `--no-verify-jwt`; `supabase/config.toml` keeps JWT verification enabled. Do not deploy billing functions or `super-endpoint` for this preparation sprint. The public endpoint already excludes `scope_assistant_state` by explicit selection, but runtime public-share validation can remain in resumed Sprint 3.45C if `super-endpoint` is not needed for the private Estimate Builder smoke path.

Set only the non-secret server flags from the CLI:

```bash
supabase secrets set \
  --project-ref mhaxxekgupjxifmjukop \
  AI_SCOPE_MODEL=gpt-5.6-terra \
  AI_SCOPE_ASSISTANT_ENABLED=true
```

The user sets `OPENAI_API_KEY` directly at **Supabase Dashboard → Aymero Staging → Edge Functions → Secrets**:

`https://supabase.com/dashboard/project/mhaxxekgupjxifmjukop/functions/secrets`

Add the name `OPENAI_API_KEY`, paste the value there, and save. Do not put it in `.env.local`, a command line, source control, screenshots, or chat.

Afterward, verify presence only:

```bash
supabase secrets list --project-ref mhaxxekgupjxifmjukop
```

The names `OPENAI_API_KEY`, `AI_SCOPE_MODEL`, and `AI_SCOPE_ASSISTANT_ENABLED` must exist. The CLI returns digests, not secret values. Secret presence does not by itself prove that a key is valid.

The configured model remains `gpt-5.6-terra`. The implementation uses the OpenAI Responses API, disables response storage, and requests strict JSON-schema output. Full semantic fixtures and prompt changes remain out of scope for this preparation sprint.

## Runtime security sequence

After the real OpenAI key exists and before the optional infrastructure smoke request:

1. Use Tenant A's authenticated session to invoke `ai-scope-assistant` with Tenant A's editable estimate ID. This is the one path that may reach the provider.
2. Use Tenant A's session with Tenant B's estimate ID. Expect `404 ESTIMATE_UNAVAILABLE`; it must not reach the provider.
3. Use Tenant A's session with the converted estimate ID. Expect `409 ESTIMATE_NOT_EDITABLE`; it must not reach the provider.
4. Send any browser-supplied `contractorId`, `source`, or `rawSource`. Expect `400 INVALID_REQUEST`; the server accepts only `action` and `estimateId` and loads scope/tenant state itself.
5. Inspect only staging function logs. Confirm no API key, bearer token, service-role key, or full provider payload is logged.

The optional provider smoke request is limited to one synthetic request after all preceding checks pass. Do not run the 10-case semantic evaluation set in this sprint.

## Verification

Run:

```bash
npm run verify:database-reconciliation
npm run verify:staging-schema -- --project-ref mhaxxekgupjxifmjukop --expected-project-name "Aymero Staging" --allow-synthetic-runtime-data
npm run verify:staging-runtime
npm run verify:ai-scope-assistant
npm run verify:ai-scope-builder
npm run verify:estimate-finalization
npm run verify:language-ownership
npm run verify:ui-consistency
npm run build
git diff --check
```

Run `verify:estimate-share-resolution` only if `super-endpoint` is deployed for runtime public-share validation. Do not repair unrelated time-sensitive fixtures during this sprint.
