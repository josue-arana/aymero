# Aymero SaaS Billing Foundation

## Architecture audit

- Supabase Auth is enabled independently from the global data flag. The app keeps `USE_SUPABASE=false` while selected entity flags are enabled.
- `AuthContext` resolves an authenticated user through `contractor_members.user_id`, requires one active non-archived membership, and exposes the persisted `contractors.id` as `contractorId`.
- `contractors` is the authoritative business/tenant table. `contractor_members.role` uses `owner`, `admin`, and `member`; active Owner/Admin members are the existing privileged company roles.
- Working RLS uses `public.is_active_contractor_member(contractor_id)`, which checks `auth.uid()` against an active, non-archived membership.
- The browser uses a lightweight REST client with the stored Supabase access token. Existing public privileged behavior is isolated in `super-endpoint`; SaaS billing uses dedicated functions instead.
- Settings is a mobile-first page composed from cards, with shared toast/loading patterns and bilingual `en.js` / `es.js` dictionaries.
- Existing `payments`, `invoices`, project payments, and customer portal payment views describe client-to-contractor commerce. They are not used by this foundation.
- Database changes are timestamped migrations. Developer Health backlog metadata lives in `developerHealthRegistry.js`, and deterministic checks live in `scripts/verify-*.mjs`.

## Ownership and domain boundary

Aymero SaaS billing belongs to `contractors.id`, never an auth user or a named customer:

```text
contractors.id
  -> billing_customers.contractor_id
  -> Stripe Customer
  -> billing_subscriptions.contractor_id
  -> Stripe Subscription
```

Aymero SaaS Billing is **contractor business → Aymero**. Contractor Payments is **client → contractor**. The two domains intentionally have separate tables, services, functions, and lifecycle state. A future contractor-payments integration may use Stripe Connect and must not reuse this direct Aymero subscription customer.

## Database and RLS

Apply `supabase/migrations/20260826_add_saas_billing_foundation.sql`.

- `billing_customers`: one row per contractor and one unique Stripe Customer ID.
- `billing_subscriptions`: one row per Stripe Subscription, contractor-scoped, with a stable plan key, Price ID, Stripe status, item-level current period, cancellation flag, and latest payment outcome.
- `billing_webhook_events`: private unique Stripe Event ID ledger used for retry idempotency.
- Active contractor members can select their own customer/subscription rows through the existing membership helper.
- No authenticated insert/update/delete policy exists for Stripe-backed state. The webhook ledger has no browser access. Edge Functions use the service role only after authentication or signature verification.

## Stripe configuration

In Stripe **test mode** first:

1. Create Product `Aymero Managed`.
2. Create a recurring Price for `100.00 USD`, billed monthly.
3. Copy the `price_...` ID into `STRIPE_PRICE_AYMERO_MANAGED_MONTHLY`.
4. Create a webhook endpoint for `https://<project-ref>.supabase.co/functions/v1/stripe-billing-webhook`.
5. Pin the endpoint API version to `2026-02-25.clover`.
6. Subscribe only to:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.paid`
   - `invoice.payment_failed`
7. Copy its signing secret into `STRIPE_WEBHOOK_SECRET`.

Products and Prices are Dashboard-managed. Checkout never creates catalog objects dynamically. Test/live behavior changes through secrets and Price configuration, not code.

### Required Edge Function secrets

```text
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
STRIPE_PRICE_AYMERO_MANAGED_MONTHLY
AYMERO_APP_URL
```

`AYMERO_APP_URL` is the canonical app origin, for example `https://app.aymero.com` or local `http://localhost:5174`. Supabase provides `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` to deployed functions.

Never place Stripe secret or webhook keys in `VITE_*`, React, browser configuration, or logs. Keep the Price mapping server-authoritative as well.

## Checkout and webhook behavior

`create-billing-checkout` authenticates the bearer token, resolves exactly one active membership server-side, requires Owner/Admin, accepts only `aymero_managed`, and maps it to the configured Price. The browser cannot provide contractor, customer, subscription, or Price IDs.

The function reuses `billing_customers.stripe_customer_id`. Initial Stripe Customer creation uses a contractor-scoped Stripe idempotency key; concurrent database insertion falls back to the already-persisted mapping. A 30-minute contractor/plan Checkout idempotency window reduces duplicated open sessions. Synchronized active, trialing, past-due, unpaid, paused, or incomplete subscriptions prevent another Checkout.

Checkout is Stripe-hosted and uses `mode=subscription`. Both the Session and resulting Subscription receive the contractor ID, stable plan key, and billing-domain metadata. Success returns to `/settings?billing=success`; that page waits for webhook state and does not activate billing from the redirect. Cancel returns without a state change.

`stripe-billing-webhook` has gateway JWT verification disabled because Stripe has no Aymero session. It verifies `Stripe-Signature` against the untouched body, enforces a five-minute timestamp tolerance, then creates the service-role client. Tenant resolution requires the persisted Stripe Customer mapping; metadata must match it when present. Email and company-name fallback are prohibited.

Current Clover shapes are used: billing periods come from `subscription.items.data[].current_period_*`, and invoice subscription identity comes from `invoice.parent.subscription_details.subscription`. Invoice events retrieve the authoritative Subscription before synchronization.

The ledger insert claims each Event ID. Duplicates return success without another mutation. A processing failure removes the claim and returns an error so Stripe can retry. A successful event sets `processed_at`.

Failed payments set `last_payment_status=failed` and mirror Stripe's Subscription status. They do not affect auth, routes, or CRM records and do not lock the contractor out.

## Deployment

```bash
supabase db push
supabase secrets set STRIPE_SECRET_KEY=sk_test_...
supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_...
supabase secrets set STRIPE_PRICE_AYMERO_MANAGED_MONTHLY=price_...
supabase secrets set AYMERO_APP_URL=https://app.example.com
supabase functions deploy create-billing-checkout
supabase functions deploy stripe-billing-webhook --no-verify-jwt
```

After deployment, add the deployed webhook URL and events in Stripe Workbench/Dashboard, using the pinned API version above. Configure the test webhook secret before any Checkout validation. Repeat with live-mode keys, live Price, and live webhook only after test-mode acceptance.

## Manual Stripe test-mode validation

1. Configure the test secret, test monthly Price, webhook secret, and canonical app URL.
2. Apply the migration and deploy both functions.
3. Sign in as an active contractor Owner or Admin and open Settings → Aymero Billing.
4. Start Checkout and use Stripe test card `4242 4242 4242 4242`, any future expiry, and any CVC/postal code.
5. Confirm one Stripe Customer with `aymero_contractor_id` metadata.
6. Confirm one recurring Stripe Subscription and its Aymero metadata.
7. Confirm one `billing_customers` row for the contractor.
8. Confirm `billing_subscriptions` mirrors the plan, Price, status, and item billing period.
9. Refresh Settings and confirm the synchronized status and next renewal date.
10. Retry Checkout and confirm the existing subscription prevents another subscription.
11. Use Stripe test clocks or the Dashboard/CLI to deliver `invoice.payment_failed`; confirm the failure state is mirrored.
12. Confirm Dashboard, Projects, Estimates, Contracts, Invoices, and other CRM routes remain accessible.
13. Replay a webhook Event ID and confirm the ledger prevents a second mutation.
14. Sign in as a different contractor and confirm no billing rows from the first tenant are readable.

No automated step creates a real charge.

## Sprint 1 limitations and Sprint 2 backlog

This foundation does not include Customer Portal, cancellation controls, plan changes, Starter/Pro, annual billing, trials, discounts, tax automation, billing email, grace/access enforcement, custom card UI, Stripe Connect, or contractor/client payment processing. These items are registered in Developer Health for a later subscription-management sprint.
