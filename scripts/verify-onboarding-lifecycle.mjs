import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import {
  ONBOARDING_STATE,
  canRenderOnboardingReady,
  resolveOnboardingState,
} from '../src/utils/onboardingState.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const authContext = read('../src/contexts/AuthContext.jsx')
const app = read('../src/App.jsx')
const onboardingPage = read('../src/pages/AuthOnboardingPage.jsx')
const onboardingService = read('../src/services/supabase/contractorOnboardingSupabaseService.js')
const membershipService = read('../src/services/supabase/contractorMembershipSupabaseService.js')
const onboardingRpc = read('../supabase/migrations/20260622235647_enable_self_service_beta_onboarding.sql')
const sampleWorkspace = read('../src/services/sampleWorkspaceService.js')
const onboardingState = read('../src/utils/onboardingState.js')

// Case 1 / 9: authentication without a usable membership cannot be Ready.
assert.equal(resolveOnboardingState({ isAuthenticated: true, membershipStatus: 'missing' }), ONBOARDING_STATE.AUTHENTICATED_UNPROVISIONED)
assert.equal(canRenderOnboardingReady({ membershipStatus: 'missing', contractorId: '', onboardingCompleted: true }), false)

// Cases 2 / 3: membership-backed setup remains in progress until its saved
// completion state is restored; the same resolver is used after refresh and
// after a new auth session is established.
assert.equal(resolveOnboardingState({ isAuthenticated: true, membershipStatus: 'active', onboardingCompleted: false }), ONBOARDING_STATE.ONBOARDING_IN_PROGRESS)
assert.equal(resolveOnboardingState({ isAuthenticated: true, membershipStatus: 'active', onboardingCompleted: true }), ONBOARDING_STATE.WORKSPACE_READY)

// Case 4 / 5 / 10: a valid contractor context is sufficient; billing is not
// part of the state machine.
assert.equal(canRenderOnboardingReady({ membershipStatus: 'active', contractorId: 'contractor-1', onboardingCompleted: true }), true)
assert.match(onboardingState, /ONBOARDING_STATE\.WORKSPACE_READY/)
assert.doesNotMatch(authContext, /subscription|stripe|trial/i)

// Case 6: browser progress is keyed to the authenticated user, and stale
// completion cannot survive a user switch in the app shell.
assert.match(onboardingPage, /aymero\.onboarding\.\$\{user\?\.id \|\| 'anonymous'\}/)
assert.match(app, /previousAuthIdentityKeyRef/)
assert.match(app, /setOnboardingSessionActive\(false\)/)
assert.match(app, /completed: false,[\s\S]*dismissed: false,[\s\S]*step: 1/)

// Cases 7 / 8: the existing RPC is the single provisioning mechanism; it is
// transactional/idempotent for sequential retries, while the client also
// coalesces repeated in-flight requests in one browser context.
assert.match(onboardingService, /inFlightOnboardingRequests = new Map\(\)/)
assert.match(onboardingService, /inFlightOnboardingRequests\.get\(requestKey\)/)
assert.match(onboardingRpc, /if existing_membership_row\.id is not null then/)
assert.match(onboardingRpc, /grant execute on function[\s\S]*to authenticated/)
assert.doesNotMatch(onboardingService, /service_role/i)
assert.match(membershipService, /CONTRACTOR_PROFILE_MISSING/)

// Provisioning must be confirmed by a fresh membership resolution before the
// page can advance, and the application must not seed sample data without a
// contractor context.
assert.match(authContext, /refreshedAccess\?\.membershipStatus !== 'active'/)
assert.match(onboardingPage, /maximumAllowedStep = canRestoreReady \? TOTAL_STEPS : TOTAL_STEPS - 1/)
assert.match(app, /SAMPLE_DATA_CONTRACTOR_MISSING/)
assert.match(sampleWorkspace, /contractorId/)

// Case 9 / navigation: Ready can be left and cannot be fabricated by a future
// step or by a stale completed flag.
assert.match(onboardingPage, /onClick=\{\(\) => \{ void goBack\(\) \}\}/)
assert.match(onboardingPage, /draft\?\.onboarding\?\.completed === true/)
assert.match(app, /runWithUsableWorkspace/)

console.log('Onboarding lifecycle validation passed.')
