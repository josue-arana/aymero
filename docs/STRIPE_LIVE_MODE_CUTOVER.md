# Stripe live-mode readiness and production cutover

## Readiness decision

**Cutover status (August 30, 2026): STRIPE LIVE CUTOVER: READY FOR FIRST SUBSCRIPTION.** The live billing infrastructure is configured and the safe signed-webhook preflight passed. No live Customer, Checkout Session, Subscription, Invoice, payment method, or charge was created during cutover. The first real subscription remains a separate supervised operation.

The application code can use Stripe test or live mode through the same server-side configuration contract:

```text
browser planKey: aymero_managed
  -> create-billing-checkout
  -> STRIPE_PRICE_AYMERO_MANAGED_MONTHLY
  -> Stripe Price in the mode selected by STRIPE_SECRET_KEY
```

The supplied sandbox Price ID `price_1U8vsjRZmaxS7NjoXHFMaOKH` is test-only. It must not be placed in source, React configuration, or production secrets. Stripe test Products, Prices, Customers, Subscriptions, API keys, and webhook signing secrets are distinct from live objects and cannot be reused for live payments.

The additive `20260828_add_billing_subscription_cancel_at.sql` lifecycle hotfix is applied. The production column was manually verified on August 28, 2026 as `cancel_at timestamp with time zone`, and migration version `20260828` appears in linked history. The wider migration-history reconciliation was completed before live secrets were installed.

No separate test/live discriminator migration is required for the first live subscription if the mandatory data cutover gate is completed. This repository points the production frontend at one documented Supabase project, and the current billing schema has no test/live discriminator. A test `billing_customers.stripe_customer_id` in that project would be selected by live Checkout and rejected by Stripe. An active test `billing_subscriptions` row could also block live Checkout before Stripe is called.

The smallest safe strategy for Aymero's current stage is a controlled, one-way cleanup of the existing project's test billing mappings immediately before live activation. A separate clean production Supabase project is a stronger long-term environment boundary, but is not required for the first customer if the cleanup gate is completed and this project never returns to test Stripe keys.

Before setting live secrets, an operator must therefore choose and complete one of these boundaries:

1. Current-stage recommendation: verify that every existing billing row is test-only, export it, then remove the test billing rows in the controlled order below.
2. Long-term alternative: deploy production against a separate, clean production Supabase project and keep sandbox billing in a separate Supabase project.

Do not switch production to live Stripe while any unclassified billing row remains. Do not switch back to test keys after live IDs have been persisted in the same database.

## Configuration and secret inventory

Server-only Supabase Edge Function configuration:

- `STRIPE_SECRET_KEY`: live Stripe server key for production.
- `STRIPE_WEBHOOK_SECRET`: signing secret for the production live webhook destination.
- `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY`: live recurring monthly Price for Aymero Managed.
- `AYMERO_APP_URL`: exactly `https://app.aymero.co` in production.

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied to deployed functions by Supabase. No Stripe value belongs in `VITE_*`; the browser sends only `aymero_managed`. Repository environment conventions ignore `.env` and `.env.local`, and committed examples must contain placeholders or browser-safe publishable configuration only.

The production application origin is established by `.env.example`, hostname routing verification, and the production launch checklist as `https://app.aymero.co`. Checkout success and cancellation return to `/settings/subscription?billing=success` and `/settings/subscription?billing=canceled`; Billing Portal returns to `/settings/subscription?billing=portal`. All three URLs are built by Edge Functions from `AYMERO_APP_URL`. The browser cannot submit a return URL.

## Live Product and Price

Cutover created and independently re-read these live catalog objects:

- Product `prod_VAJoH6aY1ZIZWj`: **Aymero Managed**, active, live mode.
- Price `price_1U9zBaQ0KpR7e0oAVgVox6N0`: **$100.00 USD**, monthly, licensed, active, live mode.

In Stripe Dashboard with test data disabled:

1. Open **Product catalog** and create the Product **Aymero Managed**.
2. Use the existing positioning for its description: **Aymero platform access with basic managed administration.**
3. Create one licensed recurring Price with currency **USD**, amount **100.00**, and interval **Monthly**. Aymero Checkout fixes quantity at **1**.
4. Do not enable trials, usage tiers, coupons, tax automation, annual billing, or additional plans.
5. Copy the newly created live `price_...` identifier without putting it in React or source control.
6. Store it in the production Supabase Function secret `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY`.
7. Verify in Stripe Dashboard that the Product and Price are in live mode and that the amount/interval are correct before accepting Checkout.

Products and Prices remain Dashboard-managed. Aymero does not create catalog objects dynamically.

## Live webhook

The live endpoint is `we_1U9zDCQ0KpR7e0oAGqHfrnAy`. It is enabled, in live mode, and pinned to `2026-02-25.clover`. Its signing secret was installed directly into Supabase without being printed or committed.

Create a live Stripe webhook/event destination at:

```text
https://qespkkmxaxzsfqrlghev.supabase.co/functions/v1/stripe-billing-webhook
```

Subscribe only to:

- `checkout.session.completed`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

Pin the destination to the compatible API version used by the billing integration, currently `2026-02-25.clover`, and complete a signed test delivery from the live endpoint's Stripe Workbench configuration before real Checkout. The pinned version is already validated by the integration; do not upgrade it as part of cutover. The gateway intentionally has `verify_jwt=false` because Stripe has no Aymero session. The function still requires `Stripe-Signature`, verifies the raw body with a five-minute tolerance, and claims the Event ID in the private ledger before mutation. Unknown event types are recorded/acknowledged but do not synchronize subscriptions. The live endpoint has its own signing secret; never reuse the sandbox endpoint secret. Stripe produces different signing secrets for test and live deliveries even when the URL is the same.

## Live Billing Portal

The live default Portal configuration is `bpc_1U9zCdQ0KpR7e0oAUFbmj808` (**Aymero Production**). It enables payment-method updates, invoice history, and end-of-period cancellation. Subscription changes, customer profile editing, pause, login-page access, prorations, promotion codes, and cancellation feedback remain disabled. Its return URL is `https://app.aymero.co/settings/subscription?billing=portal`.

Stripe maintains live Portal settings separately from sandbox settings. With test data disabled:

1. Open **Settings → Billing → Customer portal**.
2. Enable payment-method updates and invoice/billing history.
3. Keep plan switching, quantity changes, prorations, promotion codes, trials, and immediate cancellation disabled.
4. Enable end-of-period cancellation only after the complete cancellation sandbox acceptance plan passes.
5. Save the live configuration and verify it with a live Customer created through Aymero.

## Controlled sandbox-data cleanup

Do not run this procedure without authenticated Supabase access, a maintenance window, and a verified export.

1. Keep Stripe and Supabase Functions on test secrets.
2. Prevent operators from starting new billing sessions during the cutover window.
3. Inventory `billing_customers`, `billing_subscriptions`, and `billing_webhook_events`; record row counts and Stripe object IDs without placing them in source control.
4. In Stripe test mode, cancel the sandbox subscriptions that are no longer needed. Allow their final webhooks to finish.
5. Export all three Supabase billing tables to a restricted backup.
6. Prove that every billing Customer, Subscription, and Event is test-only. If any row cannot be classified, stop.
7. In one reviewed database transaction, delete test `billing_subscriptions` rows first, then test `billing_customers`, then the test-only `billing_webhook_events` ledger. Do not delete contractors, memberships, CRM records, invoices, or contractor/client payments.
8. Verify the three billing tables contain no test mappings and no live mappings were removed.
9. Rotate to the complete live secret set, deploy all three billing functions, and never restore test secrets into this production project after live objects exist.

Deleting a test Subscription in Stripe does not remove its Supabase row, and deleting a Supabase mapping does not delete the Stripe object. Both sides must be handled deliberately. The webhook ledger can remain as archived test evidence only in a separate sandbox database; in a shared pre-live database it must be cleared with the other test-only billing rows because the schema has no mode marker.

After the export and classification checks, use `STRIPE_SANDBOX_BILLING_CLEANUP.sql`. **MANUAL REVIEW REQUIRED:** it requires each exact Customer, Subscription, and Event ID to have independent `livemode=false` evidence, fails closed if any production row is unclassified, joins every DELETE to an exact reviewed ID, and defaults to `rollback`. Do not replace its final `rollback` with `commit` without an approved maintenance window, restricted backup, and peer review.

## Migration-history reconciliation gate

The linked production migration ledger was reconciled before cutover. Duplicate legacy filenames were normalized without changing their SQL bytes, production schema evidence was resolved, and only independently verified history entries were repaired. The complete inventory and evidence remain in `PRODUCTION_DATABASE_RECONCILIATION.md` and `PRODUCTION_DATABASE_RECONCILIATION_AUDIT.sql`.

Required non-mutating preflight:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
```

On August 30, 2026, `supabase migration list --linked` returned 23 paired local/remote versions and `supabase db push --linked --dry-run` returned `upToDate=true` with zero migrations, seeds, or roles pending. The gate is closed. If a future function deployment asks to push migrations, treat that as a new database change and review it separately.

## Production cutover execution record

- Every pre-existing billing object was independently classified as Stripe sandbox data: Customer `cus_V9F8xHHu86GkpC`, Subscription `sub_1U8wkxRZmaxS7NjoeEBW8gbh`, Price `price_1U8vsjRZmaxS7NjoXHFMaOKH`, Product `prod_V9ELtf3P6IafoU`, and ten webhook Events all reported `livemode=false`.
- The exact-ID cleanup was rehearsed with `rollback`, then committed with the same reviewed IDs. Production changed from 1 billing Customer, 1 billing Subscription, and 10 sandbox Event rows to 0/0/0. No contractor, membership, CRM, invoice, or contractor/client payment data was changed. The Stripe sandbox objects themselves were not deleted.
- The four production Function secrets were updated together on August 30, 2026: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY`, and `AYMERO_APP_URL`. Secret values were never printed or committed, and temporary files containing them were deleted immediately after installation.
- Deployed revisions are `create-billing-checkout` v5 with JWT verification enabled, `create-billing-portal` v4 with JWT verification enabled, and `stripe-billing-webhook` v6 with gateway JWT verification disabled. Stripe signature verification remains mandatory inside the webhook.
- Stripe resent existing live Event `evt_1U9zBJQ0KpR7e0oAKEQSj5v4` (`product.created`) to the production endpoint. `product.created` was temporarily added to the endpoint allowlist solely for this non-billing preflight and removed in a guaranteed cleanup step. Stripe reported `pending_webhooks=0`; Supabase stored one processed ledger row. Replaying the same Event again left exactly one ledger row, proving idempotency. The endpoint was re-read afterward with exactly the six production billing events listed above.
- The post-cutover production state is 0 `billing_customers`, 0 `billing_subscriptions`, and 1 processed non-billing preflight Event. No live billing state was fabricated. The deterministic Subscription Hub verification passes for the empty state, while the first authenticated production Owner/Admin walkthrough remains part of the first-real-subscription runbook.

## Deployment sequence

Do not start this sequence until the migration-history reconciliation gate passes. All values below are placeholders except the established public application origin:

```bash
supabase migration list --linked
supabase db push --linked --dry-run
supabase secrets set \
  STRIPE_SECRET_KEY=replace-with-live-server-key \
  STRIPE_WEBHOOK_SECRET=replace-with-live-endpoint-signing-secret \
  STRIPE_PRICE_AYMERO_MANAGED_MONTHLY=replace-with-live-monthly-price-id \
  AYMERO_APP_URL=https://app.aymero.co
supabase functions deploy create-billing-checkout
supabase functions deploy create-billing-portal
supabase functions deploy stripe-billing-webhook --no-verify-jwt
```

Proceed past the dry run only when it reports no unexpected migration. Then confirm the deployed function configuration, live webhook delivery, Portal configuration, and empty/clean billing-table cutover state. Do not expose or echo secret values in deployment logs or tickets.

## First real subscription runbook

1. Confirm the cutover gate, live Product/Price, live webhook, live Portal, secrets, deployed revisions, RLS, and production URL.
2. Sign in to an existing Aymero contractor account as Owner/Admin and open **Aymero Subscription**.
3. Confirm the page shows no subscription and offers **Subscribe**. If a test subscription or Customer mapping appears, stop.
4. Select Subscribe and verify Stripe opens on a live `checkout.stripe.com` session showing **Aymero Managed — $100.00 USD monthly**.
5. The contractor enters their real payment method directly in Stripe-hosted Checkout. Aymero never handles card details.
6. Complete payment once. Do not retry while the first Checkout/webhook is still processing.
7. In Stripe live mode, confirm the Customer and Subscription metadata contain the expected Aymero contractor ID and billing domain.
8. In Supabase, confirm one contractor-owned `billing_customers` mapping, a new `billing_subscriptions` row with the live Subscription/Price, and a processed webhook ledger entry.
9. Confirm Aymero shows Active, the persisted period end, and Paid. Refresh if webhook synchronization is delayed.
10. Open **Manage Subscription**, verify payment-method/history access, return to Aymero, and confirm status remains authoritative.
11. Attempt to start Checkout again and confirm server-side duplicate prevention blocks a second subscription.

No manual Stripe Customer is required. Checkout creates and persists the live Customer when no mapping exists, then reuses that mapping for later live subscriptions.

## Rollback and incident containment

If the first live Checkout fails before payment:

1. Leave live Stripe keys and any newly persisted live IDs in place; never replace them with test keys in the same database.
2. Disable new Checkout safely by removing or invalidating the production `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY` secret, which makes Checkout return the existing safe configuration error. Existing CRM access remains available.
3. Inspect Edge Function logs, the Stripe live Event delivery, Checkout Session, Customer mapping, Subscription row, and webhook ledger without copying secrets into tickets.
4. If a live Customer exists without a Subscription, retain the mapping; the next successful Checkout can reuse it.
5. If payment succeeded, do not delete or recreate billing rows as a rollback. Reconcile Stripe and Supabase through webhook replay/support procedures.
6. Restore Checkout only after correcting the live Price/secret/webhook configuration and repeating non-charging preflight checks.

Stage-specific recovery rules:

- Checkout function failure: do not create local success state; inspect sanitized Function logs and retry only after the cause is known.
- Payment failure in Stripe: remain unsubscribed and never mark the database Active manually.
- Stripe Subscription created but webhook failed: Stripe remains authoritative; repair the webhook and replay a fresh failed delivery.
- Webhook succeeded but Aymero is stale: refresh the authoritative Subscription page; do not create another Checkout.
- Wrong live Price: disable Checkout immediately and do not ask the customer to retry until the configured live Price is verified.
- Wrong Stripe environment: stop immediately; do not reuse, copy, or translate any test object into live mode.

If no live Stripe/Supabase billing object was ever created and a full rollback is required, return development testing to a separate sandbox Supabase project. Do not make the production project alternate between test and live modes.

## Security and observability

- RLS allows active contractor members to read only their contractor’s billing Customer and Subscription rows. Browser writes remain revoked.
- Checkout and Portal resolve one active server-side membership and require Owner/Admin.
- Webhook tenant resolution uses the persisted Stripe Customer mapping and matching contractor metadata; no email/company-name fallback exists.
- Contractor-facing errors are generic. Development logs contain safe contractor ID/status/error-code context but no Stripe/Supabase secrets.
- Stripe Dashboard provides live Customer, Subscription, Price, Checkout, Invoice, and event-delivery diagnostics.
- `billing_customers` provides contractor → Stripe Customer mapping.
- `billing_subscriptions` provides Subscription/Price IDs, plan, status, period, cancellation flag, and payment result.
- `billing_webhook_events` provides Event ID, event type, processing timestamp, and replay evidence; it is service-role only.
- Supabase Edge Function logs provide sanitized processing failures and synchronized object/contractor/status context.

An admin billing dashboard is not required for the first subscription.

## Go/no-go gate

Production is **GO for a supervised first real subscription**. The linked migration history is paired, the dry run is empty, sandbox mappings are removed, independent live Stripe resources and secrets are installed, the three billing functions are active with the correct JWT boundaries, and signed live webhook delivery/idempotency passed.

This is not evidence of a successful paid subscription. The first live Checkout, real payment, resulting Customer/Subscription mappings, Portal access with a live Customer, duplicate-Checkout rejection against a live active Subscription, and the authenticated Owner/Admin production walkthrough remain intentionally unexecuted. Perform them only under **Sprint 3.44H — First Real Aymero Subscription**.

Payment failure, cancellation, data retention, and CRM access remain non-blocking beta policies. Tax, refunds, billing notices, dunning rules, additional plans, and contractor/client payment processing remain out of scope.
