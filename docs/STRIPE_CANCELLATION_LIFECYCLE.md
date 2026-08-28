# Stripe cancellation and reactivation lifecycle audit

## Decision and observed Stripe shape

Manual sandbox testing showed that Stripe can schedule end-of-period cancellation with this shape:

```text
status = active
cancel_at_period_end = false
cancel_at = <future timestamp>
canceled_at = <request timestamp>
ended_at = null
```

The previous model dropped `cancel_at` and therefore rendered a false next-billing date. Migration `20260828_add_billing_subscription_cancel_at.sql` adds only nullable `cancel_at timestamptz`; the webhook converts Stripe's timestamp with the shared UTC timestamp helper.

Aymero persists the minimum state needed for correct presentation:

- `status`
- `current_period_start`
- `current_period_end`
- `cancel_at_period_end`
- `cancel_at`
- `last_payment_status`

The schema intentionally does not persist Stripe `canceled_at`, `cancellation_details`, or `ended_at`. `cancel_at` is the scheduled service-end timestamp. `canceled_at` can represent when cancellation was requested while service remains active and is not an access boundary. `ended_at` can remain null until termination. Final cancellation remains authoritative only when `status=canceled`.

Aymero's canonical scheduled-cancellation rule is: the subscription is not finally canceled and either `cancel_at_period_end=true` or `cancel_at` is a valid future timestamp. Its access-through date uses a valid `cancel_at` first, then `current_period_end` only for the boolean shape. Dates are never fabricated.

## Authoritative state transitions

| Lifecycle | Stripe event/state | Aymero presentation | Checkout |
| --- | --- | --- | --- |
| Active | `status=active`, `cancel_at_period_end=false` | Active, next billing date, payment status | Blocked |
| Cancellation scheduled (shape A) | `customer.subscription.updated`; `status=active`, `cancel_at_period_end=true`, `cancel_at=null` | Active — Cancels on persisted period end; access remains through that date | Blocked |
| Cancellation scheduled (shape B) | `customer.subscription.updated`; `status=active`, `cancel_at_period_end=false`, future `cancel_at` | Active — Cancels on persisted `cancel_at`; no next billing date | Blocked |
| Reactivated before period end | `customer.subscription.updated`; `cancel_at_period_end=false`, `cancel_at=null` | Normal Active and renewal presentation | Blocked |
| Cancellation effective | `customer.subscription.deleted`; `status=canceled` | Canceled, subscription ended, Subscribe Again | Allowed |
| Re-subscribed | New Stripe Subscription ID | New current row; normal Checkout return synchronization | Blocked after synchronization |

The webhook upserts on unique `stripe_subscription_id`. A new subscription therefore creates a new row instead of overwriting the canceled row. The model is one row per Stripe Subscription, preserving subscription history for each contractor. The frontend selects the newest row by `created_at desc`; this is the current subscription view, not a one-row-forever model.

Checkout’s server-side blocking statuses remain `active`, `trialing`, `past_due`, `unpaid`, `paused`, and `incomplete`. An active subscription scheduled to cancel remains active and is blocked. A fully canceled row is excluded and permits Checkout. The unique `billing_customers.contractor_id` mapping is reused, so a new subscription stays on the same Stripe Customer. Tenant ownership remains the authenticated active membership → `contractors.id` → billing customer mapping, with no email or company-name fallback.

Portal return polling performs bounded authoritative reads so delayed webhooks can surface scheduled cancellation or reactivation. The browser never changes subscription state locally and CRM access remains non-blocking in every billing state.

## Sandbox acceptance plan

1. Keep live mode unchanged. In Stripe test mode, open **Settings → Billing → Customer portal**.
2. Enable subscription cancellation and select **At the end of the billing period**. Do not enable immediate cancellation, plan switching, quantities, or prorations.
3. Open Aymero as an active contractor Owner/Admin, select **Manage Subscription**, and schedule cancellation.
4. Inspect the full `customer.subscription.updated` object. Accept either supported scheduled shape: `cancel_at_period_end=true`, or a future `cancel_at` even when the boolean is false.
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

### Synchronizing the already-scheduled sandbox subscription

Deploy the migration and webhook before attempting to refresh the existing row. Resending the original Stripe Event ID will be acknowledged as a duplicate by the intentional webhook ledger and will not remap the row. The safest deterministic sandbox procedure is:

1. In Stripe sandbox, reactivate the scheduled subscription so Stripe emits a new `customer.subscription.updated` event that clears `cancel_at`.
2. Confirm the new event processes after the updated webhook is deployed.
3. Schedule end-of-period cancellation again so Stripe emits another new update containing the current future `cancel_at`.
4. Confirm Supabase stores `cancel_at` in UTC and Aymero shows the cancellation/access-through date without a next-billing label.

If changing sandbox state is impractical, an operator may perform a reviewed one-time correction from the current Stripe Subscription object after backing up the row. Do not hardcode a Subscription ID, fabricate a production backfill, or delete the webhook ledger entry merely to force replay.

Do not enable cancellation in live mode until scheduled cancellation, reactivation, effective cancellation, re-subscription, customer reuse, and cross-tenant isolation all pass this plan.
