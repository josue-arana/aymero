# BETA_AUTH_FLOW

This document describes the current Aymero beta auth and onboarding flow as implemented in the codebase today.

## 1. Supabase Setup Requirements

Current source of truth:

- Auth is enabled with `USE_AUTH = true` in [src/config/backendConfig.js](/Users/josuearana/Documents/contractorflow-crm/src/config/backendConfig.js:1).
- Supabase-backed entity access is currently enabled for `company_settings`, `clients`, `leads`, and `projects`, even while `USE_SUPABASE = false`.
- The app expects these Vite env vars:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - Optional: `VITE_AUTH_REDIRECT_URL`

Auth redirect behavior:

- Runtime redirect base is resolved by `getAuthRedirectUrl()` in [src/services/system/environmentService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/system/environmentService.js:9).
- If `VITE_AUTH_REDIRECT_URL` is set, it is used.
- Otherwise the app uses `VITE_AUTH_URL`, then the current application origin.
- Final fallback is `http://localhost:5174`.

Supabase dashboard configuration:

- Set `Site URL` to the app origin for the environment.
- Set production `Site URL` to `https://app.aymero.co`.
- Allow `https://app.aymero.co/*`, `https://auth.aymero.co/`, and `https://auth.aymero.co/forgot-password` as production redirects.
- Existing setup notes are in [docs/SUPABASE_SETUP.md](/Users/josuearana/Documents/contractorflow-crm/docs/SUPABASE_SETUP.md:1).

Minimum backend expectations:

- Supabase Auth must be enabled and reachable.
- The authenticated user must be able to call the onboarding RPC when they do not yet have an active membership.
- RLS policies must prevent cross-contractor reads and writes, especially for `company_settings`.

## 2. Required Migrations

Current migration files in the repo:

1. [supabase/migrations/20260622_enable_self_service_beta_onboarding.sql](/Users/josuearana/Documents/contractorflow-crm/supabase/migrations/20260622_enable_self_service_beta_onboarding.sql:1)
   - Creates the `public.complete_beta_contractor_onboarding(...)` RPC.
   - This is the key migration for self-service onboarding.
2. [supabase/migrations/20260622_create_miguel_contractor_profile.sql](/Users/josuearana/Documents/contractorflow-crm/supabase/migrations/20260622_create_miguel_contractor_profile.sql:1)
   - Seeds a contractor profile for a known beta user.
3. [supabase/migrations/20260622_link_miguel_contractor_membership.sql](/Users/josuearana/Documents/contractorflow-crm/supabase/migrations/20260622_link_miguel_contractor_membership.sql:1)
   - Links that user into `contractor_members`.

For the current self-service beta flow, the required migration from this repo is:

- `20260622_enable_self_service_beta_onboarding.sql`

The other two migrations are user-specific seed/link migrations, not general flow requirements.

## 3. Auth Flow

Current implementation lives primarily in:

- [src/services/authService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/authService.js:1)
- [src/contexts/AuthContext.jsx](/Users/josuearana/Documents/contractorflow-crm/src/contexts/AuthContext.jsx:1)
- [src/App.jsx](/Users/josuearana/Documents/contractorflow-crm/src/App.jsx:291)

Flow:

1. User lands on `Login`, `Signup`, or `Forgot Password`.
2. App language is available before authentication through the shared local storage key `contractorflow.language`.
3. Auth requests go through the custom REST auth client in `authService.js`, not `@supabase/supabase-js`.
4. On successful sign-in, the app loads the current user and resolves contractor access by querying `contractor_members`.
5. If the user has exactly one active unarchived membership, the app resolves their contractor profile and continues into the app.
6. If the user has no active membership, `onboardingRequired` becomes `true` and the app routes them into the in-app contractor onboarding screen.
7. If the session expires, the app clears local auth state and returns the user to login.

Important details:

- Sessions are persisted in local storage through the custom session storage layer.
- Auth session tokens can also be restored from Supabase redirect URL params after email confirmation or password recovery.
- Contractor access is not inferred from auth metadata alone. The app relies on `contractor_members`.

## 4. Signup Flow

Current implementation:

- [src/pages/auth/SignupPage.jsx](/Users/josuearana/Documents/contractorflow-crm/src/pages/auth/SignupPage.jsx:1)
- `signUpWithEmail()` in [src/services/authService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/authService.js:270)

Flow:

1. User enters:
   - full name
   - company name
   - email
   - password
2. App posts to Supabase Auth `/signup`.
3. The app sends user metadata:
   - `full_name`
   - `company_name`
4. The signup page moves into a persistent success state instead of only showing a temporary toast.
5. The success state shows the signup email and allows resending the verification email.

Current UX behavior:

- In mock mode, signup continues into the app.
- In real auth mode, signup stays on the signup page and asks the user to verify their email before signing in.

## 5. Email Verification Flow

Current implementation:

- Signup success state in [src/pages/auth/SignupPage.jsx](/Users/josuearana/Documents/contractorflow-crm/src/pages/auth/SignupPage.jsx:1)
- `resendSignUpVerificationEmail()` in [src/services/authService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/authService.js:309)

Flow:

1. User signs up.
2. Supabase sends the verification email.
3. Signup screen shows a persistent verification card.
4. User can click `Resend verification email`.
5. App calls Supabase Auth `/resend` with:
   - `type: 'signup'`
   - `email`
6. The UI enforces a short resend cooldown to prevent rapid repeat clicks.
7. After the user verifies and signs in, the normal contractor access check begins.

Redirect behavior:

- Verification links depend on the Supabase redirect URL configuration matching the app origin.
- If redirect configuration is wrong, the user may verify successfully in Supabase but land on the wrong domain or fail to restore session state in the app.

## 6. Contractor Onboarding Flow

Current implementation:

- UI: [src/pages/AuthOnboardingPage.jsx](/Users/josuearana/Documents/contractorflow-crm/src/pages/AuthOnboardingPage.jsx:1)
- Context: `completeContractorOnboarding()` in [src/contexts/AuthContext.jsx](/Users/josuearana/Documents/contractorflow-crm/src/contexts/AuthContext.jsx:389)
- Service: [src/services/supabase/contractorOnboardingSupabaseService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/supabase/contractorOnboardingSupabaseService.js:1)
- App routing gate: [src/App.jsx](/Users/josuearana/Documents/contractorflow-crm/src/App.jsx:1739)

When it runs:

- User is authenticated.
- `resolveAuthenticatedContractorAccess()` finds no active membership.
- `onboardingRequired` becomes `true`.
- The app shows the contractor onboarding page before allowing normal app navigation.

Submitted fields:

- company name
- owner name
- phone
- business email
- business address

RPC behavior:

- The app calls `rpc/complete_beta_contractor_onboarding`.
- The SQL function creates:
  - `contractors`
  - `contractor_members`
  - `company_settings`
- The function is idempotent for the same `auth.uid()` if an active membership already exists.

After success:

1. The app refreshes contractor access.
2. The new membership and contractor are resolved from `contractor_members`.
3. Local `companySettings` state is seeded from the onboarding payload.
4. User is navigated to the dashboard.

Error behavior:

- The user sees a friendly onboarding failure message.
- The technical error is logged to the console.
- Form values stay in place after failure.

## 7. `contractor_members` Relationship

Current source of truth:

- [src/services/supabase/contractorMembershipSupabaseService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/supabase/contractorMembershipSupabaseService.js:1)

How the app uses it:

- `contractor_members` is the primary relationship between an authenticated Supabase user and a contractor account.
- The app queries active, unarchived membership rows by `user_id`.
- It expects exactly one active row.

Expected relationship shape:

- `contractor_members.user_id` points to `auth.users.id`
- `contractor_members.contractor_id` points to `contractors.id`

Current access rules in app logic:

- `0` matching memberships:
  - user is considered authenticated but not connected
  - onboarding is required
- `1` matching membership:
  - access is allowed
  - contractor data loads
- `2+` matching memberships:
  - app treats this as a setup error
  - user is blocked and should contact support

Important note:

- The app does not trust `user_metadata.contractor_id` as the access authority.
- The real access authority is the membership lookup.

## 8. `company_settings` Relationship

Current source of truth:

- [src/services/supabase/settingsSupabaseService.js](/Users/josuearana/Documents/contractorflow-crm/src/services/supabase/settingsSupabaseService.js:1)

How the app uses it:

- `company_settings` is expected to be scoped by `contractor_id`.
- The app fetches settings by `contractor_id`, not by user id.
- If a settings row is missing, the settings service currently creates a default row automatically.

Expected relationship shape:

- `company_settings.contractor_id` points to `contractors.id`

How the onboarding flow uses it:

- The onboarding RPC creates `company_settings` at the same time it creates the contractor and membership.
- If the RPC sees an existing active membership and no settings row, it inserts one.
- If it finds an archived settings row, it restores it.

Security implication:

- If RLS is wrong on `company_settings`, a user can see or overwrite another contractor's settings.
- This is one of the highest-risk parts of the beta setup.

## 9. Common Troubleshooting Issues

### Missing membership

Symptoms:

- User signs in successfully but does not reach the dashboard.
- User sees the onboarding page or a contractor setup error.
- Settings and entity loads fail with “not connected to a contractor profile” style errors.

What it means:

- No active unarchived `contractor_members` row exists for `auth.users.id`.

Fix:

- Let the user complete in-app onboarding, or
- Manually create/link the `contractor_members` row with the correct `user_id` and `contractor_id`.

### Missing onboarding RPC

Symptoms:

- Onboarding submit fails immediately.
- User cannot create a contractor profile after first confirmed login.

What it means:

- `public.complete_beta_contractor_onboarding(...)` does not exist, or
- execute permission was not granted to `authenticated`, or
- the migration was not applied to the environment.

Fix:

- Apply [20260622_enable_self_service_beta_onboarding.sql](/Users/josuearana/Documents/contractorflow-crm/supabase/migrations/20260622_enable_self_service_beta_onboarding.sql:1).
- Verify the function exists in `public`.
- Verify `grant execute ... to authenticated` was applied.

### Wrong redirect URL

Symptoms:

- Verification email opens the wrong app URL.
- Password reset or email confirmation returns to the wrong host.
- User verifies email but the app does not restore the session cleanly.

What it means:

- Supabase Auth URL configuration does not match the actual app origin, or
- `VITE_AUTH_REDIRECT_URL` points to the wrong place.

Fix:

- Check `Authentication -> URL Configuration` in Supabase.
- Confirm `Site URL` and `Redirect URLs` include the current local or deployed origin.
- Confirm `getAuthRedirectUrl()` resolves to the intended host for the environment.

### Seeing another contractor's settings

Symptoms:

- A user signs in and sees the wrong company name, owner info, or settings.
- Settings updates affect the wrong contractor.

What it means:

- RLS on `company_settings` or related contractor-scoped tables is likely incorrect, or
- data rows are linked to the wrong `contractor_id`, or
- membership records point to the wrong contractor.

Fix:

- Verify the user’s active `contractor_members.contractor_id`.
- Verify the matching `company_settings.contractor_id`.
- Audit RLS so reads and writes are constrained to the authenticated user’s contractor membership.

## 10. Production Deployment Checklist

Before production deployment:

1. Set environment variables:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - `VITE_AUTH_REDIRECT_URL` if the runtime origin should not be auto-derived
2. Confirm Supabase Auth URL configuration:
   - production site URL is correct
   - production redirect URLs are correct
3. Apply required migrations:
   - `20260622_enable_self_service_beta_onboarding.sql`
4. Verify the onboarding RPC:
   - exists in `public`
   - is executable by `authenticated`
5. Verify RLS for contractor-scoped data:
   - `contractor_members`
   - `company_settings`
   - any contractor-linked entity tables enabled in beta
6. Test a full real-user journey:
   - signup
   - verification email
   - sign-in
   - onboarding
   - dashboard load
   - settings load/update
7. Test a manually linked existing user:
   - sign-in skips onboarding
   - correct contractor settings load
8. Test a missing-membership user:
   - sign-in routes to onboarding
   - onboarding creates contractor, membership, and settings
9. Test failure paths:
   - missing RPC
   - wrong redirect
   - blocked settings access
10. Confirm no user can read another contractor’s settings or contractor-scoped records.
