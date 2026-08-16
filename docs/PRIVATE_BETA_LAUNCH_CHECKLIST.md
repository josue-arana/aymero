# Private Beta Launch Checklist

Goal
- Get 1–3 contractors using Aymero with isolated, real data to validate workflows and readiness for paid plans.

Must Have Before Inviting Contractors
- Supabase Auth enabled (or equivalent secure auth).
- Real CRUD connected for: company settings, clients, leads, projects/jobs, estimates, contracts, invoices, payments, events.
- Basic company data isolation (per-company or RLS-based isolation).
- Archive/restore (soft-delete/restore) working as in app.
- Bilingual UI (English/Spanish) functioning.
- Mobile layout usable for common tasks.
- Settings / company profile editable and persisted.
- Photo upload/storage working, or clearly disabled with guidance.
- No dead buttons or broken flows on main pages.
- Build passes and a working production/dev deploy process.

Nice to Have Later
- Payment gateway integration (Stripe) for paid upgrade.
- Automated email notifications and real SMS support.
- Background job processing for large imports/exports.
- More robust role-based permissions for teams.

Free Beta Limits
- Users: 1–3 contractors (per private beta cohort).
- Duration: 15–30 day trial / beta window.
- Storage: capped (define MB/GB per contractor), purge policy described to users.
- Onboarding: manual by founder (guided setup, data import help).
- Billing: no Stripe required for beta; manual invoicing or billing later.

Manual Onboarding Plan
1. Create contractor account and company settings.
2. Seed company with a few clients, one active lead, and one active job/estimate.
3. Verify email/login and basic flows (create lead, send estimate, record payment, upload photo).
4. Walk contractor through Settings and mobile layout.
5. Capture feedback and key screenshots; keep a migration log.

Contractor Feedback Questions
- Was it easy to create a lead? If not, what was confusing?
- Was it easy to create and send an estimate? Any missing pieces?
- Did the Spanish wording feel natural and clear?
- Were there any dead or unexpected buttons/flows?
- How was the mobile experience for your core tasks?
- What features would make this worth paying for?

Go / No-Go Checklist (founder)
- Auth and login stable for invited users.
- CRUD operations working reliably for core entities.
- Company isolation validated (different contractor data cannot be seen).
- Key pages tested on mobile and desktop.
- No critical bugs blocking create/update flows.
- Feedback loop in place to collect and triage responses.

Notes
- Keep the beta small, iterate quickly, and avoid exposing production credentials or broad access.
- This checklist intentionally keeps the scope limited to a private, founder-led beta.

## Production Deployment Readiness

This section is the repository-backed production checklist. An item under **Repository Ready** means the required source/configuration exists in this repository. It does not verify DNS, hosted artifacts, Supabase dashboard settings, deployed migrations, or deployed Edge Function revisions.

### Canonical production URL map

| Purpose | Canonical URL | Repository source |
| --- | --- | --- |
| Marketing/site | `https://aymero.co` | `VITE_SITE_URL` |
| Contractor CRM | `https://app.aymero.co` | `VITE_APP_URL` |
| Public Client Portal | `https://portal.aymero.co/portal/:token` | `VITE_PORTAL_URL` + `buildPortalShareUrl()` |
| Email confirmation callback | `https://auth.aymero.co/` | `VITE_AUTH_URL` / optional `VITE_AUTH_REDIRECT_URL` |
| Password reset callback | `https://auth.aymero.co/forgot-password` | `getAuthRedirectUrl(appRoutes.forgotPassword)` |
| Public portal Edge Function | `https://qespkkmxaxzsfqrlghev.supabase.co/functions/v1/super-endpoint` | `VITE_SUPABASE_URL` + `publicPortalService` |

No OAuth provider flow or dedicated OAuth callback route is currently implemented. The root auth callback restores Supabase email-confirmation session parameters; `/forgot-password` restores the recovery session.

### Repository Ready

- Public URL construction is environment-driven through `environmentService.js`.
- Hostname routing is enforced before the contractor application tree mounts: configured app, portal, auth, and site hosts are scoped centrally, while localhost and unmatched Netlify preview hosts remain unrestricted for testing.
- Portal Open, Copy Link, and Send Link actions normalize to `VITE_PORTAL_URL` and preserve the opaque `/portal/:token` credential.
- `public/_redirects` contains `/* /index.html 200` for hosts that support Netlify-style redirect files.
- Supabase credentials used by browser code are limited to the project URL and publishable/anon key.
- The public portal frontend calls `super-endpoint` with the anonymous publishable credential; no authenticated contractor session is required.
- The Edge Function resolves only `projects.public_portal_token`, scopes all queries by the resolved `contractor_id` and `project_id`, returns a reduced client-safe payload, and keeps `SUPABASE_SERVICE_ROLE_KEY` server-side.
- The portal-token migration revokes direct `anon` table access to `projects`.
- Contractor-facing tables use authenticated membership/RLS policy scripts; anonymous visitors must not receive general CRM-table policies.

### External Platform Verification Required

- [ ] Verify DNS and HTTPS for `aymero.co`, `app.aymero.co`, `portal.aymero.co`, and `auth.aymero.co`.
- [ ] Confirm the production host serves the same SPA on the app, portal, and auth hosts, or change the URL map before release.
- [ ] Confirm direct navigation and refresh work for `/dashboard`, `/leads`, `/projects/:id`, `/estimates`, `/contracts`, `/invoices`, `/calendar`, `/clients`, `/portal/:token`, and `/forgot-password`.
- [ ] If the host does not consume `public/_redirects`, configure an equivalent fallback rewrite from all non-asset routes to `/index.html` with status 200.
- [ ] In Supabase Auth, set Site URL to `https://app.aymero.co`.
- [ ] In Supabase Auth, allow redirects for `https://app.aymero.co/*`, `https://auth.aymero.co/`, and `https://auth.aymero.co/forgot-password`.
- [ ] Verify the latest `super-endpoint` revision is deployed and that invocation accepts the publishable anon JWT while requiring an opaque portal token in the request body.
- [ ] Verify Edge Function secrets `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` exist. Never place the service-role key in a `VITE_*` variable.
- [ ] Confirm production migrations and RLS scripts below have been applied in order.
- [ ] Run the authenticated tenant-isolation and anonymous portal smoke tests below.

### Production environment inventory

| Variable/flag | Classification | Production requirement |
| --- | --- | --- |
| `VITE_SUPABASE_URL` | Required | Production Supabase project origin; browser-visible. |
| `VITE_SUPABASE_ANON_KEY` | Required | Supabase publishable/anon key; browser-visible and protected by RLS. |
| `VITE_SITE_URL` | Required for canonical links | `https://aymero.co`. |
| `VITE_APP_URL` | Required | `https://app.aymero.co`. |
| `VITE_PORTAL_URL` | Required | `https://portal.aymero.co`; prevents portal shares from falling back to the current host. |
| `VITE_AUTH_URL` | Required with the declared URL map | `https://auth.aymero.co`; must host the SPA. |
| `VITE_AUTH_REDIRECT_URL` | Optional override | Use only when the auth callback origin differs from `VITE_AUTH_URL`. |
| `VITE_ENABLE_DEVELOPER_ROUTES` | Development-only | Keep `false` in production unless access is intentionally approved. |
| `USE_AUTH` | Required static flag | Currently enabled in `backendConfig.js`. |
| Entity `USE_SUPABASE_*` flags | Required static flags | Settings, clients, leads, projects, estimates, contracts, invoices, payments, and events are enabled. |
| `USE_STORAGE` | Future/disabled static flag | General flag is disabled; project-photo storage has its own implemented Supabase path and must be smoke-tested. |
| `USE_REAL_EMAIL`, `USE_REAL_SMS` | Future/backlog static flags | Disabled; do not enable for this release audit. |

Do not store provider secrets in `VITE_*` variables; Vite embeds them in browser assets.

### Required Supabase database state

For a fresh environment, apply `supabase/schema.sql`, then the contractor-scoped policy scripts for settings, clients, leads, projects, estimates/contracts, payments, and events. Apply all general migrations in chronological order:

- `20260622_enable_self_service_beta_onboarding.sql`
- `20260624_enable_payments_supabase_beta.sql`
- `20260625_enable_events_supabase_beta.sql`
- `20260628_add_simple_mode_to_company_settings.sql`
- `20260628_enable_project_photos_storage_beta.sql`
- `20260628_fix_project_photos_rls.sql`
- `20260628_fix_project_photos_identity_rls.sql`
- `20260630_add_analytics_mode_to_company_settings.sql`
- `20260707_add_client_language_preferences.sql`
- `20260707_add_estimate_language.sql`
- `20260718_add_premium_onboarding_state.sql`
- `20260719_add_sample_workspace_manifest.sql`
- `20260719_connect_sample_workspace_journey.sql`
- `20260721_enable_contracts_delete_rls.sql`
- `20260721_enable_estimates_delete_rls.sql`
- `20260721_enable_invoices_supabase_rls.sql`
- `20260725_add_company_accepted_payment_methods.sql`
- `20260726_add_invoice_customer_notes.sql`
- `20260812_add_public_client_portal_tokens.sql`

The two `20260622_*miguel*` migrations are account-specific seed/link operations, not general production prerequisites. Do not apply them to a new production tenant unless that exact account is intentionally being provisioned.

### Required Edge Function

`super-endpoint` is the sole public Client Portal Edge Function currently called by the frontend.

- Call site: `src/services/publicPortalService.js`
- Method: `POST` with `{ token }`
- Visitor auth: no contractor login; request carries the Supabase publishable/anon credential
- Data authority: opaque `projects.public_portal_token`
- Server secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
- Response: client-safe project, client, payment, schedule, document, photo, and company-display fields only

### Anonymous Client Portal smoke test

1. Open a valid `https://portal.aymero.co/portal/:token` link in a clean incognito session.
2. Confirm no Aymero login is requested.
3. Confirm only the expected contractor, client, and project are visible.
4. Compare Project Value, Amount Paid, Balance Due, and payment history with the contractor workspace.
5. Verify schedule entries and locations match the intended project.
6. Open Estimate and Contract documents and confirm Save as PDF uses browser print.
7. Confirm project photos honor the portal visibility setting and use time-limited signed URLs.
8. Refresh the direct portal URL and confirm the SPA and payload reload successfully.
9. Use a random/invalid token and confirm a safe not-found response with no CRM data.
10. Use a valid token from another project and confirm it returns only that token's project; changing a token must never expose neighboring records.
11. Attempt the legacy project UUID in place of the token and confirm it is rejected.

### Authenticated isolation smoke test

1. Sign in as Contractor A and record representative IDs from clients, projects, documents, payments, events, settings, and photos.
2. Sign in as Contractor B in a separate clean session.
3. Confirm Contractor B cannot list, fetch, update, archive, restore, or permanently delete Contractor A records.
4. Confirm direct REST requests with Contractor B's JWT and Contractor A IDs are rejected by RLS.
5. Confirm the browser never receives `SUPABASE_SERVICE_ROLE_KEY`.

## Production Verification Evidence — 2026-08-15

Evidence last updated at `2026-08-15T21:40:10-04:00` from a clean local verification environment using `curl 8.7.1`, deployed-asset inspection, and `Google Chrome 151` in headless mode. No credentials, portal tokens, customer records, or response payload data were recorded.

| Check | Status | Non-sensitive evidence |
| --- | --- | --- |
| `aymero.co` DNS/HTTPS | PASS | HTTPS 200, resolved remote address, certificate verification result 0, Aymero document served. |
| `app.aymero.co` DNS/HTTPS | PASS | HTTPS 200, certificate verification result 0, Aymero authentication shell hydrated. |
| `portal.aymero.co` DNS/HTTPS | PASS | HTTPS 200, certificate verification result 0, direct invalid-token route hydrated to `Client Portal Not Found`. |
| `auth.aymero.co` DNS/HTTPS | PASS | HTTPS 200, certificate verification result 0, `/forgot-password` hydrated with the implemented email form. |
| Mixed content | PASS | No mixed-content diagnostic observed in clean browser loads for the four production hosts. |
| CRM SPA routing | PASS | `/dashboard`, `/leads`, `/estimates`, `/contracts`, `/invoices`, `/jobs`, `/calendar`, `/clients`, and `/projects/production-routing-check` each returned HTTP 200, the SPA root, and a hydrated auth state. |
| Portal invalid-token state | PASS | Invalid opaque token returned a safe not-found page without contractor navigation or CRM data. |
| Supabase Auth API | PASS | Public Auth health returned HTTP 200; signup is enabled and email auto-confirm is disabled. This does not verify redirect settings. |
| Supabase Auth redirect allowlist | PENDING | Repository callback construction resolves email confirmation to `https://auth.aymero.co/` and recovery to `https://auth.aymero.co/forgot-password`, but the live Site URL and redirect allowlist require authenticated Supabase management access. The CLI reported that no access token is available in this verification environment. |
| Deployed frontend origins | PASS | Five deployed JS/CSS assets contain the declared Supabase, site, app, portal, and auth origins plus the publishable browser-key marker. No service-role/secret-key marker or configured localhost origin was found. Legacy portal hosts remain only in the source normalization denylist and are not active configured origins. |
| Production platform variables | PASS | The effective Vite values embedded in the deployed assets resolve to the six required production settings. Direct `/dev/health` navigation rendered the auth shell, confirming developer routes are disabled in the deployed build. |
| Developer route exposure | PASS | A clean headless session at `https://app.aymero.co/dev/health` did not render Developer Health or the Engineering Command Center; it rendered the normal authentication shell. |
| Anonymous CRM-table boundary | PASS | Fresh anonymous REST probes returned zero rows for contractors, memberships, settings, clients, leads, estimates, contracts, invoices, payments, events, and photos; projects returned permission denied. |
| Authenticated tenant isolation | PENDING | Two safe contractor test accounts and representative cross-tenant IDs were unavailable. |
| Applied migrations | PENDING | All 19 required general migration files are present locally; production history still requires authenticated dashboard/CLI project access. Account-specific Miguel migrations remain excluded. |
| RLS policy inventory | PENDING | Anonymous denial was reverified, but authenticated contractor-scoped policy metadata and Contractor A/B reads require privileged access and two safe test accounts. |
| Edge Function invalid-token behavior | PASS | A fresh invalid opaque token and a random UUID-shaped token both returned HTTP 404 with exactly the safe portal-not-found response. |
| Edge Function deployed revision | PENDING | The current repository function could not be deployed or revision-checked because the Supabase CLI has no management access token in this environment. No deployment was claimed. |
| Valid anonymous portal | PENDING | A safe valid production portal token was not available. |
| Portal parity, visibility, documents, and PDFs | PENDING | Requires a valid test project plus contractor-side access for comparison. |
| Cross-token isolation | PENDING | Two safe production portal tokens were not available. |

### Verification conclusion

Production Domain remains **PENDING**. The public domains, HTTPS, CRM SPA routing, auth page, invalid portal state, public Auth health, effective production frontend environment, developer-route lockout, anonymous CRM boundary, and safe invalid Edge Function behavior are verified. The release candidate is **NOT READY** until Supabase management configuration, deployed migrations/policies/function revision, authenticated isolation, valid-portal isolation/parity/visibility, and public document workflows are verified.
