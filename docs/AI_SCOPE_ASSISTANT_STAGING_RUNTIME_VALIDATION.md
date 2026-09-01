# AI Scope Assistant staging runtime validation

Validated September 1, 2026 against **Aymero Staging** (`mhaxxekgupjxifmjukop`). Production (`qespkkmxaxzsfqrlghev`) remained unlinked and unchanged.

## Runtime configuration

- Deployed function: `ai-scope-assistant`, ACTIVE, JWT verification enabled, version 7 after staging secret updates.
- Staging secrets verified without reading their plaintext values: `OPENAI_API_KEY` exists, `AI_SCOPE_ASSISTANT_ENABLED=true`, and `AI_SCOPE_MODEL=gpt-5.6-luna`.
- Local `.env.local` targets staging, keeps `VITE_AI_SCOPE_ASSISTANT_ENABLED=true`, is Git-ignored, and has mode `0600`.
- No production AI flag, secret, function, database migration, or customer record was changed.

## First Luna gate

Synthetic Spanish source:

> quitar vanity viejo poner vanity nuevo cambiar toilet pintar baño instalar espejo y dos luces materiales no incluidos

Luna output:

> Retirar el vanity viejo e instalar un vanity nuevo; cambiar el inodoro; pintar el baño; e instalar un espejo y dos luces. Los materiales no están incluidos.

Result: **PASS**. Removal and installation of the vanity, toilet replacement, bathroom painting, mirror installation, exactly two lights, and the materials exclusion were preserved. No price, warranty, permit, code, cleanup, disposal, dimension, or other commitment was introduced. The candidate persisted while the canonical estimate scope remained unchanged.

Usage: 262 input tokens, 199 output tokens (including 142 reasoning tokens), 461 total tokens.

## Controlled semantic evaluation

| Case | Action | Fidelity result | Warning result |
| --- | --- | --- | --- |
| Spanish bathroom renovation | Professionalize | PASS | None |
| Materials not included | Professionalize | PASS | None |
| Exact 36 × 48 dimensions and “only” qualification | Professionalize | PASS | None |
| Exact 12 pulls and 3 hinges | Professionalize | PASS | None |
| Conditional siding repair and painting exclusion | Professionalize | PASS | None |
| Approximately eight boards, if needed | Professionalize | PASS; ambiguity preserved | None required because ambiguity remained explicit |
| Four outlets supplied by owner | Professionalize | PASS; no code/permit/GFCI claim | None |
| Living room, bedroom, and kitchen scopes | Professionalize | PASS | None |
| English door replacement with customer disposal | Professionalize | PASS | None |
| Approved Spanish scope to English | Translate | PASS | N/A |
| Same-language Spanish client path | Professionalize | PASS; no translation call | None |

The controlled suite used 2,483 input tokens and 648 output tokens, including 275 reasoning tokens, for 3,131 total tokens. Including the first gate, the successful Luna evaluation used 2,745 input tokens and 847 output tokens, including 417 reasoning tokens, for 3,592 total tokens across 11 successful provider requests.

At current standard Luna pricing of $0.20 per million input tokens and $1.20 per million output tokens, the approximate successful-evaluation cost was:

`(2,745 × $0.20 / 1,000,000) + (847 × $1.20 / 1,000,000) = $0.0015654`

The one intentionally invalid-model failure returned no usage metadata and is treated as zero provider-token cost.

## State and trust-boundary evidence

- Spanish professionalization was approved before translation.
- Translation used the exact approved Spanish snapshot and preserved every work item, materials exclusion, and quantities.
- A contractor-draft edit preserved the previous approved snapshot, changed approval and translation to stale, invalidated canonical acceptance, and blocked send readiness.
- Explicit reapproval replaced the snapshot; no implicit approval occurred.
- A manual client-version edit preserved the approved contractor source, set `clientScopeManuallyEdited=true`, invalidated canonical acceptance, and blocked send readiness until explicit reacceptance.
- Generated, approved, translated, manually edited, accepted, and stale states survived authenticated REST reloads from staging.
- Same-language approval made the exact approved contractor scope canonical without a translation provider request.
- Manual estimates remained unaffected by assistant send-readiness rules.
- Tenant A/B cross-invocations returned `404 ESTIMATE_UNAVAILABLE` without returning cross-tenant content.
- The converted estimate returned `409 ESTIMATE_NOT_EDITABLE` before provider invocation.
- An intentionally invalid staging model returned `502 AI_SCOPE_PROVIDER_REQUEST_INVALID`. The canonical scope, assistant state, approved snapshot, prior candidate, prior translation, and canonical acceptance were byte-for-byte unchanged. Luna was restored immediately and verified afterward.

## Privacy and public isolation

The deployed implementation logs only action, estimate ID, prompt version, model, elapsed time, safe error name/message/code, and provider status. It does not log the OpenAI key, bearer token, privileged Supabase credentials, source text, approved scope, provider response, or full webhook/request payload. HTTP failures keep a generic user-facing message.

Hosted log-stream inspection was not completed in this run because the available Supabase CLI session is keychain-restricted and no controllable authenticated Dashboard browser was connected. Runtime HTTP behavior and source-level logging posture passed, but a Dashboard log spot-check remains a pilot condition.

Public isolation is **SOURCE-VERIFIED**: `super-endpoint` selects the canonical `scope_of_work` but does not select or serialize `scope_assistant_state`, raw contractor input, drafts, approvals, fingerprints, or member identifiers. `super-endpoint` remained intentionally undeployed in staging.

## Responsive and keyboard evidence

Source-level verification confirms:

- action buttons are full-width on mobile and at least 44 px high, becoming auto-width at `sm`;
- action groups stack on mobile and wrap from `sm` upward;
- contractor/client columns remain one column until `xl`;
- content containers use `min-w-0` to prevent long localized text from forcing horizontal overflow;
- status and error text use `role="status"` and `role="alert"` rather than color alone;
- native buttons, textareas, and `details`/`summary` controls are keyboard reachable;
- textareas have accessible labels and summary controls have visible focus rings.

Live viewport inspection at 320/375/390/430 px and desktop, plus an end-to-end keyboard traversal, was not completed because no controllable browser surface was available. These remain limited-pilot conditions rather than inferred runtime passes.

## Production RLS read-only finding

Classification: **B — production appears to be missing equivalent core CRM RLS**.

The read-only production migration ledger ends at the reconciled 23-migration baseline and does not contain either the Scope Assistant migration (`20260831`) or the core CRM RLS migration (`20260901143000`). Staging has both and its authenticated cross-tenant read/write checks pass. No production policy or table was changed. A dedicated production security review must inspect live `pg_class.relrowsecurity` and `pg_policies` before any separately approved RLS rollout.

## Decision

**GO WITH CONDITIONS** for a limited staging/internal pilot using Luna.

Luna passed every critical semantic fixture, so Terra was not invoked and no runtime fallback was added. Before production promotion:

1. Spot-check hosted staging function logs for secret/source leakage.
2. Complete live mobile viewport and keyboard testing.
3. Resolve the production core CRM RLS finding in a dedicated, separately approved security rollout.
4. Re-run the guarded staging verification immediately before promotion.
5. Promote the reviewed migrations and `ai-scope-assistant` function under a production change window.
6. Configure production server secrets directly, including `AI_SCOPE_MODEL=gpt-5.6-luna`, while leaving the production client flag off.
7. Run one synthetic/authorized production smoke test, inspect logs and usage, then enable the production client flag for a limited pilot only.

These are future steps only; none were executed by this validation.
