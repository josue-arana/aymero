import { buildDeveloperHealthSnapshot } from '../utils/developerHealth'
import { USE_AUTH, USE_SUPABASE_CLIENTS, USE_SUPABASE_CONTRACTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_EVENTS, USE_SUPABASE_LEADS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS, USE_SUPABASE_SETTINGS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import { getClientsContractorId } from '../services/system/clientsRuntimeService'
import { getLeadsContractorId } from '../services/system/leadsRuntimeService'
import { getPaymentsContractorId } from '../services/system/paymentsRuntimeService'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { getEventsContractorId } from '../services/system/eventsRuntimeService'
import { getSettingsContractorId, hasAuthenticatedSupabaseSettingsUser } from '../services/system/settingsRuntimeService'
import { isBetaContractorFallbackActive } from '../services/system/contractorRuntimeService'
import { getSettingsRuntimeStatus } from '../services/supabase/settingsSupabaseService'
import { getContractorOnboardingRuntimeStatus } from '../services/supabase/contractorOnboardingSupabaseService'
import { buildDisplayedUserProfile } from '../services/system/userProfileRuntimeService'

function StatusBadge({ status }) {
  const classes = {
    PASS: 'bg-emerald-100 text-emerald-800',
    WARNING: 'bg-amber-100 text-amber-800',
    FAIL: 'bg-rose-100 text-rose-800',
  }

  return (
    <span className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${classes[status] || classes.WARNING}`}>
      {status}
    </span>
  )
}

function translateDiagnosticValue(t, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'object' && !Array.isArray(value) && value.key) {
    return t(value.key, value.params || {})
  }
  return String(value)
}

function DiagnosticValue({ value, t }) {
  if (Array.isArray(value)) {
    if (!value.length) return <span>{t('none')}</span>
    return (
      <ul className="mt-1 flex min-w-0 flex-wrap gap-1.5">
        {value.map((item, index) => (
          <li key={`${translateDiagnosticValue(t, item)}-${index}`} className="max-w-full rounded-lg bg-white px-2 py-1 font-mono text-xs font-semibold text-slate-700 ring-1 ring-slate-200 [overflow-wrap:anywhere]">
            {translateDiagnosticValue(t, item)}
          </li>
        ))}
      </ul>
    )
  }

  return <span className="[overflow-wrap:anywhere]">{translateDiagnosticValue(t, value)}</span>
}

function DiagnosticField({ label, value, t }) {
  if (value === null || value === undefined || value === '') return null

  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-1 min-w-0 text-sm font-semibold text-slate-700">
        <DiagnosticValue value={value} t={t} />
      </div>
    </div>
  )
}

function HealthCheckCard({ check, t }) {
  const isHealthy = check.status === 'PASS'
  const summary = translateDiagnosticValue(t, check.summary)

  return (
    <article className={`min-w-0 rounded-2xl border p-4 ${isHealthy ? 'border-slate-200 bg-slate-50' : check.status === 'FAIL' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-bold text-slate-950">{t(check.labelKey)}</p>
          {summary ? <p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{summary}</p> : null}
        </div>
        <StatusBadge status={check.status} />
      </div>

      {!isHealthy ? (
        <details className="group mt-3 min-w-0 rounded-xl border border-slate-200 bg-white/80">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="inline-flex items-center gap-2">
              <span>{t('viewDiagnosticDetails')}</span>
              <span aria-hidden="true" className="text-xs text-slate-400 transition group-open:rotate-180">▼</span>
            </span>
          </summary>
          <div className="min-w-0 space-y-4 border-t border-slate-200 p-3">
            {check.diagnosticIncomplete ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{t('diagnosticImplementationIncomplete')}</p>
            ) : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <DiagnosticField label={t('expected')} value={check.expected} t={t} />
              <DiagnosticField label={t('actual')} value={check.actual} t={t} />
            </div>
            {check.details?.length ? (
              <DiagnosticField label={t('diagnosticDetails')} value={check.details} t={t} />
            ) : null}
            {check.affectedItems?.length ? (
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('affectedItems')}</p>
                <div className="mt-2 space-y-2">
                  {check.affectedItems.map((item) => (
                    <div key={item.id} className="min-w-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="break-words text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">{item.labelKey ? t(item.labelKey) : item.label || item.id}</p>
                      {item.issueKey ? <p className="mt-1 break-words text-sm text-slate-600 [overflow-wrap:anywhere]">{t(item.issueKey)}</p> : null}
                      <div className="mt-3 grid min-w-0 gap-3 sm:grid-cols-2">
                        <DiagnosticField label={t('expected')} value={item.expected} t={t} />
                        <DiagnosticField label={t('actual')} value={item.actual} t={t} />
                      </div>
                      {item.values?.length ? <div className="mt-3"><DiagnosticField label={t('diagnosticFindings')} value={item.values} t={t} /></div> : null}
                      {item.sourceHint ? <p className="mt-3 break-words font-mono text-xs font-semibold text-slate-500 [overflow-wrap:anywhere]">{t('sourceHint')}: {item.sourceHint}</p> : null}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
            {check.sourceHint ? <p className="break-words font-mono text-xs font-semibold text-slate-500 [overflow-wrap:anywhere]">{t('sourceHint')}: {check.sourceHint}</p> : null}
          </div>
        </details>
      ) : null}
    </article>
  )
}

function SummaryCard({ label, value, helper }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">{label}</p>
      <p className="mt-2 text-3xl font-bold text-slate-950">{value}</p>
      {helper ? <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p> : null}
    </div>
  )
}

function SectionCard({ title, children, action }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-950">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function AuditList({ title, items, emptyLabel, renderItem }) {
  return (
    <SectionCard title={title} action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{items.length}</span>}>
      {items.length > 0 ? (
        <div className="max-h-80 space-y-2 overflow-auto">
          {items.map((item) => renderItem(item))}
        </div>
      ) : (
        <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{emptyLabel}</p>
      )}
    </SectionCard>
  )
}

function getMembershipStatusLabel(t, status) {
  if (status === 'active') return t('membershipStatusActive')
  if (status === 'loading') return t('membershipStatusLoading')
  if (status === 'multiple') return t('membershipStatusMultiple')
  if (status === 'mock') return t('membershipStatusMock')
  if (status === 'error') return t('membershipStatusError')
  return t('membershipStatusMissing')
}

function getSettingsLoadStatusLabel(t, status) {
  if (status === 'loading') return t('settingsLoadStatusLoading')
  if (status === 'saving') return t('settingsLoadStatusSaving')
  if (status === 'success') return t('settingsLoadStatusSuccess')
  if (status === 'error') return t('settingsLoadStatusError')
  return t('settingsLoadStatusIdle')
}

function getProfileSourceLabel(t, source) {
  if (source === 'auth_metadata') return t('profileSourceAuthMetadata')
  if (source === 'contractor_members') return t('profileSourceContractorMembers')
  if (source === 'mock') return t('profileSourceMock')
  return t('profileSourceFallback')
}

export function TranslationAuditPage({ t }) {
  const snapshot = buildDeveloperHealthSnapshot()
  const { authMode, authServiceStatus, contractor, company, contractorAccess, onboardingCompleted, onboardingRequired, user, session } = useAuth()
  const displayedUserProfile = buildDisplayedUserProfile({
    contractor,
    contractorAccess,
    mockProfile: {
      name: 'Josue Arana',
      email: 'josue@aymero.example',
      phone: '(410) 555-0188',
      preferredLanguage: 'en',
      timezone: 'America/New_York',
    },
    session,
    user,
  }).profile
  const settingsContractorId = getSettingsContractorId({ contractor, company, session })
  const clientsContractorId = getClientsContractorId({ contractor, company, session })
  const leadsContractorId = getLeadsContractorId({ contractor, company, session })
  const projectsContractorId = getProjectsContractorId({ contractor, company, session })
  const paymentsContractorId = getPaymentsContractorId({ contractor, company, session })
  const eventsContractorId = getEventsContractorId({ contractor, company, session })
  const settingsRuntimeStatus = getSettingsRuntimeStatus()
  const onboardingRuntimeStatus = getContractorOnboardingRuntimeStatus()
  const betaFallbackActive = isBetaContractorFallbackActive({ contractor, company, session })
  const hasSettingsSupabaseUser = hasAuthenticatedSupabaseSettingsUser({
    authMode,
    membershipStatus: contractorAccess?.membershipStatus,
    user,
    session,
  })
  const settingsBackendWarning = USE_SUPABASE_SETTINGS && !hasSettingsSupabaseUser
  const settingsBackendStatus = settingsBackendWarning ? 'WARNING' : snapshot.settingsBackend.status
  const settingsBackendReadinessKey = settingsBackendWarning ? 'notReady' : 'ready'
  const settingsBackendRows = [
    {
      id: 'settingsReadiness',
      label: t('settingsSupabaseReadiness'),
      value: t(settingsBackendReadinessKey),
    },
    {
      id: 'useSupabaseSettings',
      label: t('backendEnvironmentUseSupabaseSettings'),
      value: t(USE_SUPABASE_SETTINGS ? 'enabled' : 'disabled'),
    },
    {
      id: 'useAuth',
      label: t('backendEnvironmentUseAuth'),
      value: t(USE_AUTH ? 'enabled' : 'disabled'),
    },
    {
      id: 'authMode',
      label: t('authMode'),
      value: authMode === 'mock' ? t('mockAuth') : t('supabaseAuth'),
    },
    {
      id: 'currentUserId',
      label: t('currentUserId'),
      value: user?.id || t('notAvailable'),
    },
    {
      id: 'authEmail',
      label: t('authEmail'),
      value: user?.email || t('notAvailable'),
    },
    {
      id: 'displayedProfileName',
      label: t('displayedProfileName'),
      value: displayedUserProfile?.name || t('notAvailable'),
    },
    {
      id: 'displayedProfileEmail',
      label: t('displayedProfileEmail'),
      value: displayedUserProfile?.email || t('notAvailable'),
    },
    {
      id: 'profileSource',
      label: t('profileSource'),
      value: getProfileSourceLabel(t, displayedUserProfile?.source),
    },
    {
      id: 'settingsContractorId',
      label: t('settingsCurrentContractorId'),
      value: settingsContractorId || t('notAvailable'),
    },
    {
      id: 'contractorMembershipStatus',
      label: t('contractorMembershipStatus'),
      value: getMembershipStatusLabel(t, contractorAccess?.membershipStatus),
    },
    {
      id: 'onboardingRequired',
      label: t('onboardingRequired'),
      value: t(onboardingRequired ? 'yes' : 'no'),
    },
    {
      id: 'onboardingCompleted',
      label: t('onboardingCompleted'),
      value: t(onboardingCompleted ? 'yes' : 'no'),
    },
    {
      id: 'betaFallbackActive',
      label: t('betaContractorFallbackActive'),
      value: t(betaFallbackActive ? 'yes' : 'no'),
    },
    {
      id: 'settingsLoadStatus',
      label: t('settingsLoadStatus'),
      value: getSettingsLoadStatusLabel(t, settingsRuntimeStatus.loadStatus),
    },
    {
      id: 'lastSettingsError',
      label: t('lastSettingsError'),
      value: settingsRuntimeStatus.lastError?.message || t('notAvailable'),
    },
    {
      id: 'onboardingStatus',
      label: t('onboardingStatus'),
      value: getSettingsLoadStatusLabel(t, onboardingRuntimeStatus.status === 'submitting' ? 'saving' : onboardingRuntimeStatus.status),
    },
  ]
  const clientsBackendRows = [
    {
      id: 'useSupabaseClients',
      label: t('backendEnvironmentUseSupabaseClients'),
      value: t(USE_SUPABASE_CLIENTS ? 'enabled' : 'disabled'),
    },
    {
      id: 'clientsContractorId',
      label: t('clientsCurrentContractorId'),
      value: clientsContractorId || t('notAvailable'),
    },
  ]
  const leadsBackendRows = [
    {
      id: 'useSupabaseLeads',
      label: t('backendEnvironmentUseSupabaseLeads'),
      value: t(USE_SUPABASE_LEADS ? 'enabled' : 'disabled'),
    },
    {
      id: 'leadsContractorId',
      label: t('leadsCurrentContractorId'),
      value: leadsContractorId || t('notAvailable'),
    },
  ]
  const projectsBackendRows = [
    {
      id: 'useSupabaseProjects',
      label: t('backendEnvironmentUseSupabaseProjects'),
      value: t(USE_SUPABASE_PROJECTS ? 'enabled' : 'disabled'),
    },
    {
      id: 'projectsContractorId',
      label: t('projectsCurrentContractorId'),
      value: projectsContractorId || t('notAvailable'),
    },
  ]
  const estimatesBackendRows = [
    {
      id: 'useSupabaseEstimates',
      label: t('backendEnvironmentUseSupabaseEstimates'),
      value: t(USE_SUPABASE_ESTIMATES ? 'enabled' : 'disabled'),
    },
    {
      id: 'estimatesContractorId',
      label: t('estimatesCurrentContractorId'),
      value: projectsContractorId || t('notAvailable'),
    },
  ]
  const contractsBackendRows = [
    {
      id: 'useSupabaseContracts',
      label: t('backendEnvironmentUseSupabaseContracts'),
      value: t(USE_SUPABASE_CONTRACTS ? 'enabled' : 'disabled'),
    },
    {
      id: 'contractsContractorId',
      label: t('contractsCurrentContractorId'),
      value: projectsContractorId || t('notAvailable'),
    },
  ]
  const paymentsBackendRows = [
    {
      id: 'useSupabasePayments',
      label: t('backendEnvironmentUseSupabasePayments'),
      value: t(USE_SUPABASE_PAYMENTS ? 'enabled' : 'disabled'),
    },
    {
      id: 'paymentsContractorId',
      label: t('paymentsCurrentContractorId'),
      value: paymentsContractorId || t('notAvailable'),
    },
  ]
  const eventsBackendRows = [
    {
      id: 'useSupabaseEvents',
      label: t('backendEnvironmentUseSupabaseEvents'),
      value: t(USE_SUPABASE_EVENTS ? 'enabled' : 'disabled'),
    },
    {
      id: 'eventsContractorId',
      label: t('eventsCurrentContractorId'),
      value: eventsContractorId || t('notAvailable'),
    },
  ]

  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-gradient-to-br from-slate-950 to-slate-800 p-6 text-white shadow-xl">
        <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('developerOnly')}</p>
        <h1 className="mt-2 text-3xl font-bold">{t('developerHealthTitle')}</h1>
        <p className="mt-2 text-sm text-slate-300">{t('developerHealthSubtitle')}</p>
      </section>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={t('buttonsImplementedSummary')} value={`${snapshot.buttonAudit.implementedCount}/${snapshot.buttonAudit.total}`} helper={t('buttonsImplementedHelper')} />
        <SummaryCard label={t('technicalDebt')} value={snapshot.technicalDebtAudit.total} helper={t('technicalDebtHelper')} />
        <SummaryCard label={t('englishKeys')} value={snapshot.translationAudit.englishCount} helper={t('translationCoverageHelper')} />
        <SummaryCard label={t('auditedRoutes')} value={snapshot.routeAudit.routes.length} helper={t('routeCoverageHelper')} />
      </section>

      <SectionCard title={t('applicationHealth')}>
        <div className="grid gap-3 lg:grid-cols-2">
          {snapshot.applicationHealth.map((check) => (
            <HealthCheckCard key={check.id} check={check} t={t} />
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('backendEnvironment')}>
        <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
          {t(snapshot.backendEnvironment.helperKey)}
        </div>
        {snapshot.backendEnvironment.warningKey ? (
          <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t(snapshot.backendEnvironment.warningKey)}
          </p>
        ) : null}
        <div className="mt-4 space-y-3">
          {snapshot.backendEnvironment.items.map((item) => (
            <div key={item.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-bold text-slate-950">{t(item.labelKey)}</p>
                <p className="mt-1 text-sm text-slate-600">{t(item.detailKey)}</p>
              </div>
              <div className="flex items-center gap-3">
                <p className="text-sm font-semibold text-slate-700">{t(item.valueKey)}</p>
                <StatusBadge status={item.status} />
              </div>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('settingsBackend')}>
        {settingsBackendWarning ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t('settingsSupabaseAuthRequiredWarning')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.settingsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.settingsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={settingsBackendStatus} />
        </div>
        <div className="mt-4 space-y-3">
          {settingsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('clientsBackend')}>
        {USE_SUPABASE_CLIENTS ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t('clientsSupabaseBetaEnabled')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.clientsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.clientsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.clientsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {clientsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('leadsBackend')}>
        {USE_SUPABASE_LEADS ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t('leadsSupabaseBetaEnabled')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.leadsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.leadsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.leadsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {leadsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('projectsBackend')}>
        {USE_SUPABASE_PROJECTS ? (
          <p className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">
            {t('projectsSupabaseBetaEnabled')}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.projectsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.projectsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.projectsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {projectsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('estimatesBackend')}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.estimatesBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.estimatesBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.estimatesBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {estimatesBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('contractsBackend')}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.contractsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.contractsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.contractsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {contractsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('invoicesBackend')}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.invoicesBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.invoicesBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.invoicesBackend.status} />
        </div>
      </SectionCard>

      <SectionCard title={t('paymentsBackend')}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.paymentsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.paymentsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.paymentsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {paymentsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('eventsBackend')}>
        <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-bold text-slate-950">{t(snapshot.eventsBackend.valueKey)}</p>
            <p className="mt-1 text-sm text-slate-600">{t(snapshot.eventsBackend.detailKey)}</p>
          </div>
          <StatusBadge status={snapshot.eventsBackend.status} />
        </div>
        <div className="mt-4 space-y-3">
          {eventsBackendRows.map((row) => (
            <div key={row.id} className="flex flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="font-bold text-slate-950">{row.label}</p>
              <p className="text-sm font-semibold text-slate-600">{row.value}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t('contractorIsolationReadiness')}>
        <div className="grid gap-3">
          {snapshot.contractorIsolation.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <div>
                <p className="font-bold text-slate-950">{item.label}</p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.ready ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>
                {item.ready ? t('ready') : t('notReady')}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard title={t('buttonAudit')}>
          <div className="grid gap-4 sm:grid-cols-3">
            <SummaryCard label={t('buttonsImplemented')} value={snapshot.buttonAudit.implementedCount} />
            <SummaryCard label={t('buttonsPending')} value={snapshot.buttonAudit.pendingCount} />
            <SummaryCard label={t('buttonsMissing')} value={snapshot.buttonAudit.missingCount} />
          </div>
          <div className="mt-4 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            {t('buttonsImplementedCount', { implemented: snapshot.buttonAudit.implementedCount, total: snapshot.buttonAudit.total })}
          </div>
        </SectionCard>

        <SectionCard title={t('routeAudit')}>
          <div className="space-y-2">
            {snapshot.routeAudit.routes.map((route) => (
              <div key={route.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <div>
                  <p className="font-bold text-slate-950">{t(route.labelKey)}</p>
                  <code className="text-xs font-semibold text-slate-500">{route.path}</code>
                </div>
                <StatusBadge status={route.exists ? 'PASS' : 'FAIL'} />
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard title={t('translationAudit')}>
          <div className="grid gap-4 sm:grid-cols-2">
            <SummaryCard label={t('englishKeys')} value={snapshot.translationAudit.englishCount} />
            <SummaryCard label={t('spanishKeys')} value={snapshot.translationAudit.spanishCount} />
            <SummaryCard label={t('missingSpanish')} value={snapshot.translationAudit.missingSpanish.length} />
            <SummaryCard label={t('missingEnglish')} value={snapshot.translationAudit.missingEnglish.length} />
            <SummaryCard label={t('duplicateKeys')} value={snapshot.translationAudit.duplicateKeys.length} />
            <SummaryCard label={t('emptyValues')} value={snapshot.translationAudit.emptyValues.length} />
          </div>
        </SectionCard>

        <SectionCard title={t('futureBackendReadiness')}>
          <div className="space-y-2">
            {snapshot.featureFlagAudit.flags.map((flag) => (
              <div key={flag.key} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
                <code className="font-bold text-slate-950">{flag.key}</code>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${flag.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>
                  {flag.enabled ? t('enabled') : t('disabled')}
                </span>
              </div>
            ))}
          </div>
        </SectionCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <SectionCard title={t('authReadiness')}>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <SummaryCard label={t('authMode')} value={authMode === 'mock' ? t('mockAuth') : t('supabaseAuth')} />
            <SummaryCard label={t('authServiceStatus')} value={authServiceStatus.configured || authMode === 'mock' ? 'PASS' : 'WARNING'} />
            <SummaryCard label={t('currentMockUser')} value={user?.email || t('notAvailable')} />
            <SummaryCard label={t('currentMockCompany')} value={company?.name || t('notAvailable')} />
            <SummaryCard label={t('sessionExists')} value={t(authServiceStatus.hasSession ? 'yes' : 'no')} />
            <SummaryCard label={t('autoRefreshEnabled')} value={t(authServiceStatus.autoRefreshEnabled ? 'yes' : 'no')} />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('contractor')}</p>
              <p className="text-sm font-semibold text-slate-600">{contractor?.fullName || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('authServiceStatus')}</p>
              <p className="text-sm font-semibold text-slate-600">{authServiceStatus.mode === 'mock' ? t('authMockServiceReady') : authServiceStatus.configured ? t('authSupabaseReady') : t('authSupabaseNotConfigured')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('tokenExpiryTime')}</p>
              <p className="text-sm font-semibold text-slate-600">{authServiceStatus.sessionExpiresAtIso || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('persistSessionEnabled')}</p>
              <p className="text-sm font-semibold text-slate-600">{t(authServiceStatus.persistSessionEnabled ? 'yes' : 'no')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('detectSessionInUrlEnabled')}</p>
              <p className="text-sm font-semibold text-slate-600">{t(authServiceStatus.detectSessionInUrlEnabled ? 'yes' : 'no')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('lastAuthSessionError')}</p>
              <p className="text-sm font-semibold text-slate-600">{authServiceStatus.lastSessionError?.message || authServiceStatus.lastAuthError?.message || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('authEmail')}</p>
              <p className="text-sm font-semibold text-slate-600">{user?.email || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('displayedProfileName')}</p>
              <p className="text-sm font-semibold text-slate-600">{displayedUserProfile?.name || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('displayedProfileEmail')}</p>
              <p className="text-sm font-semibold text-slate-600">{displayedUserProfile?.email || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('profileSource')}</p>
              <p className="text-sm font-semibold text-slate-600">{getProfileSourceLabel(t, displayedUserProfile?.source)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('resolvedContractorId')}</p>
              <p className="text-sm font-semibold text-slate-600">{contractorAccess?.contractorId || t('notAvailable')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('contractorMembershipStatus')}</p>
              <p className="text-sm font-semibold text-slate-600">{getMembershipStatusLabel(t, contractorAccess?.membershipStatus)}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('onboardingRequired')}</p>
              <p className="text-sm font-semibold text-slate-600">{t(onboardingRequired ? 'yes' : 'no')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('onboardingCompleted')}</p>
              <p className="text-sm font-semibold text-slate-600">{t(onboardingCompleted ? 'yes' : 'no')}</p>
            </div>
            <div className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t('betaContractorFallbackActive')}</p>
              <p className="text-sm font-semibold text-slate-600">{t(betaFallbackActive ? 'yes' : 'no')}</p>
            </div>
          </div>
        </SectionCard>
      </section>

      <SectionCard title={t('privateBetaBackendChecklist')}>
        <div className="space-y-2">
          {snapshot.privateBetaChecklist.map((item) => (
            <div key={item.id} className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 px-4 py-3">
              <p className="font-bold text-slate-950">{t(item.labelKey)}</p>
              <span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'Complete' ? 'bg-emerald-100 text-emerald-800' : item.status === 'Pending' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}>
                {t(`checkStatus.${item.status === 'Complete' ? 'complete' : item.status === 'Pending' ? 'pending' : 'notStarted'}`)}
              </span>
            </div>
          ))}
        </div>
      </SectionCard>

      <section className="grid gap-4 xl:grid-cols-2">
        <AuditList
          title={t('buttonsPending')}
          items={snapshot.buttonAudit.pending}
          emptyLabel={t('noPendingButtons')}
          renderItem={(button) => (
            <div key={button.id} className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="font-bold text-amber-900">{t(button.labelKey)}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-amber-700">{button.area}</p>
            </div>
          )}
        />
        <AuditList
          title={t('buttonsMissing')}
          items={snapshot.buttonAudit.missing}
          emptyLabel={t('noMissingButtons')}
          renderItem={(button) => (
            <div key={button.id} className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
              <p className="font-bold text-rose-900">{t(button.labelKey)}</p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-wide text-rose-700">{button.area}</p>
            </div>
          )}
        />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AuditList
          title={t('missingSpanishKeys')}
          items={snapshot.translationAudit.missingSpanish}
          emptyLabel={t('noIssuesFound')}
          renderItem={(item) => <code key={item} className="block rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{item}</code>}
        />
        <AuditList
          title={t('missingEnglishKeys')}
          items={snapshot.translationAudit.missingEnglish}
          emptyLabel={t('noIssuesFound')}
          renderItem={(item) => <code key={item} className="block rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{item}</code>}
        />
      </section>

      <SectionCard title={t('modalAudit')}>
        <div className="space-y-2">
          {snapshot.modalAudit.modals.map((modal) => (
            <div key={modal.id} className="grid gap-3 rounded-2xl border border-slate-200 px-4 py-4 lg:grid-cols-[minmax(0,1fr),auto,auto,auto] lg:items-center">
              <div>
                <p className="font-bold text-slate-950">{t(modal.labelKey)}</p>
                <p className="text-xs font-semibold text-slate-500">{modal.componentName}</p>
              </div>
              <StatusBadge status={modal.registered ? 'PASS' : 'FAIL'} />
              <StatusBadge status={modal.reusable ? 'PASS' : 'WARNING'} />
              <StatusBadge status={modal.mobileReady ? 'PASS' : 'FAIL'} />
            </div>
          ))}
        </div>
        <div className="mt-4 grid gap-2 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid-cols-3">
          <span>{t('registered')}</span>
          <span>{t('reusable')}</span>
          <span>{t('mobileReady')}</span>
        </div>
      </SectionCard>

      <SectionCard title={t('technicalDebt')}>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <SummaryCard label={t('missingImplementation')} value={snapshot.technicalDebtAudit.counts.missingImplementation} />
          <SummaryCard label={t('todoItems')} value={snapshot.technicalDebtAudit.counts.todoItems} />
          <SummaryCard label={t('comingSoonPages')} value={snapshot.technicalDebtAudit.counts.comingSoonPages} />
          <SummaryCard label={t('deadButtons')} value={snapshot.technicalDebtAudit.counts.deadButtons} />
        </div>
        {snapshot.technicalDebtAudit.items.length ? (
          <div className="mt-5 grid min-w-0 gap-3 lg:grid-cols-2">
            {snapshot.technicalDebtAudit.items.map((item) => (
              <article key={item.id} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="flex min-w-0 items-start justify-between gap-3">
                  <h3 className="min-w-0 break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{item.titleKey ? t(item.titleKey) : item.title}</h3>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.severity === 'high' ? 'bg-rose-100 text-rose-800' : item.severity === 'low' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>
                    {t(`severity.${item.severity}`)}
                  </span>
                </div>
                <p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{item.descriptionKey ? t(item.descriptionKey) : item.description}</p>
                <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
                  <div className="min-w-0">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('affectedArea')}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{item.affectedAreaKey ? t(item.affectedAreaKey) : item.affectedArea}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('suggestedNextAction')}</dt>
                    <dd className="mt-1 break-words text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{item.nextActionKey ? t(item.nextActionKey) : item.nextAction}</dd>
                  </div>
                </dl>
                {item.classification || item.whyItMattersKey || item.priority || item.dependencyKeys?.length || item.futureSprintAreaKey ? (
                  <div className="mt-4 grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
                    {item.classification ? (
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('technicalDebtClassification')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{t(`technicalDebtClassification.${item.classification}`)}</p>
                      </div>
                    ) : null}
                    {item.priority ? (
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('suggestedPriority')}</p>
                        <p className="mt-1 text-sm font-semibold text-slate-700">{t(`severity.${item.priority}`)}</p>
                      </div>
                    ) : null}
                    {item.whyItMattersKey ? (
                      <div className="min-w-0 sm:col-span-2">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('whyItMatters')}</p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{t(item.whyItMattersKey)}</p>
                      </div>
                    ) : null}
                    {item.dependencyKeys?.length ? (
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('dependencies')}</p>
                        <ul className="mt-1 space-y-1 text-sm font-semibold text-slate-700">
                          {item.dependencyKeys.map((dependencyKey) => <li key={dependencyKey} className="break-words [overflow-wrap:anywhere]">{t(dependencyKey)}</li>)}
                        </ul>
                      </div>
                    ) : null}
                    {item.futureSprintAreaKey ? (
                      <div className="min-w-0">
                        <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('recommendedFutureSprint')}</p>
                        <p className="mt-1 break-words text-sm font-semibold text-slate-700 [overflow-wrap:anywhere]">{t(item.futureSprintAreaKey)}</p>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                {item.sourceHint ? <p className="mt-4 break-words font-mono text-xs font-semibold text-slate-500 [overflow-wrap:anywhere]">{t('sourceHint')}: {item.sourceHint}</p> : null}
              </article>
            ))}
          </div>
        ) : (
          <p className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{t('noTechnicalDebtItems')}</p>
        )}
      </SectionCard>
    </div>
  )
}
