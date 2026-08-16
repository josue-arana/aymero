# Lead lifecycle state

Sprint 3.41A makes `resolveLeadLifecycle` the Lead Detail authority for the hero stage, progress tracker, recommendation, actions, Related Records, and the records supplied to Lead Activity.

## Previous sources

- Lead Progress and Next Recommended Action used `getLeadPipelineStage`, which gave an explicit persisted/local Lead pipeline stage precedence.
- Related Records read the asynchronously loaded Estimate and Project directly.
- Lead Activity independently inspected persisted record timestamps.
- This allowed a stale `NEW_LEAD` value to keep Progress at Inquiry even after the Estimate record had loaded.

Lead Activity remains historical and date-driven. It is not used as a workflow engine.

## Precedence

1. Archived Lead
2. Lost Lead
3. Active related Project
4. Active Approved/Converted Estimate or active Contract
5. Active Sent Estimate, preserving a real persisted Follow-up Lead stage
6. Active Draft/Saved/Rejected Estimate
7. Inquiry

An archived Project does not supersede an active Estimate. An archived Estimate remains available in Related Records but does not advance an active Lead. Estimate archive state continues to use Sprint 3.40D's independent-versus-inherited resolver.

Primary Estimate selection uses `lead.estimateId` when present. Without that pointer, it selects the newest active related Estimate deterministically, then the newest archived related Estimate. The Supabase list remains contractor- and Lead/Project-scoped.

## Estimate status audit

| Persisted UI value | Database value | Lifecycle meaning | Existing transition |
| --- | --- | --- | --- |
| Draft | `draft` | Estimate stage; Edit and Send | Builder save/create |
| Saved | `saved` | Estimate stage; Edit and Send | Legacy-compatible service value; not a current list filter |
| Sent | `sent` | Estimate Sent; Follow-up | Send-to-client completion or supported Lead transition |
| Approved | `approved` | Approved; Convert to Job | Supported Lead transition/sample data |
| Rejected | `rejected` | Estimate stage; review/edit/resend | List/filter only; no Lead Detail transition creates it |
| Converted to Contract | `converted` | Approved/converted evidence until a Project exists | Existing Contract conversion |

`Converted to Contract` is persisted by current conversion handlers and is also reinforced by the related Contract. It does not replace Project evidence. Rejected and Converted are terminal document statuses in the current list vocabulary (until a contractor explicitly edits/resends or creates the downstream record); archive state remains a separate `archived_at` value and badge.

## Direct Draft send

Lead Detail navigates to the existing Estimate Builder with a one-time `openSendEstimate` route request. Builder saves/prepares the Estimate, resolves its secure public share URL, and opens the existing `SendToCustomerModal`. The route flag is consumed with history replacement so refresh does not reopen it. Recipient and document-language ownership remain in the existing Builder/send pipeline.

Sent and Approved transitions now preserve authoritative `sent_at`/`approved_at` timestamps for new actions so Lead Activity can remain a persisted historical timeline.
