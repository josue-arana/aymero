export const ONBOARDING_STATE = {
  UNAUTHENTICATED: 'unauthenticated',
  MEMBERSHIP_LOADING: 'membership_loading',
  AUTHENTICATED_UNPROVISIONED: 'authenticated_unprovisioned',
  ONBOARDING_IN_PROGRESS: 'onboarding_in_progress',
  WORKSPACE_READY: 'workspace_ready',
  MEMBERSHIP_ERROR: 'membership_error',
}

export function resolveOnboardingState({
  isAuthenticated = false,
  membershipStatus = 'idle',
  onboardingCompleted = false,
} = {}) {
  if (!isAuthenticated) return ONBOARDING_STATE.UNAUTHENTICATED
  if (['idle', 'loading'].includes(membershipStatus)) return ONBOARDING_STATE.MEMBERSHIP_LOADING
  if (membershipStatus === 'missing') return ONBOARDING_STATE.AUTHENTICATED_UNPROVISIONED
  if (membershipStatus !== 'active' && membershipStatus !== 'mock') return ONBOARDING_STATE.MEMBERSHIP_ERROR
  return onboardingCompleted ? ONBOARDING_STATE.WORKSPACE_READY : ONBOARDING_STATE.ONBOARDING_IN_PROGRESS
}

export function hasUsableContractorWorkspace({ membershipStatus = 'idle', contractorId = '' } = {}) {
  return ['active', 'mock'].includes(membershipStatus) && Boolean(contractorId)
}

export function canRenderOnboardingReady({ membershipStatus = 'idle', contractorId = '', onboardingCompleted = false } = {}) {
  return hasUsableContractorWorkspace({ membershipStatus, contractorId }) && onboardingCompleted === true
}

export default {
  ONBOARDING_STATE,
  canRenderOnboardingReady,
  hasUsableContractorWorkspace,
  resolveOnboardingState,
}
