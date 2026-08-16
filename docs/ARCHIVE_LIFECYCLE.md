# Aymero archive lifecycle audit

Sprint 3.40D establishes archive state as separate from workflow status. Persisted Supabase entities use `archived_at`; UI records normalize that to `archivedAt`/`isArchived`. Local immediate-state ID registries remain supported so an action updates the interface before the next fetch.

| Entity | Persisted archive / status | Active vs archived views | Detail/action ownership | Propagation |
| --- | --- | --- | --- | --- |
| Lead | `leads.archived_at`; pipeline/status fields remain unchanged | Leads list checks persisted fields and the immediate archive-ID registry before status/search filtering | Lead list/detail call the contractor-scoped Lead service; archived records expose Restore and permanent delete | A Lead-only, unconverted Estimate may inherit display/filter archive state. Client, Contract, Project, payments, invoices, and events remain unchanged. |
| Estimate | `estimates.archived_at`; `status` remains Draft/Sent/Approved/Rejected/Converted | Estimate list and Builder use `resolveEstimateArchiveState` | Manual archive/restore mutate only the Estimate. Inherited Restore explicitly restores the owning Lead. Permanent delete is rejected by the App handler unless the canonical archive state is true. | Inherits only when its Lead is archived, it has no Project association, and it has no conversion/Contract evidence. |
| Contract | `contracts.archived_at`; contract status remains independent | Contract list/detail use the Contract record fields | Existing Contract service and contractor-only Restore/delete actions remain canonical | None. Lead or Project archive does not mutate the Contract. |
| Project / Job | `projects.archived_at`; derived project lifecycle status remains separate | Jobs and Project Workspace check persisted fields plus the immediate Project archive-ID registry | Existing Project service and archived-only Restore/delete UI remain canonical | None. Project archive does not mutate Lead, Client, Estimate, Contract, payments, invoices, or events. |
| Client | `clients.archived_at`; client presentation status is derived | Client list/profile check persisted fields plus the immediate Client archive-ID registry | Existing Client service and archived-only Restore/delete UI remain canonical | None. Lead archive intentionally leaves the long-lived Client active. |
| Invoice | `invoices.archived_at`; invoice status remains independent | Invoice list, Invoice Detail, Dashboard financial inputs, filters, and metrics now check both the persisted field and immediate archive-ID registry | Existing Invoice service and archived-only Restore/delete UI remain canonical | None. |
| Calendar Event | `events.archived_at`; event status remains independent | Calendar/Project schedule helpers exclude archived events from active/upcoming views and surface them only in archived contexts | Existing Event service and Project Schedule actions remain canonical | None. Lead/Project archive does not mutate Events. |

## Estimate archive decision

`resolveEstimateArchiveState` returns both the effective state and its source:

- `source: estimate`: the Estimate was independently archived and remains archived when its Lead is restored.
- `source: lead`: a Lead-only unfinished Estimate inherits the owning Lead's archive state. No Estimate workflow status is mutated.
- `source: null`: the Estimate is active.

This derived ownership model needs no migration because independent ownership remains represented by `estimate.archived_at`, while inherited ownership is represented by the still-existing Lead relationship plus the Lead's archive state. Converted and Project-associated Estimates never inherit.

## Filtering and metrics audit

- Lead list search applies its selected active/archived scope before returning a matching record.
- Estimate active/status filters and counts use the canonical effective archive state.
- Dashboard Pending Estimates and its mobile attention summary exclude independently or effectively archived Estimates.
- Client search remains scoped to the selected Active or Archived view.
- Jobs and Project Workspace already used persisted Project fields and immediate IDs.
- Dashboard pipeline metrics and recent projects receive Leads whose Lead and linked Project are both active. Persisted Project archive fields and immediate Project archive/delete registries are both honored.
- Dashboard invoices now exclude records archived either in persisted data or immediate state, preventing archived invoices from contributing to outstanding balance and recent activity.
- The Topbar search control has no implemented result provider, so there is no global result set to reclassify in this sprint.

## Known boundary

Permanent-delete enforcement for most entities remains an application/UI convention backed by confirmation dialogs; several low-level Supabase service delete methods are contractor-scoped but do not independently require `archived_at IS NOT NULL`. Sprint 3.40D adds an App-level canonical archive guard for Estimates and preserves the existing UI guards elsewhere. Strengthening every service into a two-step archived-only delete contract would be a separate backend-hardening change.
