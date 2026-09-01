# AI Scope Assistant foundation

Sprint 3.45A adds an optional, versioned state boundary for estimate scope assistance. It does not change the canonical estimate flow: `estimates.scope_of_work` remains the only scope consumed by public estimates, PDFs, messages, and estimate-to-contract conversion. An empty `scope_assistant_state` object means the assistant has never been used and manual estimates retain their existing behavior.

## State and trust boundaries

Version 1 stores the raw contractor input, editable contractor draft, contractor language, explicit approved snapshot and approver metadata, client-language result, and small generation metadata. Generated text is only a candidate. Approval snapshots the current draft. Later draft edits preserve that snapshot while making approval and derived translation stale. A client-language change also makes an existing translation stale.

Sprint 3.45B extends the same version backward-compatibly with `clientScopeManuallyEdited` and a small `canonicalAcceptance` object containing only the accepted source (`contractor` or `client`), acceptance timestamp, and scope fingerprint. These fields distinguish an edited client version and prove which exact assistant output was explicitly accepted into canonical `scope_of_work`; no history subsystem is introduced.

The authenticated `ai-scope-assistant` Edge Function accepts only `action` and `estimateId`. It resolves one active, non-archived membership, enforces estimate tenant ownership and editability, and reads all source text and languages from the persisted estimate. Translation requires the persisted approval status and uses only `approvedContractorScope`. A matching contractor/client language returns that approved text without contacting OpenAI.

The function never updates an estimate. The caller must explicitly apply a successful candidate through the state helpers and a normal estimate save. Timeouts, provider errors, rate limits, refusals, malformed structured output, and validation failures therefore leave both `scope_of_work` and assistant state unchanged.

## Fingerprints

Source fingerprints use SHA-256 through Web Crypto. Normalization converts CRLF or CR line endings to LF and trims only leading/trailing whitespace. Interior whitespace, punctuation, casing, and wording remain significant. This intentionally makes any meaningful persisted source edit produce a new fingerprint without adding a hashing dependency.

## Provider contract and limits

The server calls the OpenAI Responses API directly with `store: false`, low reasoning effort, no tools, and strict JSON Schema output. The initial default model is `gpt-5.6-terra`; `AI_SCOPE_MODEL` can override it. Prompt contracts are versioned as `professionalize-v1` and `translate-v1`.

Persisted sources and returned scope text are limited to 12,000 characters. Professionalization permits at most five semantic-uncertainty warnings of 300 characters each. Prompts, provider payloads, reasoning, authorization data, and secrets are not persisted or returned.

## Configuration and rollout

The function is disabled unless `AI_SCOPE_ASSISTANT_ENABLED=true`. It also requires the server-only `OPENAI_API_KEY`; `AI_SCOPE_MODEL=gpt-5.6-terra` is the intended initial configuration. Keep JWT verification enabled. These values belong in Supabase function secrets/configuration, never Vite/browser environment variables.

Apply `20260831_add_estimate_scope_assistant_state.sql`, configure the server variables, and deploy only `ai-scope-assistant` when the pilot is approved. Sprint 3.45A does not deploy the migration or function and does not add Estimate Builder UI.

The public `super-endpoint` continues to use an explicit estimate select that omits `scope_assistant_state`. Do not expose this internal workflow state through public estimate or project payloads.
