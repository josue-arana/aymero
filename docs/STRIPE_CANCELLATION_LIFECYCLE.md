# Stripe cancellation and reactivation lifecycle audit

## Decision

No migration is required for the beta cancel-at-period-end lifecycle. Keep Stripe self-service cancellation disabled until the sandbox acceptance plan below passes.

Aymero already persists the minimum state needed for correct presentation:

- `status`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `last_payment_status`

The schema does not persist Stripe `cancel_at`, `canceled_at`, `cancellation_details`, or `ended_at`. They are not required for this beta UX. `current_period_end` supplies the access-through date while cancellation is scheduled, and final `status=canceled` supplies the ended state. In particular, Stripe documents that `canceled_at` can represent when cancellation was requested rather than when service actually ended, so using it as an access boundary would be misleading.

## Authoritative state transitions

| Lifecycle | Stripe event/state | Aymero presentation | Checkout |
| --- | --- | --- | --- |
| Active | `status=active`, `cancel_at_period_end=false` | Active, next billing date, payment status | Blocked |
| Cancellation scheduled | `customer.subscription.updated`; `status=active`, `cancel_at_period_end=true` | Active — Cancels on persisted period end; access remains through that date | Blocked |
| Reactivated before period end | `customer.subscription.updated`; `cancel_at_period_end=false` | Normal Active and renewal presentation | Blocked |
| Cancellation effective | `customer.subscription.deleted`; `status=canceled` | Canceled, subscription ended, Subscribe Again | Allowed |
| Re-subscribed | New Stripe Subscription ID | New current row; normal Checkout return synchronization | Blocked after synchronization |

The webhook upserts on unique `stripe_subscription_id`. A new subscription therefore creates a new row instead of overwriting the canceled row. The model is one row per Stripe Subscription, preserving subscription history for each contractor. The frontend selects the newest row by `created_at desc`; this is the current subscription view, not a one-row-forever model.

Checkout’s server-side blocking statuses remain `active`, `trialing`, `past_due`, `unpaid`, `paused`, and `incomplete`. An active subscription scheduled to cancel remains active and is blocked. A fully canceled row is excluded and permits Checkout. The unique `billing_customers.contractor_id` mapping is reused, so a new subscription stays on the same Stripe Customer. Tenant ownership remains the authenticated active membership → `contractors.id` → billing customer mapping, with no email or company-name fallback.

Portal return polling performs bounded authoritative reads so delayed webhooks can surface scheduled cancellation or reactivation. The browser never changes subscription state locally and CRM access remains non-blocking in every billing state.

## Sandbox acceptance plan

1. Keep live mode unchanged. In Stripe test mode, open **Settings → Billing → Customer portal**.
2. Enable subscription cancellation and select **At the end of the billing period**. Do not enable immediate cancellation, plan switching, quantities, or prorations.
3. Open Aymero as an active contractor Owner/Admin, select **Manage Subscription**, and schedule cancellation.
4. Confirm Stripe sends `customer.subscription.updated` with `status=active` and `cancel_at_period_end=true`.
5. Return to Aymero and confirm **Active — Cancels [date]**, the access-through message/date, and no Subscribe Again action.
6. Reopen subscription management and reactivate before period end.
7. Confirm another `customer.subscription.updated` has `cancel_at_period_end=false`, then confirm Aymero returns to normal Active/next-billing presentation.
8. Schedule cancellation again and confirm the scheduled state a second time.
9. Use a Stripe test clock where practical, or advance the test subscription to its period end. Confirm Stripe sends `customer.subscription.deleted` and the stored row becomes `status=canceled`.
10. Confirm Aymero shows Canceled, the ended message, and **Subscribe Again**, while all CRM routes remain available.
11. Select Subscribe Again and complete Checkout.
12. Confirm `billing_customers.stripe_customer_id` is unchanged, a new Stripe Subscription ID is created, and a new `billing_subscriptions` row is persisted without overwriting the canceled row.
13. Confirm the new row becomes the Subscription page’s current state and duplicate Checkout is blocked again.
14. Replay one lifecycle webhook event and confirm the event ledger returns duplicate success without a second mutation.
15. Repeat a cross-contractor RLS read test before considering beta enablement.

Do not enable cancellation in live mode until scheduled cancellation, reactivation, effective cancellation, re-subscription, customer reuse, and cross-tenant isolation all pass this plan.
