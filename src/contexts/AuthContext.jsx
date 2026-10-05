import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { appRoutes } from '../config/appRoutes'
import { BETA_CONTRACTOR_ID, USE_AUTH } from '../config/backendConfig'
import { MOCK_CONTRACTOR } from '../constants/mockContractor'
import { useToast } from '../components/common/ToastProvider'
import { createTranslator } from '../translations'
import { getAuthServiceStatus, getCurrentUser, resendSignUpVerificationEmail as authResendSignUpVerificationEmail, resetPassword as authResetPassword, signInWithEmail, signOut, signUpWithEmail, subscribeToAuthChanges, updatePassword as authUpdatePassword, updateProfile as authUpdateProfile } from '../services/authService'
import { resolveAuthenticatedContractorAccess, updateAuthenticatedPreferredLanguage } from '../services/supabase/contractorMembershipSupabaseService'
import { completeBetaContractorOnboarding } from '../services/supabase/contractorOnboardingSupabaseService'
import { normalizeSupportedLanguage, resolveInitialSupportedLanguage } from '../utils/language'
import { ONBOARDING_STATE, resolveOnboardingState } from '../utils/onboardingState'

const AuthContext = createContext(null)

const mockContractor = {
  id: MOCK_CONTRACTOR.id,
  contractorId: BETA_CONTRACTOR_ID,
  fullName: MOCK_CONTRACTOR.name,
  email: 'josue@aymero.example',
  role: 'Owner Admin',
}

const mockCompany = {
  id: 'mock-company-001',
  contractorId: BETA_CONTRACTOR_ID,
  name: MOCK_CONTRACTOR.name,
  plan: 'Private Beta',
  locale: 'en-US',
}

const mockSession = {
  access_token: 'mock-beta-token',
  refresh_token: 'mock-refresh-token',
  expires_in: 0,
  expires_at: 0,
  token_type: 'bearer',
  user: {
    id: mockContractor.id,
    email: mockContractor.email,
    user_metadata: {
      full_name: mockContractor.fullName,
      company_name: mockCompany.name,
      contractor_id: BETA_CONTRACTOR_ID,
      role: mockContractor.role,
    },
  },
}

const mockContractorAccess = {
  contractorId: BETA_CONTRACTOR_ID,
  membershipStatus: 'mock',
  membership: {
    id: 'mock-membership-001',
    contractor_id: BETA_CONTRACTOR_ID,
    role: 'owner',
    status: 'active',
    name: mockContractor.fullName,
    email: mockContractor.email,
  },
  contractorRecord: {
    id: BETA_CONTRACTOR_ID,
    company_name: mockCompany.name,
    owner_name: mockContractor.fullName,
    email: mockContractor.email,
  },
  requiresSetup: false,
  fallbackActive: true,
  error: null,
  isLoading: false,
}

function createEmptyContractorAccessState(overrides = {}) {
  return {
    contractorId: '',
    membershipStatus: USE_AUTH ? 'idle' : 'mock',
    membership: null,
    contractorRecord: null,
    requiresSetup: false,
    fallbackActive: false,
    error: null,
    isLoading: USE_AUTH,
    ...overrides,
  }
}

function buildMissingMembershipError() {
  return {
    message: 'Your account is not connected to a contractor profile yet.',
    code: 'CONTRACTOR_MEMBERSHIP_MISSING',
    details: null,
    status: null,
  }
}

function normalizeAuthenticatedUser(user, contractorId = '') {
  if (!user) return null

  const nextMetadata = {
    ...(user.user_metadata || {}),
  }

  if (contractorId) {
    nextMetadata.contractor_id = contractorId
  } else {
    delete nextMetadata.contractor_id
  }

  return {
    ...user,
    user_metadata: nextMetadata,
  }
}

function buildResolvedContractorAccess(result) {
  if (!USE_AUTH) {
    return mockContractorAccess
  }

  const contractorId = result?.data?.contractorId || ''
  const membershipStatus = result?.data?.membershipStatus || (result?.error ? 'error' : 'missing')
  const requiresSetup = result?.data?.requiresSetup ?? membershipStatus !== 'active'
  const fallbackError = requiresSetup && !result?.error ? buildMissingMembershipError() : null

  return createEmptyContractorAccessState({
    contractorId,
    membershipStatus,
    membership: result?.data?.membership || null,
    contractorRecord: result?.data?.contractor || null,
    requiresSetup,
    fallbackActive: false,
    error: result?.error || fallbackError,
    isLoading: false,
  })
}

function buildContractorState(nextUser, contractorAccess, currentContractor = mockContractor) {
  if (!nextUser) return null

  const baseContractor = currentContractor || mockContractor
  const membership = contractorAccess?.membership || {}

  return {
    ...baseContractor,
    id: membership.id || nextUser.id || baseContractor.id,
    contractorId: contractorAccess?.contractorId || '',
    fullName: membership.name || nextUser?.user_metadata?.full_name || baseContractor.fullName,
    email: membership.email || nextUser?.email || baseContractor.email,
    role: membership.role || nextUser?.user_metadata?.role || baseContractor.role,
  }
}

function buildCompanyState(nextUser, contractorAccess, currentCompany = mockCompany) {
  if (!nextUser) return null

  const baseCompany = currentCompany || mockCompany
  const contractorRecord = contractorAccess?.contractorRecord || {}

  return {
    ...baseCompany,
    contractorId: contractorAccess?.contractorId || '',
    name: contractorRecord.company_name || nextUser?.user_metadata?.company_name || baseCompany.name,
  }
}

function getAuthTranslator() {
  return createTranslator(resolveInitialSupportedLanguage('contractorflow.language', 'en'))
}

export function AuthProvider({ children }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const resolutionIdRef = useRef(0)
  const [session, setSession] = useState(USE_AUTH ? null : mockSession)
  const [user, setUser] = useState(USE_AUTH ? null : mockSession.user)
  const [company, setCompany] = useState(USE_AUTH ? null : mockCompany)
  const [contractor, setContractor] = useState(USE_AUTH ? null : mockContractor)
  const [contractorAccess, setContractorAccess] = useState(USE_AUTH ? createEmptyContractorAccessState({ membershipStatus: 'loading' }) : mockContractorAccess)
  const [isLoading, setIsLoading] = useState(USE_AUTH)

  function clearAuthenticatedState() {
    setSession(null)
    setUser(null)
    setCompany(null)
    setContractor(null)
    setContractorAccess(createEmptyContractorAccessState({ membershipStatus: 'idle', isLoading: false }))
  }

  async function applyAuthenticatedSession(nextSession, { isMountedRef } = {}) {
    const nextUser = nextSession?.user

    if (!nextUser) {
      clearAuthenticatedState()
      setIsLoading(false)
      return
    }

    const resolutionId = ++resolutionIdRef.current
    setIsLoading(true)
    setContractorAccess((current) => createEmptyContractorAccessState({
      ...current,
      membershipStatus: 'loading',
      isLoading: true,
      error: null,
    }))

    const accessResult = await resolveAuthenticatedContractorAccess(nextUser.id)

    if (isMountedRef && !isMountedRef.current) return
    if (resolutionId !== resolutionIdRef.current) return

    const resolvedAccess = buildResolvedContractorAccess(accessResult)
    const normalizedUser = normalizeAuthenticatedUser(nextUser, resolvedAccess.contractorId)
    const normalizedSession = {
      ...nextSession,
      user: normalizedUser,
    }

    setSession(normalizedSession)
    setUser(normalizedUser)
    setContractorAccess(resolvedAccess)
    setContractor((current) => buildContractorState(normalizedUser, resolvedAccess, current))
    setCompany((current) => buildCompanyState(normalizedUser, resolvedAccess, current))
    setIsLoading(false)
    return {
      session: normalizedSession,
      contractorAccess: resolvedAccess,
      user: normalizedUser,
    }
  }

  useEffect(() => {
    if (!USE_AUTH) {
      setSession(mockSession)
      setUser(mockSession.user)
      setCompany(mockCompany)
      setContractor(mockContractor)
      setContractorAccess(mockContractorAccess)
      setIsLoading(false)
      return undefined
    }

    const isMountedRef = { current: true }

    async function loadAuthState() {
      setIsLoading(true)
      const result = await getCurrentUser()

      if (!isMountedRef.current) return

      if (result.session?.user) {
        await applyAuthenticatedSession(result.session, { isMountedRef })
        return
      }

      clearAuthenticatedState()
      setIsLoading(false)
    }

    loadAuthState()

    const unsubscribe = subscribeToAuthChanges(({ event, session: nextSession, user: nextUser }) => {
      if (!isMountedRef.current) return

      if (event === 'SESSION_EXPIRED') {
        clearAuthenticatedState()

        if (typeof window === 'undefined' || window.location.pathname !== appRoutes.login) {
          navigate(appRoutes.login, { replace: true })
        }

        showToast(getAuthTranslator()('sessionExpiredLoginAgain'), 'error')
        return
      }

      if (!nextUser || !nextSession) {
        clearAuthenticatedState()
        return
      }

      applyAuthenticatedSession({
        ...nextSession,
        user: nextUser,
      }, { isMountedRef })
    })

    return () => {
      isMountedRef.current = false
      unsubscribe()
    }
  }, [navigate, showToast])

  async function signIn(credentials) {
    const result = await signInWithEmail(credentials)

    if (!USE_AUTH) {
      setSession(mockSession)
      setUser(mockSession.user)
      setCompany(mockCompany)
      setContractor(mockContractor)
      setContractorAccess(mockContractorAccess)
    }

    return result
  }

  async function signUp(payload) {
    const result = await signUpWithEmail(payload)

    if (!USE_AUTH) {
      setSession({
        ...mockSession,
        user: {
          ...mockSession.user,
          email: payload.email,
          user_metadata: {
            ...mockSession.user.user_metadata,
            full_name: payload.fullName || mockContractor.fullName,
            company_name: payload.companyName || mockCompany.name,
            contractor_id: BETA_CONTRACTOR_ID,
            preferred_language: normalizeSupportedLanguage(payload.preferredLanguage, 'en'),
          },
        },
      })
      setUser((current) => ({
        ...(current || mockSession.user),
        email: payload.email,
        user_metadata: {
          ...(current?.user_metadata || mockSession.user.user_metadata),
          full_name: payload.fullName || mockContractor.fullName,
          company_name: payload.companyName || mockCompany.name,
          contractor_id: BETA_CONTRACTOR_ID,
          preferred_language: normalizeSupportedLanguage(payload.preferredLanguage, 'en'),
        },
      }))
      setCompany((current) => ({ ...current, contractorId: current.contractorId || BETA_CONTRACTOR_ID, name: payload.companyName || current.name }))
      setContractor((current) => ({ ...current, contractorId: current.contractorId || BETA_CONTRACTOR_ID, fullName: payload.fullName || current.fullName, email: payload.email }))
      setContractorAccess({
        ...mockContractorAccess,
        membership: {
          ...mockContractorAccess.membership,
          preferred_language: normalizeSupportedLanguage(payload.preferredLanguage, 'en'),
        },
      })
    }

    if (USE_AUTH && !result.error && payload?.preferredLanguage) {
      void persistPreferredLanguage(payload.preferredLanguage)
    }

    return result
  }

  async function resendSignUpVerificationEmail(email) {
    return authResendSignUpVerificationEmail(email)
  }

  async function logout() {
    const result = await signOut()

    if (USE_AUTH) {
      clearAuthenticatedState()
    } else {
      setSession(mockSession)
      setUser(mockSession.user)
      setCompany(mockCompany)
      setContractor(mockContractor)
      setContractorAccess(mockContractorAccess)
    }

    return result
  }

  async function resetPassword(email) {
    return authResetPassword(email)
  }

  async function updatePassword(password) {
    return authUpdatePassword(password)
  }

  async function refreshContractorAccess() {
    if (!USE_AUTH) {
      return {
        data: {
          contractorAccess: mockContractorAccess,
        },
        error: null,
        skipped: true,
      }
    }

    const currentSession = session
      ? {
          ...session,
          user: user || session.user,
        }
      : null

    if (!currentSession?.user) {
      return {
        data: null,
        error: {
          message: 'No authenticated session is available.',
          code: 'AUTH_SESSION_MISSING',
          details: null,
          status: 401,
        },
        skipped: false,
      }
    }

    const refreshed = await applyAuthenticatedSession(currentSession)

    return {
      data: refreshed || null,
      error: null,
      skipped: false,
    }
  }

  async function completeContractorOnboarding(profile) {
    if (!USE_AUTH) {
      return createMockOnboardingResult(profile)
    }

    const onboardingResult = await completeBetaContractorOnboarding(profile)

    if (onboardingResult.error || onboardingResult.skipped) {
      return onboardingResult
    }

    const refreshResult = await refreshContractorAccess()

    if (refreshResult.error) {
      return {
        data: onboardingResult.data,
        error: refreshResult.error,
        skipped: false,
      }
    }

    const refreshedAccess = refreshResult.data?.contractorAccess
    if (refreshedAccess?.membershipStatus !== 'active' || !refreshedAccess?.contractorId) {
      return {
        data: onboardingResult.data,
        error: buildMissingMembershipError(),
        skipped: false,
      }
    }

    return {
      data: {
        ...(onboardingResult.data || {}),
        contractorAccess: refreshedAccess,
      },
      error: null,
      skipped: false,
    }
  }

  async function updateProfile(updates) {
    const result = await authUpdateProfile(updates)

    if (!USE_AUTH) {
      setUser((current) => ({
        ...(current || mockSession.user),
        email: updates?.email || current?.email || mockSession.user.email,
        user_metadata: {
          ...(current?.user_metadata || mockSession.user.user_metadata),
          ...(updates?.fullName !== undefined ? { full_name: updates.fullName } : {}),
          ...(updates?.companyName !== undefined ? { company_name: updates.companyName } : {}),
          ...(updates?.preferredLanguage !== undefined ? { preferred_language: normalizeSupportedLanguage(updates.preferredLanguage, 'en') } : {}),
          contractor_id: current?.user_metadata?.contractor_id || mockSession.user.user_metadata.contractor_id,
        },
      }))
      setCompany((current) => ({ ...current, contractorId: current.contractorId || BETA_CONTRACTOR_ID, name: updates?.companyName || current.name }))
      setContractor((current) => ({
        ...current,
        contractorId: current.contractorId || BETA_CONTRACTOR_ID,
        fullName: updates?.fullName || current.fullName,
        email: updates?.email || current.email,
      }))
      setContractorAccess((current) => ({
        ...(current || mockContractorAccess),
        membership: {
          ...((current?.membership) || mockContractorAccess.membership),
          ...(updates?.preferredLanguage !== undefined ? { preferred_language: normalizeSupportedLanguage(updates.preferredLanguage, 'en') } : {}),
        },
      }))
    }

    return result
  }

  async function persistPreferredLanguage(nextLanguage) {
    const normalizedLanguage = normalizeSupportedLanguage(nextLanguage, 'en')

    if (!USE_AUTH) {
      setUser((current) => ({
        ...(current || mockSession.user),
        user_metadata: {
          ...(current?.user_metadata || mockSession.user.user_metadata),
          preferred_language: normalizedLanguage,
        },
      }))
      setContractorAccess((current) => ({
        ...(current || mockContractorAccess),
        membership: {
          ...((current?.membership) || mockContractorAccess.membership),
          preferred_language: normalizedLanguage,
        },
      }))

      return {
        data: {
          preferredLanguage: normalizedLanguage,
        },
        error: null,
        skipped: true,
      }
    }

    let authProfileResult = {
      data: null,
      error: null,
      skipped: true,
    }

    if (session?.access_token) {
      authProfileResult = await authUpdateProfile({
        preferredLanguage: normalizedLanguage,
      })

      if (authProfileResult.error && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Auth profile language persistence failed.', authProfileResult.error)
      }
    }

    let membershipResult = {
      data: null,
      error: null,
      skipped: contractorAccess?.membershipStatus !== 'active',
    }

    if (user?.id && contractorAccess?.membershipStatus === 'active') {
      membershipResult = await updateAuthenticatedPreferredLanguage(user.id, normalizedLanguage)

      if (membershipResult.data) {
        setContractorAccess((current) => ({
          ...current,
          membership: {
            ...(current?.membership || {}),
            ...membershipResult.data,
          },
        }))
      } else if (membershipResult.error && import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Contractor membership language persistence failed.', membershipResult.error)
      }
    }

    return {
      data: {
        preferredLanguage: normalizedLanguage,
        authProfile: authProfileResult.data,
        membership: membershipResult.data,
      },
      error: authProfileResult.error || membershipResult.error || null,
      skipped: Boolean(authProfileResult.skipped && membershipResult.skipped),
    }
  }

  const authMode = USE_AUTH ? 'supabase' : 'mock'
  const isAuthenticated = Boolean(user)
  const hasContractorAccess = contractorAccess.membershipStatus === 'active' || contractorAccess.membershipStatus === 'mock'
  const onboardingState = resolveOnboardingState({
    isAuthenticated,
    membershipStatus: contractorAccess.membershipStatus,
    onboardingCompleted: hasContractorAccess,
  })
  const onboardingRequired = Boolean(USE_AUTH && onboardingState === ONBOARDING_STATE.AUTHENTICATED_UNPROVISIONED)
  const onboardingCompleted = onboardingState === ONBOARDING_STATE.WORKSPACE_READY

  const value = useMemo(() => ({
    user,
    session,
    company,
    contractor,
    contractorAccess,
    isAuthenticated,
    hasContractorAccess,
    onboardingRequired,
    onboardingCompleted,
    authSetupError: contractorAccess.requiresSetup ? contractorAccess.error : null,
    isLoading,
    authMode,
    authServiceStatus: getAuthServiceStatus(),
    signIn,
    signUp,
    resendSignUpVerificationEmail,
    completeContractorOnboarding,
    refreshContractorAccess,
    logout,
    resetPassword,
    updatePassword,
    updateProfile,
    persistPreferredLanguage,
  }), [user, session, company, contractor, contractorAccess, isAuthenticated, hasContractorAccess, onboardingRequired, onboardingCompleted, isLoading, authMode])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

function createMockOnboardingResult(profile = {}) {
  return {
    data: {
      contractorId: BETA_CONTRACTOR_ID,
      companyName: profile.companyName || mockCompany.name,
      ownerName: profile.ownerName || mockContractor.fullName,
      phone: profile.phone || '',
      businessEmail: profile.businessEmail || mockContractor.email,
      businessAddress: profile.businessAddress || '',
      onboardingCompleted: true,
      existingMembership: true,
      contractorAccess: mockContractorAccess,
    },
    error: null,
    skipped: true,
  }
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider.')
  }

  return context
}
