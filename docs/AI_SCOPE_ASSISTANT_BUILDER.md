# AI Scope Assistant Estimate Builder workflow

Sprint 3.45B integrates the optional Scope Assistant into the existing Scope of Work section. The workflow is not a chatbot and does not create a new route. When `scope_assistant_state` is `{}`, the existing manual editor, Save, Preview, Send, and contract conversion behavior remain unchanged.

## Workflow

`Improve Scope` first saves the current estimate and initializes persisted raw notes. Only a successful persistence result with an estimate ID permits the authenticated AI request. The returned professionalized candidate is separately saved and reviewed; it does not modify canonical `scope_of_work`.

Candidate edits use the shared state helper and make prior approval and translation stale without mutating the approved snapshot. Regeneration saves current progress, then reuses the persisted raw notes through the trusted Edge Function. Explicit approval snapshots the exact candidate and records the approving membership when available.

When contractor and client languages match, approval also explicitly accepts that approved snapshot as canonical and persists it to `scope_of_work`; no translation request occurs. When languages differ, translation remains a separate explicit action. It uses only the persisted approved source. The translated client candidate remains internal until `Use Client Version` fingerprints its acceptance and persists that exact text as canonical.

The translated client candidate may be edited. `clientScopeManuallyEdited=true` records that it is no longer an untouched machine translation while preserving the contractor-approved source. Any client edit clears prior canonical acceptance and requires `Use Client Version` again.

## Send readiness

Manual estimates are always outside assistant gating. Active assistant estimates block Send for unapproved or stale contractor changes, missing/stale translation, unaccepted contractor/client output, or canonical text that no longer exactly matches the accepted assistant output. Save remains available for incomplete workflows. Preview continues to render only the current canonical scope and shows a compact warning when assistant work is incomplete.

## Feature flags

The server-side `AI_SCOPE_ASSISTANT_ENABLED=true` flag remains authoritative. The non-secret build-time `VITE_AI_SCOPE_ASSISTANT_ENABLED=true` hint exposes the pilot controls in the Estimate Builder. If the client hint is false, manual estimates show no AI controls. Secrets, model selection, prompts, source text, and contractor identity are never placed in the browser request.

No migration, function, secret, or feature flag is deployed by this sprint.
