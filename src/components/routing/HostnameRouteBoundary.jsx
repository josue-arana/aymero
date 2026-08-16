import { useEffect, useMemo, useRef, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { createTranslator } from '../../translations'
import { getCurrentUser } from '../../services/authService'
import { getHostnameEnvironmentConfig } from '../../services/system/environmentService'
import { resolveInitialSupportedLanguage } from '../../utils/language'
import { buildAppSessionTransferUrl, resolveHostnameRoute } from '../../utils/hostnameRouting'
import { appRoutes } from '../../config/appRoutes'

function AbsoluteRedirect({ target }) {
  useEffect(() => {
    if (!target || typeof window === 'undefined' || window.location.href === target) return
    window.location.replace(target)
  }, [target])

  return null
}

function BoundaryMessage({ portal = false }) {
  const language = resolveInitialSupportedLanguage(
    portal ? 'contractorflow.portalLanguage' : 'contractorflow.language',
    'en'
  )
  const t = createTranslator(language)

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 py-[max(1rem,env(safe-area-inset-top))] sm:px-6">
      <section className="w-full max-w-xl rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">
          {t(portal ? 'clientPortalNotFound' : 'hostRouteUnavailable')}
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-500">
          {t(portal ? 'clientPortalNotFoundHelp' : 'hostRouteUnavailableHelp')}
        </p>
      </section>
    </main>
  )
}

function getBrowserRouteDecision(location) {
  const environment = getHostnameEnvironmentConfig()

  return {
    decision: resolveHostnameRoute({
      hostname: typeof window === 'undefined' ? '' : window.location.hostname,
      pathname: location.pathname,
      search: location.search,
      hash: location.hash,
      origins: environment.origins,
      isDevelopment: import.meta.env.DEV,
    }),
    environment,
  }
}

function AuthHostBridge({ decision, environment, location }) {
  const [resolvedTarget, setResolvedTarget] = useState('')
  const [showLogin, setShowLogin] = useState(false)
  const [hasConfigurationError, setHasConfigurationError] = useState(false)

  useEffect(() => {
    let isCancelled = false
    setResolvedTarget('')
    setShowLogin(false)
    setHasConfigurationError(false)

    async function resolveAuthDestination() {
      const result = await getCurrentUser()
      if (isCancelled) return

      if (result?.session?.access_token && result?.session?.refresh_token) {
        const sessionTarget = buildAppSessionTransferUrl(
          environment.origins,
          result.session,
          {
            pathname: decision.action === 'auth-entry' ? appRoutes.dashboard : location.pathname,
            search: decision.action === 'auth-entry' ? '' : location.search,
          }
        )

        if (!sessionTarget) {
          setHasConfigurationError(true)
          return
        }

        setResolvedTarget(sessionTarget)
        return
      }

      if (decision.action === 'auth-entry') {
        setShowLogin(true)
        return
      }

      setResolvedTarget(decision.target)
    }

    resolveAuthDestination()
    return () => {
      isCancelled = true
    }
  }, [decision.action, decision.target, environment.origins, location.pathname, location.search])

  useEffect(() => {
    if (!hasConfigurationError) return

    // eslint-disable-next-line no-console
    console.error('[Aymero] Authentication completed, but the canonical app URL is unavailable.', {
      missingConfiguration: environment.missingKeys,
      invalidConfiguration: environment.invalidKeys,
    })
  }, [environment.invalidKeys, environment.missingKeys, hasConfigurationError])

  if (resolvedTarget) return <AbsoluteRedirect target={resolvedTarget} />
  if (hasConfigurationError) return <BoundaryMessage />
  if (showLogin) return <Navigate to={appRoutes.login} replace />
  return null
}

export function HostnameRouteBoundary({ children, publicEstimateElement = null }) {
  const location = useLocation()
  const hasLoggedConfigurationError = useRef(false)
  const { decision, environment } = useMemo(
    () => getBrowserRouteDecision(location),
    [location.hash, location.pathname, location.search]
  )
  const needsAuthBridge = decision.action === 'auth-entry'
    || (decision.action === 'redirect' && decision.reason === 'contractor-route-on-auth-host')

  useEffect(() => {
    if (decision.action !== 'configuration-error' || hasLoggedConfigurationError.current) return

    hasLoggedConfigurationError.current = true
    // No URL values or credentials are logged; only safe field names and the current host.
    // eslint-disable-next-line no-console
    console.error('[Aymero] Hostname route boundary could not safely classify this deployment.', {
      hostname: typeof window === 'undefined' ? '' : window.location.hostname,
      reason: decision.reason,
      missingConfiguration: environment.missingKeys,
      invalidConfiguration: environment.invalidKeys,
    })
  }, [decision.action, decision.reason, environment.invalidKeys, environment.missingKeys])

  if (needsAuthBridge) {
    return <AuthHostBridge decision={decision} environment={environment} location={location} />
  }

  if (decision.action === 'redirect') {
    return <AbsoluteRedirect target={decision.target} />
  }

  if (decision.action === 'portal-not-found') {
    return <BoundaryMessage portal />
  }

  if (decision.action === 'configuration-error') {
    return <BoundaryMessage />
  }

  if (decision.action === 'public-estimate') {
    return publicEstimateElement
  }

  return children
}
