const INTERNAL_ROUTE_ROOTS = [
  '/dashboard',
  '/leads',
  '/estimates',
  '/projects',
  '/jobs',
  '/clients',
  '/contracts',
  '/invoices',
  '/calendar',
  '/settings',
]

export const navigationReturnLabelKeys = new Set([
  'backToDashboard',
  'backToLeads',
  'backToJobs',
  'backToLeadDetails',
  'backToEstimates',
  'backToEstimateBuilder',
  'backToProjectWorkspace',
  'backToClients',
  'backToContracts',
  'backToInvoices',
])

export function isSafeInternalRoute(value) {
  if (typeof value !== 'string' || !value.startsWith('/') || value.startsWith('//')) return false

  const pathname = value.split(/[?#]/, 1)[0]
  return INTERNAL_ROUTE_ROOTS.some((root) => pathname === root || pathname.startsWith(`${root}/`))
}

export function createNavigationContext(returnTo, returnLabelKey) {
  if (!isSafeInternalRoute(returnTo) || !navigationReturnLabelKeys.has(returnLabelKey)) return null

  return { returnTo, returnLabelKey }
}

export function withNavigationContext(state = {}, returnTo, returnLabelKey) {
  const navigationContext = createNavigationContext(returnTo, returnLabelKey)
  return navigationContext ? { ...state, navigationContext } : { ...state }
}

export function resolveNavigationContext(state, fallback) {
  const candidate = state?.navigationContext
  if (candidate && isSafeInternalRoute(candidate.returnTo) && navigationReturnLabelKeys.has(candidate.returnLabelKey)) {
    return candidate
  }

  return createNavigationContext(fallback.returnTo, fallback.returnLabelKey)
}
