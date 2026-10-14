# Controlled AI Scope Pipeline

Sprint 3.53F.2 adds an experimental backend-only controlled pipeline without changing the canonical Estimate Builder contract or production defaults.

## Rollout boundary

The existing `AI_SCOPE_ASSISTANT_ENABLED` boundary remains authoritative. The controlled pipeline additionally requires the server-only environment variable `AI_SCOPE_CONTROLLED_PIPELINE_ENABLED=true`. Missing, empty, or any value other than `true` selects the existing legacy implementation. There is no frontend setting for this flag, and this sprint does not enable it in any environment.

The model remains controlled by the existing `AI_SCOPE_MODEL` setting with the existing source default. The controlled pipeline does not select or change a model.

## Stages

Controlled professionalization performs a bounded two-call sequence:

1. Construction interpretation reads the persisted original contractor description and returns a strict structured interpretation.
2. Deterministic application validation rejects malformed, incomplete, unexpected, or inconsistent structures.
3. Professional scope writing receives only the validated interpretation and returns the existing `{ scope, reviewWarnings }` response shape.
4. The existing contractor review and approval workflow remains unchanged.

Translation remains a separate one-call operation after approval. It receives only the current approved contractor scope. Same-language approval still requires no provider call.

All authoritative instructions and instruction versions are maintained in `supabase/functions/_shared/aiScopeAssistantInstructions.js`. Provider contracts and deterministic validators remain in `supabase/functions/_shared/aiScopeAssistant.js`.

## Intermediate contract

The interpretation contract distinguishes `stated`, `interpreted`, and `requires_confirmation` facts and requires source evidence. It supports:

- project title;
- work categories and activities;
- materials, exact quantities, and measurements;
- contractor and homeowner responsibilities;
- conditional work and ambiguities;
- review warnings;
- review-only commercial information, including totals, deposits, balances, itemized prices, additional or unknown costs, and payment schedules.

Commercial information is passed only to the writer so it can keep prices out of the scope and request contractor review. It is not returned to the frontend, persisted, applied to Estimate fields, or exposed publicly.

## Failure behavior and fallback

Each provider call uses the existing authentication, authorization, timeout, model, and provider-error boundaries. The sequence has no loops, recursive calls, autonomous instruction generation, or retries. A malformed or failed interpretation never reaches the writer. A failed writer or translation returns the existing safe error response.

The Edge Function never updates the estimate. On any failure, the persisted original description, candidate, approved scope, translation, and canonical scope remain unchanged. Operators can return to the legacy implementation by leaving the controlled flag disabled.

## Evaluation boundary

`npm run verify:ai-scope-controlled-pipeline` validates instruction versions, strict schemas, stage isolation, response compatibility, arithmetic mismatch detection, both translation directions, failure preservation, feature-flag isolation, and deterministic fixtures for kitchen quartz, roof replacement, kitchen flooring, and cabinet hardware.

These source tests validate contracts and expected fixture semantics; they do not establish live-model quality, latency, token use, or cost. A guarded non-production runtime comparison is required before enabling the flag.
