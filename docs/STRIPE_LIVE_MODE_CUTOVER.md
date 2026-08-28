# Stripe live-mode readiness and production cutover

## Readiness decision

The application code can use Stripe test or live mode through the same server-side configuration contract:

```text
browser planKey: aymero_managed
  -> create-billing-checkout
  -> STRIPE_PRICE_AYMERO_MANAGED_MONTHLY
  -> Stripe Price in the mode selected by STRIPE_SECRET_KEY
```

The supplied sandbox Price ID `price_1U8vsjRZmaxS7NjoXHFMaOKH` is test-only. It must not be placed in source, React configuration, or production secrets. Stripe test Products, Prices, Customers, Subscriptions, API keys, and webhook signing secrets are distinct from live objects and cannot be reused for live payments.

The additive `20260828_add_billing_subscription_cancel_at.sql` lifecycle hotfix must be applied before live deployment. No separate test/live discriminator migration is required for the first live subscription if the mandatory data cutover gate is completed. This repository points the production frontend at one documented Supabase project, and the current billing schema has no test/live discriminator. A test `billing_customers.stripe_customer_id` in that project would be selected by live Checkout and rejected by Stripe. An active test `billing_subscriptions` row could also block live Checkout before Stripe is called.

Before setting live secrets, an operator must do one of the following:

1. Preferred for a clean long-term environment boundary: deploy production against a separate, clean production Supabase project and keep sandbox billing in a separate Supabase project.
2. Smallest first-customer cutover for the existing production project: verify that every existing billing row is test-only, export it, then remove the test billing rows in the controlled order below.

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

In Stripe Dashboard with test data disabled:

1. Open **Product catalog** and create the Product **Aymero Managed**.
2. Create one recurring Price with currency **USD**, amount **100.00**, and interval **Monthly**.
3. Do not enable trials, usage tiers, coupons, tax automation, annual billing, or additional plans.
4. Copy the newly created live `price_...` identifier without putting it in React or source control.
5. Store it in the production Supabase Function secret `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY`.
6. Verify in Stripe Dashboard that the Product and Price are in live mode and that the amount/interval are correct before accepting Checkout.

Products and Prices remain Dashboard-managed. Aymero does not create catalog objects dynamically.

## Live webhook

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

Pin the destination to the compatible API version used by the billing integration, currently `2026-02-25.clover`, and deliver a signed test event before real Checkout. The gateway intentionally has `verify_jwt=false` because Stripe has no Aymero session. The function still requires `Stripe-Signature`, verifies the raw body with a five-minute tolerance, and claims the Event ID in the private ledger before mutation. Unknown event types are recorded/acknowledged but do not synchronize subscriptions. The live endpoint has its own signing secret; never reuse the sandbox endpoint secret.

## Live Billing Portal

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

## Deployment sequence

All values below are placeholders except the established public application origin:

```bash
supabase db push
supabase secrets set \
  STRIPE_SECRET_KEY=replace-with-live-server-key \
  STRIPE_WEBHOOK_SECRET=replace-with-live-endpoint-signing-secret \
  STRIPE_PRICE_AYMERO_MANAGED_MONTHLY=replace-with-live-monthly-price-id \
  AYMERO_APP_URL=https://app.aymero.co
supabase functions deploy create-billing-checkout
supabase functions deploy create-billing-portal
supabase functions deploy stripe-billing-webhook --no-verify-jwt
```

Then confirm the deployed function configuration, live webhook delivery, Portal configuration, and empty/clean billing-table cutover state. Do not expose or echo secret values in deployment logs or tickets.

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

Current repository code is **conditionally ready**, but production is **NO-GO** until an operator verifies all of the following:

- Existing test billing rows are moved to an isolated sandbox project or backed up and removed from the production project.
- Live Product/Price, API key, webhook destination/signing secret, and Portal configuration are created independently from test mode.
- `AYMERO_APP_URL=https://app.aymero.co` and the three current billing functions are deployed.
- Applied migration/RLS/function revisions and authenticated cross-contractor isolation are verified in production.
- A signed live webhook preflight succeeds and the first real Checkout is supervised with rollback access available.

Payment failure, cancellation, data retention, and CRM access remain non-blocking beta policies. Tax, refunds, billing notices, dunning rules, additional plans, and contractor/client payment processing remain out of scope.
