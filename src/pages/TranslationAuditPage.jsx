import { useState } from 'react'
import { buildDeveloperHealthSnapshot } from '../utils/developerHealth'
import { USE_SUPABASE_CLIENTS, USE_SUPABASE_CONTRACTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_EVENTS, USE_SUPABASE_LEADS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS, USE_SUPABASE_SETTINGS } from '../config/backendConfig'
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

const STATUS_STYLES = {
  PASS: 'bg-emerald-100 text-emerald-800',
  WARNING: 'bg-amber-100 text-amber-800',
  FAIL: 'bg-rose-100 text-rose-800',
}

function StatusBadge({ status }) {
  return <span className={`inline-flex shrink-0 rounded-full px-3 py-1 text-xs font-bold ${STATUS_STYLES[status] || STATUS_STYLES.WARNING}`}>{status}</span>
}

function translateDiagnosticValue(t, value) {
  if (value === null || value === undefined || value === '') return ''
  if (typeof value === 'object' && !Array.isArray(value) && value.key) return t(value.key, value.params || {})
  return String(value)
}

function DiagnosticValue({ value, t }) {
  if (!Array.isArray(value)) return <span className="[overflow-wrap:anywhere]">{translateDiagnosticValue(t, value)}</span>
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

function DiagnosticField({ label, value, t }) {
  if (value === null || value === undefined || value === '') return null
  return (
    <div className="min-w-0">
      <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{label}</p>
      <div className="mt-1 min-w-0 text-sm font-semibold text-slate-700"><DiagnosticValue value={value} t={t} /></div>
    </div>
  )
}

function HealthCheckCard({ check, t }) {
  const isHealthy = check.status === 'PASS'
  return (
    <article className={`min-w-0 rounded-2xl border p-4 ${isHealthy ? 'border-slate-200 bg-slate-50' : check.status === 'FAIL' ? 'border-rose-200 bg-rose-50/60' : 'border-amber-200 bg-amber-50/60'}`}>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-words font-bold text-slate-950">{t(check.labelKey)}</p>
          {check.summary ? <p className="mt-2 break-words text-sm leading-6 text-slate-600 [overflow-wrap:anywhere]">{translateDiagnosticValue(t, check.summary)}</p> : null}
        </div>
        <StatusBadge status={check.status} />
      </div>
      {!isHealthy ? (
        <details className="group mt-3 min-w-0 rounded-xl border border-slate-200 bg-white/80">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">
            <span className="inline-flex items-center gap-2">{t('viewDiagnosticDetails')}<span aria-hidden="true" className="text-xs text-slate-400 transition group-open:rotate-180">▼</span></span>
          </summary>
          <div className="min-w-0 space-y-4 border-t border-slate-200 p-3">
            {check.diagnosticIncomplete ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-bold text-rose-800">{t('diagnosticImplementationIncomplete')}</p> : null}
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <DiagnosticField label={t('expected')} value={check.expected} t={t} />
              <DiagnosticField label={t('actual')} value={check.actual} t={t} />
            </div>
            {check.details?.length ? <DiagnosticField label={t('diagnosticDetails')} value={check.details} t={t} /> : null}
            {check.affectedItems?.length ? (
              <div className="min-w-0 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('affectedItems')}</p>
                {check.affectedItems.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <p className="break-words text-sm font-bold text-slate-950">{item.labelKey ? t(item.labelKey) : item.label || item.id}</p>
                    {item.issueKey ? <p className="mt-1 text-sm text-slate-600">{t(item.issueKey)}</p> : null}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <DiagnosticField label={t('expected')} value={item.expected} t={t} />
                      <DiagnosticField label={t('actual')} value={item.actual} t={t} />
                    </div>
                    {item.values?.length ? <div className="mt-3"><DiagnosticField label={t('diagnosticFindings')} value={item.values} t={t} /></div> : null}
                    {item.sourceHint ? <p className="mt-3 break-words font-mono text-xs font-semibold text-slate-500">{t('sourceHint')}: {item.sourceHint}</p> : null}
                  </div>
                ))}
              </div>
            ) : null}
            {check.sourceHint ? <p className="break-words font-mono text-xs font-semibold text-slate-500">{t('sourceHint')}: {check.sourceHint}</p> : null}
          </div>
        </details>
      ) : null}
    </article>
  )
}

function SummaryCard({ label, value, helper, status }) {
  return (
    <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-slate-500">{label}</p>
        {status ? <StatusBadge status={status} /> : null}
      </div>
      <p className="mt-2 break-words text-3xl font-bold text-slate-950 [overflow-wrap:anywhere]">{value}</p>
      {helper ? <p className="mt-2 text-xs font-semibold text-slate-500">{helper}</p> : null}
    </div>
  )
}

function SectionCard({ title, children, action }) {
  return (
    <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-center justify-between gap-3"><h2 className="text-lg font-bold text-slate-950">{title}</h2>{action}</div>
      {children}
    </section>
  )
}

function AccordionCard({ id, title, subtitle, status, expanded, onToggle, children }) {
  return (
    <section className={`min-w-0 overflow-hidden rounded-2xl border bg-white ${status === 'FAIL' ? 'border-rose-300' : status === 'WARNING' ? 'border-amber-300' : 'border-slate-200'}`}>
      <button type="button" aria-expanded={expanded} aria-controls={`${id}-content`} onClick={onToggle} className="flex w-full min-w-0 items-center justify-between gap-3 px-4 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
        <span className="min-w-0"><span className="block break-words font-bold text-slate-950">{title}</span>{subtitle ? <span className="mt-1 block break-words text-xs font-semibold text-slate-500">{subtitle}</span> : null}</span>
        <span className="flex shrink-0 items-center gap-2">{status ? <StatusBadge status={status} /> : null}<span aria-hidden="true" className={`text-xs text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span></span>
      </button>
      {expanded ? <div id={`${id}-content`} className="min-w-0 border-t border-slate-200 p-4">{children}</div> : null}
    </section>
  )
}

function KeyValueRows({ rows }) {
  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.id} className="flex min-w-0 flex-col gap-1 rounded-xl bg-slate-50 px-3 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <p className="break-words font-bold text-slate-950">{row.label}</p>
          <p className="break-words text-sm font-semibold text-slate-600 [overflow-wrap:anywhere]">{row.value}</p>
        </div>
      ))}
    </div>
  )
}

function IssueList({ items, emptyLabel }) {
  if (!items.length) return <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-700">{emptyLabel}</p>
  return <div className="max-h-80 space-y-2 overflow-auto">{items.map((item) => <code key={item} className="block break-words rounded-xl bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 [overflow-wrap:anywhere]">{item}</code>)}</div>
}

function DebtCard({ item, t }) {
  return (
    <article className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <h3 className="min-w-0 break-words font-bold text-slate-950">{item.titleKey ? t(item.titleKey) : item.title}</h3>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${item.severity === 'high' ? 'bg-rose-100 text-rose-800' : item.severity === 'low' ? 'bg-slate-200 text-slate-700' : 'bg-amber-100 text-amber-800'}`}>{t(`severity.${item.severity}`)}</span>
      </div>
      <p className="mt-2 break-words text-sm leading-6 text-slate-600">{item.descriptionKey ? t(item.descriptionKey) : item.description}</p>
      <dl className="mt-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <div><dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('affectedArea')}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{item.affectedAreaKey ? t(item.affectedAreaKey) : item.affectedArea}</dd></div>
        <div><dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('suggestedNextAction')}</dt><dd className="mt-1 break-words text-sm font-semibold text-slate-700">{item.nextActionKey ? t(item.nextActionKey) : item.nextAction}</dd></div>
      </dl>
      <div className="mt-4 grid min-w-0 gap-3 rounded-xl border border-slate-200 bg-white p-3 sm:grid-cols-2">
        {item.classification ? <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('technicalDebtClassification')}</p><p className="mt-1 text-sm font-semibold text-slate-700">{t(`technicalDebtClassification.${item.classification}`)}</p></div> : null}
        {item.priority ? <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('suggestedPriority')}</p><p className="mt-1 text-sm font-semibold text-slate-700">{t(`severity.${item.priority}`)}</p></div> : null}
        {item.whyItMattersKey ? <div className="sm:col-span-2"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('whyItMatters')}</p><p className="mt-1 text-sm font-semibold text-slate-700">{t(item.whyItMattersKey)}</p></div> : null}
        {item.dependencyKeys?.length ? <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('dependencies')}</p><ul className="mt-1 space-y-1 text-sm font-semibold text-slate-700">{item.dependencyKeys.map((key) => <li key={key}>{t(key)}</li>)}</ul></div> : null}
        {item.futureSprintAreaKey ? <div><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">{t('recommendedFutureSprint')}</p><p className="mt-1 text-sm font-semibold text-slate-700">{t(item.futureSprintAreaKey)}</p></div> : null}
      </div>
      {item.sourceHint ? <p className="mt-4 break-words font-mono text-xs font-semibold text-slate-500">{t('sourceHint')}: {item.sourceHint}</p> : null}
    </article>
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

function combineStatus(statuses) {
  if (statuses.includes('FAIL')) return 'FAIL'
  if (statuses.includes('WARNING')) return 'WARNING'
  return 'PASS'
}

function getChecklistStatusKey(status) {
  if (status === 'Complete') return 'complete'
  if (status === 'Failed') return 'failed'
  if (status === 'Pending') return 'pending'
  return 'notStarted'
}

function getChecklistAuditStatus(status) {
  if (status === 'Complete') return 'PASS'
  if (status === 'Failed') return 'FAIL'
  return 'WARNING'
}

function searchableText(t, ...values) {
  return values.flat(Infinity).map((value) => {
    if (value?.key) return translateDiagnosticValue(t, value)
    if (typeof value === 'object' && value !== null) return Object.values(value).join(' ')
    return value || ''
  }).join(' ').toLowerCase()
}

function makeSectionId(prefix, value) {
  return `${prefix}-${String(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`
}

export function TranslationAuditPage({ t }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedSections, setExpandedSections] = useState({})
  const snapshot = buildDeveloperHealthSnapshot()
  const { authMode, authServiceStatus, contractor, company, contractorAccess, onboardingCompleted, onboardingRequired, user, session } = useAuth()
  const displayedUserProfile = buildDisplayedUserProfile({
    contractor,
    contractorAccess,
    mockProfile: { name: 'Josue Arana', email: 'josue@aymero.example', phone: '(410) 555-0188', preferredLanguage: 'en', timezone: 'America/New_York' },
    session,
    user,
  }).profile
  const settingsContractorId = getSettingsContractorId({ contractor, company, session })
  const settingsRuntimeStatus = getSettingsRuntimeStatus()
  const onboardingRuntimeStatus = getContractorOnboardingRuntimeStatus()
  const betaFallbackActive = isBetaContractorFallbackActive({ contractor, company, session })
  const hasSettingsSupabaseUser = hasAuthenticatedSupabaseSettingsUser({ authMode, membershipStatus: contractorAccess?.membershipStatus, user, session })
  const settingsBackendWarning = USE_SUPABASE_SETTINGS && !hasSettingsSupabaseUser
  const settingsBackendStatus = settingsBackendWarning ? 'WARNING' : snapshot.settingsBackend.status

  const tabs = [
    ['overview', 'healthTab.overview'], ['backend', 'healthTab.backend'], ['authentication', 'healthTab.authentication'], ['routes', 'healthTab.routes'], ['buttons', 'healthTab.buttons'],
    ['translations', 'healthTab.translations'], ['modals', 'healthTab.modals'], ['featureFlags', 'healthTab.featureFlags'], ['release', 'healthTab.release'], ['technicalDebt', 'healthTab.technicalDebt'],
  ]

  const backendSections = [
    { id: 'settings-backend', title: t('settingsBackend'), status: settingsBackendStatus, snapshot: snapshot.settingsBackend, warning: settingsBackendWarning ? t('settingsSupabaseAuthRequiredWarning') : '', rows: [
      { id: 'settingsReadiness', label: t('settingsSupabaseReadiness'), value: t(settingsBackendWarning ? 'notReady' : 'ready') },
      { id: 'useSupabaseSettings', label: t('backendEnvironmentUseSupabaseSettings'), value: t(USE_SUPABASE_SETTINGS ? 'enabled' : 'disabled') },
      { id: 'settingsContractorId', label: t('settingsCurrentContractorId'), value: settingsContractorId || t('notAvailable') },
      { id: 'settingsLoadStatus', label: t('settingsLoadStatus'), value: getSettingsLoadStatusLabel(t, settingsRuntimeStatus.loadStatus) },
      { id: 'lastSettingsError', label: t('lastSettingsError'), value: settingsRuntimeStatus.lastError?.message || t('notAvailable') },
    ] },
    { id: 'clients-backend', title: t('clientsBackend'), status: snapshot.clientsBackend.status, snapshot: snapshot.clientsBackend, warning: USE_SUPABASE_CLIENTS ? t('clientsSupabaseBetaEnabled') : '', rows: [
      { id: 'useSupabaseClients', label: t('backendEnvironmentUseSupabaseClients'), value: t(USE_SUPABASE_CLIENTS ? 'enabled' : 'disabled') },
      { id: 'clientsContractorId', label: t('clientsCurrentContractorId'), value: getClientsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'leads-backend', title: t('leadsBackend'), status: snapshot.leadsBackend.status, snapshot: snapshot.leadsBackend, warning: USE_SUPABASE_LEADS ? t('leadsSupabaseBetaEnabled') : '', rows: [
      { id: 'useSupabaseLeads', label: t('backendEnvironmentUseSupabaseLeads'), value: t(USE_SUPABASE_LEADS ? 'enabled' : 'disabled') },
      { id: 'leadsContractorId', label: t('leadsCurrentContractorId'), value: getLeadsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'projects-backend', title: t('projectsBackend'), status: snapshot.projectsBackend.status, snapshot: snapshot.projectsBackend, warning: USE_SUPABASE_PROJECTS ? t('projectsSupabaseBetaEnabled') : '', rows: [
      { id: 'useSupabaseProjects', label: t('backendEnvironmentUseSupabaseProjects'), value: t(USE_SUPABASE_PROJECTS ? 'enabled' : 'disabled') },
      { id: 'projectsContractorId', label: t('projectsCurrentContractorId'), value: getProjectsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'estimates-backend', title: t('estimatesBackend'), status: snapshot.estimatesBackend.status, snapshot: snapshot.estimatesBackend, rows: [
      { id: 'useSupabaseEstimates', label: t('backendEnvironmentUseSupabaseEstimates'), value: t(USE_SUPABASE_ESTIMATES ? 'enabled' : 'disabled') },
      { id: 'estimatesContractorId', label: t('estimatesCurrentContractorId'), value: getProjectsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'contracts-backend', title: t('contractsBackend'), status: snapshot.contractsBackend.status, snapshot: snapshot.contractsBackend, rows: [
      { id: 'useSupabaseContracts', label: t('backendEnvironmentUseSupabaseContracts'), value: t(USE_SUPABASE_CONTRACTS ? 'enabled' : 'disabled') },
      { id: 'contractsContractorId', label: t('contractsCurrentContractorId'), value: getProjectsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'invoices-backend', title: t('invoicesBackend'), status: snapshot.invoicesBackend.status, snapshot: snapshot.invoicesBackend, rows: [] },
    { id: 'payments-backend', title: t('paymentsBackend'), status: snapshot.paymentsBackend.status, snapshot: snapshot.paymentsBackend, rows: [
      { id: 'useSupabasePayments', label: t('backendEnvironmentUseSupabasePayments'), value: t(USE_SUPABASE_PAYMENTS ? 'enabled' : 'disabled') },
      { id: 'paymentsContractorId', label: t('paymentsCurrentContractorId'), value: getPaymentsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
    { id: 'events-backend', title: t('eventsBackend'), status: snapshot.eventsBackend.status, snapshot: snapshot.eventsBackend, rows: [
      { id: 'useSupabaseEvents', label: t('backendEnvironmentUseSupabaseEvents'), value: t(USE_SUPABASE_EVENTS ? 'enabled' : 'disabled') },
      { id: 'eventsContractorId', label: t('eventsCurrentContractorId'), value: getEventsContractorId({ contractor, company, session }) || t('notAvailable') },
    ] },
  ]

  const authStatus = authServiceStatus.configured || authMode === 'mock' ? 'PASS' : 'WARNING'
  const authenticationRows = [
    { id: 'contractor', label: t('contractor'), value: contractor?.fullName || t('notAvailable') },
    { id: 'currentUserId', label: t('currentUserId'), value: user?.id || t('notAvailable') },
    { id: 'authEmail', label: t('authEmail'), value: user?.email || t('notAvailable') },
    { id: 'authServiceStatus', label: t('authServiceStatus'), value: authServiceStatus.mode === 'mock' ? t('authMockServiceReady') : authServiceStatus.configured ? t('authSupabaseReady') : t('authSupabaseNotConfigured') },
    { id: 'resolvedContractorId', label: t('resolvedContractorId'), value: contractorAccess?.contractorId || t('notAvailable') },
    { id: 'contractorMembershipStatus', label: t('contractorMembershipStatus'), value: getMembershipStatusLabel(t, contractorAccess?.membershipStatus) },
    { id: 'sessionExists', label: t('sessionExists'), value: t(authServiceStatus.hasSession ? 'yes' : 'no') },
    { id: 'tokenExpiryTime', label: t('tokenExpiryTime'), value: authServiceStatus.sessionExpiresAtIso || t('notAvailable') },
    { id: 'autoRefreshEnabled', label: t('autoRefreshEnabled'), value: t(authServiceStatus.autoRefreshEnabled ? 'yes' : 'no') },
    { id: 'persistSessionEnabled', label: t('persistSessionEnabled'), value: t(authServiceStatus.persistSessionEnabled ? 'yes' : 'no') },
    { id: 'detectSessionInUrlEnabled', label: t('detectSessionInUrlEnabled'), value: t(authServiceStatus.detectSessionInUrlEnabled ? 'yes' : 'no') },
    { id: 'profileSource', label: t('profileSource'), value: getProfileSourceLabel(t, displayedUserProfile?.source) },
    { id: 'displayedProfileName', label: t('displayedProfileName'), value: displayedUserProfile?.name || t('notAvailable') },
    { id: 'displayedProfileEmail', label: t('displayedProfileEmail'), value: displayedUserProfile?.email || t('notAvailable') },
    { id: 'onboardingRequired', label: t('onboardingRequired'), value: t(onboardingRequired ? 'yes' : 'no') },
    { id: 'onboardingCompleted', label: t('onboardingCompleted'), value: t(onboardingCompleted ? 'yes' : 'no') },
    { id: 'onboardingStatus', label: t('onboardingStatus'), value: getSettingsLoadStatusLabel(t, onboardingRuntimeStatus.status === 'submitting' ? 'saving' : onboardingRuntimeStatus.status) },
    { id: 'lastAuthSessionError', label: t('lastAuthSessionError'), value: authServiceStatus.lastSessionError?.message || authServiceStatus.lastAuthError?.message || t('notAvailable') },
    { id: 'betaFallbackActive', label: t('betaContractorFallbackActive'), value: t(betaFallbackActive ? 'yes' : 'no') },
  ]

  const buttonGroups = Object.entries(snapshot.buttonAudit.items.reduce((groups, button) => {
    const area = button.area || t('healthUncategorized')
    groups[area] = [...(groups[area] || []), button]
    return groups
  }, {})).sort(([a], [b]) => a.localeCompare(b))
  const translationIssueGroups = [
    ['missingSpanishKeys', snapshot.translationAudit.missingSpanish], ['missingEnglishKeys', snapshot.translationAudit.missingEnglish],
    ['duplicateKeys', snapshot.translationAudit.duplicateKeys], ['emptyValues', snapshot.translationAudit.emptyValues], ['untranslatedSpanishKeys', snapshot.translationAudit.untranslatedSpanish],
  ]
  const technicalDebtItems = snapshot.technicalDebtAudit.items.filter((item) => item.classification !== 'backlog')
  const backlogItems = snapshot.technicalDebtAudit.items.filter((item) => item.classification === 'backlog')
  const failCount = snapshot.applicationHealth.filter((check) => check.status === 'FAIL').length
  const warningCount = snapshot.applicationHealth.filter((check) => check.status === 'WARNING').length
  const applicationStatus = combineStatus(snapshot.applicationHealth.map((check) => check.status))
  const releasePending = snapshot.privateBetaChecklist.filter((item) => item.status !== 'Complete')
  const releaseStatus = releasePending.some((item) => item.status === 'Failed') ? 'FAIL' : releasePending.length ? 'WARNING' : applicationStatus
  const productionDomain = snapshot.privateBetaChecklist.find((item) => item.id === 'productionDomainReady')
  const releaseCapabilityFlags = snapshot.featureFlagAudit.flags.filter((flag) => ['USE_STORAGE', 'USE_REAL_EMAIL', 'USE_REAL_SMS'].includes(flag.key))

  const toggleSection = (id) => setExpandedSections((current) => ({ ...current, [id]: !current[id] }))
  const searchEntries = [
    ...snapshot.applicationHealth.map((check) => ({ id: `health-${check.id}`, tab: 'overview', title: t(check.labelKey), detail: translateDiagnosticValue(t, check.summary), text: searchableText(t, check, check.summary, check.details, check.affectedItems, check.sourceHint) })),
    ...backendSections.map((section) => ({ id: section.id, tab: 'backend', accordionId: section.id, title: section.title, detail: t(section.snapshot.detailKey), text: searchableText(t, section.title, section.snapshot, section.rows, section.warning) })),
    ...authenticationRows.map((row) => ({ id: `auth-${row.id}`, tab: 'authentication', title: row.label, detail: row.value, text: searchableText(t, row) })),
    ...snapshot.routeAudit.routes.map((route) => ({ id: `route-${route.id}`, tab: 'routes', title: t(route.labelKey), detail: route.path, text: searchableText(t, route, t(route.labelKey)) })),
    ...snapshot.buttonAudit.items.map((button) => ({ id: `button-${button.id}`, tab: 'buttons', accordionId: makeSectionId('buttons', button.area || t('healthUncategorized')), title: t(button.labelKey), detail: button.area, text: searchableText(t, button, t(button.labelKey)) })),
    ...translationIssueGroups.flatMap(([labelKey, items]) => items.map((key) => ({ id: `translation-${labelKey}-${key}`, tab: 'translations', accordionId: `translations-${labelKey}`, title: key, detail: t(labelKey), text: searchableText(t, key, labelKey, t(labelKey)) }))),
    ...snapshot.modalAudit.modals.map((modal) => ({ id: `modal-${modal.id}`, tab: 'modals', accordionId: `modal-${modal.id}`, title: t(modal.labelKey), detail: modal.componentName, text: searchableText(t, modal, t(modal.labelKey)) })),
    ...snapshot.featureFlagAudit.flags.map((flag) => ({ id: `flag-${flag.key}`, tab: 'featureFlags', title: flag.key, detail: t(flag.enabled ? 'enabled' : 'disabled'), text: searchableText(t, flag) })),
    ...snapshot.privateBetaChecklist.map((item) => ({ id: `release-${item.id}`, tab: 'release', title: t(item.labelKey), detail: t(`checkStatus.${getChecklistStatusKey(item.status)}`), text: searchableText(t, item, t(item.labelKey)) })),
    ...snapshot.technicalDebtAudit.items.map((item) => ({ id: `debt-${item.id}`, tab: 'technicalDebt', title: item.titleKey ? t(item.titleKey) : item.title, detail: item.descriptionKey ? t(item.descriptionKey) : item.description, text: searchableText(t, item, item.titleKey ? t(item.titleKey) : item.title, item.descriptionKey ? t(item.descriptionKey) : item.description) })),
  ]
  const normalizedQuery = searchQuery.trim().toLowerCase()
  const searchResults = normalizedQuery ? searchEntries.filter((entry) => `${entry.title} ${entry.detail} ${entry.text}`.toLowerCase().includes(normalizedQuery)) : []
  const selectSearchResult = (entry) => {
    setActiveTab(entry.tab)
    if (entry.accordionId) setExpandedSections((current) => ({ ...current, [entry.accordionId]: true }))
    setSearchQuery('')
  }

  return (
    <div className="min-w-0 space-y-6">
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

      <div className="min-w-0 space-y-4">
        <label className="block min-w-0">
          <span className="mb-2 block text-sm font-bold text-slate-700">{t('healthSearchLabel')}</span>
          <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('healthSearchPlaceholder')} className="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-200" />
        </label>
        <nav aria-label={t('healthWorkspaceNavigation')} className="min-w-0 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5 shadow-sm [scrollbar-width:thin]">
          <div role="tablist" className="flex min-w-max gap-1">
            {tabs.map(([id, labelKey]) => <button key={id} type="button" role="tab" aria-selected={activeTab === id} onClick={() => { setActiveTab(id); setSearchQuery('') }} className={`rounded-xl px-4 py-2.5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${activeTab === id ? 'bg-slate-950 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'}`}>{t(labelKey)}</button>)}
          </div>
        </nav>
      </div>

      {normalizedQuery ? (
        <SectionCard title={t('healthSearchResults')} action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{searchResults.length}</span>}>
          {searchResults.length ? <div className="space-y-2">{searchResults.map((entry) => <button key={entry.id} type="button" onClick={() => selectSearchResult(entry)} className="flex w-full min-w-0 flex-col gap-2 rounded-2xl border border-slate-200 px-4 py-3 text-left transition hover:border-blue-300 hover:bg-blue-50/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 sm:flex-row sm:items-center sm:justify-between"><span className="min-w-0"><span className="block break-words font-bold text-slate-950">{entry.title}</span><span className="mt-1 block break-words text-sm text-slate-600">{entry.detail}</span></span><span className="shrink-0 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{t(tabs.find(([id]) => id === entry.tab)?.[1])}</span></button>)}</div> : <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-600">{t('healthSearchNoResults')}</p>}
        </SectionCard>
      ) : null}

      {!normalizedQuery && activeTab === 'overview' ? <div className="space-y-6" role="tabpanel">
        {failCount ? <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-bold text-rose-800">{t('healthFailuresPresent', { count: failCount })}</div> : null}
        <SectionCard title={t('applicationHealth')}><div className="grid gap-3 lg:grid-cols-2">{snapshot.applicationHealth.map((check) => <HealthCheckCard key={check.id} check={check} t={t} />)}</div></SectionCard>
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <SummaryCard label={t('backendReadiness')} value={snapshot.backendEnvironment.status} status={snapshot.backendEnvironment.status} />
          <SummaryCard label={t('authenticationReadiness')} value={authStatus} status={authStatus} />
          <SummaryCard label={t('releaseReadiness')} value={releaseStatus} status={releaseStatus} helper={t('healthReleasePendingCount', { count: releasePending.length })} />
          <SummaryCard label={t('technicalDebtItems')} value={technicalDebtItems.length} />
          <SummaryCard label={t('backlogItems')} value={backlogItems.length} />
        </section>
        {warningCount ? <p className="text-sm font-semibold text-amber-700">{t('healthWarningsPresent', { count: warningCount })}</p> : null}
      </div> : null}

      {!normalizedQuery && activeTab === 'backend' ? <div className="space-y-4" role="tabpanel">
        <SectionCard title={t('backendEnvironment')} action={<StatusBadge status={snapshot.backendEnvironment.status} />}>
          <p className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">{t(snapshot.backendEnvironment.helperKey)}</p>
          {snapshot.backendEnvironment.warningKey ? <p className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-semibold text-amber-800">{t(snapshot.backendEnvironment.warningKey)}</p> : null}
          <div className="mt-4 space-y-2">{snapshot.backendEnvironment.items.map((item) => <div key={item.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-slate-200 px-3 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><p className="font-bold text-slate-950">{t(item.labelKey)}</p><p className="mt-1 text-sm text-slate-600">{t(item.detailKey)}</p></div><div className="flex items-center gap-3"><p className="text-sm font-semibold text-slate-700">{t(item.valueKey)}</p><StatusBadge status={item.status} /></div></div>)}</div>
        </SectionCard>
        {backendSections.map((section) => <AccordionCard key={section.id} id={section.id} title={section.title} status={section.status} expanded={Boolean(expandedSections[section.id])} onToggle={() => toggleSection(section.id)}>
          {section.warning ? <p className="mb-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm font-semibold text-amber-800">{section.warning}</p> : null}
          <div className="mb-4 rounded-xl border border-slate-200 p-3"><p className="font-bold text-slate-950">{t(section.snapshot.valueKey)}</p><p className="mt-1 text-sm text-slate-600">{t(section.snapshot.detailKey)}</p></div>
          <KeyValueRows rows={section.rows} />
        </AccordionCard>)}
        <AccordionCard id="contractor-isolation" title={t('contractorIsolationReadiness')} status={snapshot.contractorIsolation.every((item) => item.ready) ? 'PASS' : 'WARNING'} expanded={Boolean(expandedSections['contractor-isolation'])} onToggle={() => toggleSection('contractor-isolation')}>
          <div className="space-y-2">{snapshot.contractorIsolation.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"><p className="font-bold text-slate-950">{item.label}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.ready ? STATUS_STYLES.PASS : STATUS_STYLES.WARNING}`}>{item.ready ? t('ready') : t('notReady')}</span></div>)}</div>
        </AccordionCard>
      </div> : null}

      {!normalizedQuery && activeTab === 'authentication' ? <SectionCard title={t('authReadiness')} action={<StatusBadge status={authStatus} />}><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><SummaryCard label={t('authMode')} value={authMode === 'mock' ? t('mockAuth') : t('supabaseAuth')} /><SummaryCard label={t('authServiceStatus')} value={authStatus} /><SummaryCard label={t('currentMockCompany')} value={company?.name || t('notAvailable')} /></div><div className="mt-4"><KeyValueRows rows={authenticationRows} /></div></SectionCard> : null}

      {!normalizedQuery && activeTab === 'routes' ? <SectionCard title={t('routeAudit')} action={<StatusBadge status={snapshot.routeAudit.status} />}><div className="space-y-2">{snapshot.routeAudit.routes.map((route) => <div key={route.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3"><div className="min-w-0"><p className="font-bold text-slate-950">{t(route.labelKey)}</p><code className="break-all text-xs font-semibold text-slate-500">{route.path}</code></div><StatusBadge status={route.exists ? 'PASS' : 'FAIL'} /></div>)}</div></SectionCard> : null}

      {!normalizedQuery && activeTab === 'buttons' ? <div className="space-y-4" role="tabpanel"><section className="grid gap-4 sm:grid-cols-3"><SummaryCard label={t('buttonsImplemented')} value={snapshot.buttonAudit.implementedCount} /><SummaryCard label={t('buttonsPending')} value={snapshot.buttonAudit.pendingCount} /><SummaryCard label={t('buttonsMissing')} value={snapshot.buttonAudit.missingCount} /></section>{buttonGroups.map(([area, buttons]) => { const status = buttons.some((button) => button.status === 'missing') ? 'FAIL' : buttons.some((button) => button.status === 'pending') ? 'WARNING' : 'PASS'; const id = makeSectionId('buttons', area); return <AccordionCard key={id} id={id} title={area} subtitle={t('healthRegistryEntries', { count: buttons.length })} status={status} expanded={Boolean(expandedSections[id])} onToggle={() => toggleSection(id)}><div className="space-y-2">{buttons.map((button) => <div key={button.id} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-3"><div className="min-w-0"><p className="break-words font-bold text-slate-950">{t(button.labelKey)}</p><code className="break-all text-xs font-semibold text-slate-500">{button.id}</code></div><StatusBadge status={button.status === 'implemented' ? 'PASS' : button.status === 'pending' ? 'WARNING' : 'FAIL'} /></div>)}</div></AccordionCard>})}</div> : null}

      {!normalizedQuery && activeTab === 'translations' ? <div className="space-y-4" role="tabpanel"><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><SummaryCard label={t('englishKeys')} value={snapshot.translationAudit.englishCount} /><SummaryCard label={t('spanishKeys')} value={snapshot.translationAudit.spanishCount} /><SummaryCard label={t('missingSpanish')} value={snapshot.translationAudit.missingSpanish.length} /><SummaryCard label={t('missingEnglish')} value={snapshot.translationAudit.missingEnglish.length} /><SummaryCard label={t('duplicateKeys')} value={snapshot.translationAudit.duplicateKeys.length} /><SummaryCard label={t('emptyValues')} value={snapshot.translationAudit.emptyValues.length} /></section>{translationIssueGroups.map(([labelKey, items]) => { const id = `translations-${labelKey}`; return <AccordionCard key={id} id={id} title={t(labelKey)} status={items.length ? (labelKey === 'emptyValues' || labelKey === 'untranslatedSpanishKeys' ? 'WARNING' : 'FAIL') : 'PASS'} expanded={Boolean(expandedSections[id])} onToggle={() => toggleSection(id)}><IssueList items={items} emptyLabel={t('noIssuesFound')} /></AccordionCard>})}</div> : null}

      {!normalizedQuery && activeTab === 'modals' ? <div className="space-y-3" role="tabpanel">{snapshot.modalAudit.modals.map((modal) => { const status = !modal.registered ? 'FAIL' : !modal.mobileReady || !modal.reusable ? 'WARNING' : 'PASS'; const id = `modal-${modal.id}`; return <AccordionCard key={id} id={id} title={t(modal.labelKey)} subtitle={modal.componentName} status={status} expanded={Boolean(expandedSections[id])} onToggle={() => toggleSection(id)}><KeyValueRows rows={[{ id: 'registered', label: t('registered'), value: modal.registered ? 'PASS' : 'FAIL' }, { id: 'reusable', label: t('reusable'), value: modal.reusable ? 'PASS' : 'WARNING' }, { id: 'mobileReady', label: t('mobileReady'), value: modal.mobileReady ? 'PASS' : 'WARNING' }]} /></AccordionCard>})}</div> : null}

      {!normalizedQuery && activeTab === 'featureFlags' ? <SectionCard title={t('futureBackendReadiness')} action={<StatusBadge status={snapshot.featureFlagAudit.status} />}><div className="space-y-2">{snapshot.featureFlagAudit.flags.map((flag) => <div key={flag.key} className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3"><code className="min-w-0 break-all font-bold text-slate-950">{flag.key}</code><div className="flex shrink-0 items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${flag.enabled ? STATUS_STYLES.PASS : 'bg-slate-100 text-slate-700'}`}>{flag.enabled ? t('enabled') : t('disabled')}</span><StatusBadge status={flag.defined ? 'PASS' : 'FAIL'} /></div></div>)}</div></SectionCard> : null}

      {!normalizedQuery && activeTab === 'release' ? <div className="space-y-4" role="tabpanel">
        {productionDomain?.status !== 'Complete' ? <div className={`rounded-3xl border p-5 ${productionDomain.status === 'Failed' ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className={`text-xs font-bold uppercase tracking-[0.16em] ${productionDomain.status === 'Failed' ? 'text-rose-700' : 'text-amber-700'}`}>{t('primaryReleaseBlocker')}</p><h2 className={`mt-2 text-xl font-bold ${productionDomain.status === 'Failed' ? 'text-rose-950' : 'text-amber-950'}`}>{t(productionDomain.labelKey)}</h2><p className={`mt-2 text-sm ${productionDomain.status === 'Failed' ? 'text-rose-800' : 'text-amber-800'}`}>{t('productionDomainPendingHelp')}</p>{productionDomain.verifiedAt ? <p className="mt-2 text-xs font-semibold text-slate-600">{t('releaseEvidenceTimestamp', { timestamp: productionDomain.verifiedAt })}</p> : null}{productionDomain.verificationChecks?.length ? <div className="mt-4 space-y-2">{productionDomain.verificationChecks.map((check) => <div key={check.id} className="flex min-w-0 flex-col gap-2 rounded-xl border border-white/70 bg-white/70 p-3 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><p className="font-bold text-slate-950">{t(check.labelKey)}</p><p className="mt-1 break-words text-sm text-slate-600">{t(check.evidenceKey)}</p></div><StatusBadge status={check.status} /></div>)}</div> : null}{productionDomain.sourceHint ? <p className="mt-4 break-words font-mono text-xs font-semibold text-slate-600">{t('sourceHint')}: {productionDomain.sourceHint}</p> : null}</div><StatusBadge status={getChecklistAuditStatus(productionDomain.status)} /></div></div> : null}
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"><SummaryCard label={t('overallApplicationHealth')} value={applicationStatus} status={applicationStatus} /><SummaryCard label={t('backendReadiness')} value={snapshot.backendEnvironment.status} status={snapshot.backendEnvironment.status} /><SummaryCard label={t('authenticationReadiness')} value={authStatus} status={authStatus} /></section>
        <SectionCard title={t('privateBetaBackendChecklist')} action={<StatusBadge status={releaseStatus} />}><div className="space-y-2">{snapshot.privateBetaChecklist.map((item) => <div key={item.id} className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-3 ${item.status === 'Failed' ? 'border-rose-300 bg-rose-50' : item.id === 'productionDomainReady' && item.status === 'Pending' ? 'border-amber-300 bg-amber-50' : 'border-slate-200'}`}><p className="font-bold text-slate-950">{t(item.labelKey)}</p><span className={`rounded-full px-3 py-1 text-xs font-bold ${item.status === 'Complete' ? STATUS_STYLES.PASS : item.status === 'Failed' ? STATUS_STYLES.FAIL : item.status === 'Pending' ? STATUS_STYLES.WARNING : 'bg-slate-100 text-slate-700'}`}>{t(`checkStatus.${getChecklistStatusKey(item.status)}`)}</span></div>)}</div></SectionCard>
        {releaseCapabilityFlags.length ? <SectionCard title={t('productionCapabilityFlags')}><p className="mb-4 rounded-xl bg-slate-50 p-3 text-sm font-semibold text-slate-600">{t('productionCapabilityFlagsHelp')}</p><div className="space-y-2">{releaseCapabilityFlags.map((flag) => <div key={flag.key} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3"><code className="break-all font-bold text-slate-950">{flag.key}</code><span className={`rounded-full px-3 py-1 text-xs font-bold ${flag.enabled ? STATUS_STYLES.PASS : 'bg-slate-100 text-slate-700'}`}>{flag.enabled ? t('enabled') : t('disabled')}</span></div>)}</div></SectionCard> : null}
      </div> : null}

      {!normalizedQuery && activeTab === 'technicalDebt' ? <div className="space-y-6" role="tabpanel"><section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><SummaryCard label={t('missingImplementation')} value={snapshot.technicalDebtAudit.counts.missingImplementation} /><SummaryCard label={t('todoItems')} value={snapshot.technicalDebtAudit.counts.todoItems} /><SummaryCard label={t('comingSoonPages')} value={snapshot.technicalDebtAudit.counts.comingSoonPages} /><SummaryCard label={t('deadButtons')} value={snapshot.technicalDebtAudit.counts.deadButtons} /></section><SectionCard title={t('technicalDebtItems')} action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{technicalDebtItems.length}</span>}>{technicalDebtItems.length ? <div className="grid gap-3 lg:grid-cols-2">{technicalDebtItems.map((item) => <DebtCard key={item.id} item={item} t={t} />)}</div> : <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{t('noTechnicalDebtItems')}</p>}</SectionCard><SectionCard title={t('backlogItems')} action={<span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">{backlogItems.length}</span>}>{backlogItems.length ? <div className="grid gap-3 lg:grid-cols-2">{backlogItems.map((item) => <DebtCard key={item.id} item={item} t={t} />)}</div> : <p className="rounded-2xl bg-emerald-50 p-4 text-sm font-semibold text-emerald-800">{t('noBacklogItems')}</p>}</SectionCard></div> : null}
    </div>
  )
}
