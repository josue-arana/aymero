import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes, matchPath, useLocation, useNavigate, useParams } from 'react-router-dom'
import { BriefcaseBusiness, ClipboardList, DollarSign, Settings, Users } from 'lucide-react'
import { Sidebar } from './components/layout/Sidebar'
import { ScrollToTop } from './components/layout/ScrollToTop'
import { Topbar } from './components/layout/Topbar'
import { HostnameRouteBoundary } from './components/routing/HostnameRouteBoundary'
import { initialLeads } from './data/mockLeads'
import { mockScheduleEvents } from './data/mockScheduleEvents'
import { ScheduleEventModal } from './components/calendar/ScheduleEventModal'
import { ToastProvider, useToast } from './components/common/ToastProvider'
import { JobFormModal } from './components/jobs/JobFormModal'
import { LeadFormModal } from './components/leads/LeadFormModal'
import dataProvider from './services/dataProvider'
import { readLeadPipelineStage, writeLeadPipelineStage } from './services/local/leadPipelineStorage'
import { clearContractDraft } from './services/local/contractDraftStorage'
import { clearEstimateDraft } from './services/local/estimateDraftStorage'
import { readStoredCustomClients, readStoredLeads, readStoredUserProfiles, writeStoredCustomClients, writeStoredLeads, writeStoredUserProfiles } from './services/local/runtimeEntityStorage'
import { useClientsBootstrap } from './hooks/useClientsBootstrap'
import { useLeadsBootstrap } from './hooks/useLeadsBootstrap'
import { useLocalStorage } from './hooks/useLocalStorage'
import { createTranslator } from './translations'
import { currency } from './utils/formatters'
import { SettingsPage } from './pages/SettingsPage'
import { CustomerPortalPage } from './pages/CustomerPortalPage'
import { DashboardPage } from './pages/DashboardPage'
import { EstimateBuilderRoute } from './pages/EstimateBuilderPage'
import { EstimatesPage } from './pages/EstimatesPage'
import { ContractRoute, ContractsPage } from './pages/ContractsPage'
import { JobsPage } from './pages/JobsPage'
import { LeadDetailPage } from './pages/LeadDetailPage'
import { LeadsPage } from './pages/LeadsPage'
import { ClientsPage } from './pages/ClientsPage'
import { ClientProfilePage } from './pages/ClientProfilePage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import { InvoicesPage } from './pages/InvoicesPage'
import { InvoiceDetailRoute } from './pages/InvoiceDetailPage'
import { CalendarPage } from './pages/CalendarPage'
import { AuthSetupPage } from './pages/AuthSetupPage'
import { PublicEstimatePage } from './pages/PublicEstimatePage'
import { buildClientProfiles, getClientSlug } from './utils/clients'
import { appRoutes } from './config/appRoutes'
import { AuthProvider } from './contexts/AuthContext'
import { useAuth } from './contexts/AuthContext'
import { AnalyticsModeProvider } from './contexts/SimpleModeContext'
import { LoginPage } from './pages/auth/LoginPage'
import { SignupPage } from './pages/auth/SignupPage'
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage'
import { ENABLE_DEVELOPER_ROUTES, USE_AUTH, USE_SUPABASE, USE_SUPABASE_CLIENTS, USE_SUPABASE_CONTRACTS, USE_SUPABASE_ESTIMATES, USE_SUPABASE_EVENTS, USE_SUPABASE_INVOICES, USE_SUPABASE_LEADS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS, USE_SUPABASE_SETTINGS } from './config/backendConfig'
import { createDefaultCompanySettings } from './data/defaultCompanySettings'
import { getClientsContractorId } from './services/system/clientsRuntimeService'
import { getLeadsContractorId } from './services/system/leadsRuntimeService'
import { getEventsContractorId } from './services/system/eventsRuntimeService'
import { getProjectsContractorId } from './services/system/projectsRuntimeService'
import { getSettingsContractorId } from './services/system/settingsRuntimeService'
import { getInvoicesContractorId } from './services/system/invoicesRuntimeService'
import { buildDisplayedUserProfile } from './services/system/userProfileRuntimeService'
import { hasContractData, readLinkedContractDraft, writeLinkedContractDrafts } from './utils/contractLinks'
import { buildEstimateLookupIds, hasEstimateData, readLinkedEstimateDraft, resolveEstimateTotal, toSafeNumber, writeLinkedEstimateDrafts } from './utils/estimateLinks'
import { generateContractNumber } from './utils/contractNumber'
import { generateEstimateNumber } from './utils/estimateNumber'
import { dedupeInvoiceRecords, hydrateInvoiceRecord } from './utils/invoiceRecords'
import { normalizeClientPreferredLanguageFields, normalizeDocumentLanguageOverride, normalizeLeadClientLanguageFields, normalizeSupportedLanguage, normalizeSupportedLanguageOrEmpty, readStoredSupportedLanguage, resolveInitialSupportedLanguage, resolvePreferredClientLanguage } from './utils/language'
import { buildLeadPipelineTransition, getLeadPipelineStage, getLeadPipelineStageCounts, leadPipelineStageOrder, leadPipelineStages, normalizeLeadPipelineStage } from './utils/leadPipeline'
import { calculateProjectPaymentSummary, dedupePayments, normalizePaymentRecord } from './utils/projectPayments'
import { createLocalRecordId, dedupeById, findLeadByProjectLookup, resolveLinkedLeadId, resolveLinkedProjectId } from './utils/projectIdentity'
import { buildPortalShareUrl, resolvePortalRouteId } from './utils/portal'
import { buildContractWorkBreakdownFromEstimate, isGeneratedContractScopeText } from './utils/contractDocument'
import { SAMPLE_GUIDE_ITEM_KEYS, SAMPLE_WORKSPACE_VERSION, createSampleWorkspace, removeSampleWorkspace, updateSampleWorkspaceGuide, upgradeSampleWorkspace as upgradeSampleWorkspaceRecords } from './services/sampleWorkspaceService'

const emptyArchiveState = {
  leadIds: [],
  projectIds: [],
  clientIds: [],
  invoiceIds: [],
  scheduleEventIds: [],
  deletedLeadIds: [],
  deletedProjectIds: [],
  deletedClientIds: [],
  deletedInvoiceIds: [],
  deletedScheduleEventIds: [],
}

function isSampleGuideDestination(itemKey, pathname, records = {}) {
  const expectedPaths = {
    lead: records.lead ? `/leads/${records.lead}` : '',
    estimate: records.project ? `/projects/${records.project}/estimate` : '',
    job: records.project ? `/projects/${records.project}` : '',
    event: records.project ? `/projects/${records.project}` : '',
    client: records.client ? `/clients/${records.client}` : '',
    financial: records.invoice ? `/invoices/${records.invoice}` : '',
  }
  return Boolean(expectedPaths[itemKey] && pathname === expectedPaths[itemKey])
}

const TranslationAuditPage = lazy(() => import('./pages/TranslationAuditPage').then((module) => ({ default: module.TranslationAuditPage })))
const AuthOnboardingPage = lazy(() => import('./pages/AuthOnboardingPage').then((module) => ({ default: module.AuthOnboardingPage })))

function logLeadConversionDevError(message, error, meta) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error(message, {
    error,
    ...meta,
  })
}

function getProjectPaymentStatus(amountPaid, contractAmount, depositRequired) {
  if (amountPaid >= contractAmount && contractAmount > 0) return 'Paid in Full'
  if (amountPaid <= 0) return 'Not Paid'
  if (amountPaid < depositRequired) return 'Partially Paid'
  if (amountPaid === depositRequired) return 'Deposit Paid'
  return 'Progress Payment Paid'
}

function sortScheduleEventRecords(events = []) {
  return [...events].sort((left, right) => {
    const leftStamp = `${left?.date || ''}T${left?.startTime || '00:00'}`
    const rightStamp = `${right?.date || ''}T${right?.startTime || '00:00'}`
    return leftStamp.localeCompare(rightStamp)
  })
}

function buildDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function toDateKey(value) {
  if (!value) return ''
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim()
  }

  return buildDateKey(value)
}

function resolvePaymentProjectId(record = {}) {
  return record?.projectId || record?.project_id || null
}

function mergeCreatedJobDraft(jobDraft, persistedJob = {}, clientRecord = null) {
  const address = persistedJob.address || persistedJob.location || jobDraft.address || jobDraft.location || clientRecord?.address || ''
  const clientName = persistedJob.client || persistedJob.clientName || persistedJob.customerName || jobDraft.client || jobDraft.clientName || clientRecord?.name || ''
  const linkedEstimate = hasEstimateData(persistedJob?.portal?.estimate) ? persistedJob.portal.estimate : readLinkedEstimateDraft(persistedJob, jobDraft.id || jobDraft.projectId || '')
  const value = resolveEstimateTotal({
    ...jobDraft,
    ...persistedJob,
  }, linkedEstimate)

  return {
    ...jobDraft,
    ...persistedJob,
    clientId: persistedJob.clientId ?? jobDraft.clientId ?? clientRecord?.id ?? '',
    client: clientName,
    clientName,
    customerName: clientName,
    phone: persistedJob.phone || jobDraft.phone || clientRecord?.phone || '',
    email: persistedJob.email || jobDraft.email || clientRecord?.email || '',
    address,
    location: persistedJob.location || jobDraft.location || address,
    projectTitle: persistedJob.projectTitle || persistedJob.title || jobDraft.projectTitle || jobDraft.projectType || '',
    projectType: persistedJob.projectType || jobDraft.projectType || jobDraft.projectTitle || '',
    projectStatus: persistedJob.projectStatus || jobDraft.projectStatus || 'Scheduled',
    startDate: persistedJob.startDate || jobDraft.startDate || '',
    estimateId: persistedJob.estimateId ?? jobDraft.estimateId ?? linkedEstimate?.id ?? null,
    value,
    estimatedValue: resolveEstimateTotal({ estimatedValue: persistedJob.estimatedValue ?? jobDraft.estimatedValue }, linkedEstimate, value),
    contractValue: resolveEstimateTotal({ contractValue: persistedJob.contractValue ?? jobDraft.contractValue }, linkedEstimate, value),
    notes: persistedJob.notes || jobDraft.notes || '',
    nextStep: persistedJob.nextStep || jobDraft.nextStep || jobDraft.notes || '',
    source: persistedJob.source || jobDraft.source || 'Direct Job',
    leadPipelineStage: persistedJob.leadPipelineStage || jobDraft.leadPipelineStage || leadPipelineStages.CONVERTED_TO_JOB,
    portal: {
      ...(jobDraft.portal || {}),
      ...(persistedJob.portal || {}),
      ...(linkedEstimate ? { estimate: linkedEstimate } : {}),
    },
  }
}

function buildProjectFromLead(lead, projectId = '', linkedEstimate = null) {
  const clientName = lead?.client || lead?.clientName || lead?.customerName || ''
  const address = lead?.address || lead?.location || ''
  const projectTitle = lead?.projectTitle || lead?.title || lead?.projectType || 'Untitled Project'
  const projectType = lead?.projectType || lead?.jobType || lead?.projectTitle || ''
  const sourceEstimate = hasEstimateData(linkedEstimate)
    ? linkedEstimate
    : hasEstimateData(lead?.portal?.estimate)
      ? lead.portal.estimate
      : readLinkedEstimateDraft(lead)
  const estimatedValue = resolveEstimateTotal(lead, sourceEstimate)
  const estimateId = sourceEstimate?.id || lead?.estimateId || null

  return {
    ...(projectId ? { id: projectId, projectId, project_id: projectId } : {}),
    clientId: lead?.clientId || lead?.client_id || null,
    leadId: lead?.id || null,
    estimateId,
    client: clientName,
    clientName,
    customerName: clientName,
    phone: lead?.phone || '',
    email: lead?.email || '',
    clientLanguage: lead?.clientLanguage || '',
    title: projectTitle,
    projectTitle,
    projectType,
    address,
    location: address,
    estimatedValue,
    value: estimatedValue,
    status: 'scheduled',
    projectStatus: 'Scheduled',
    startDate: lead?.startDate || lead?.portal?.startDate || '',
    notes: lead?.notes || '',
    description: lead?.description || lead?.notes || '',
    portal: {
      ...(lead?.portal || {}),
      estimate: sourceEstimate || {},
      contract: hasContractData(lead?.portal?.contract)
        ? lead.portal.contract
        : readLinkedContractDraft(lead) || {},
      contractAmount: estimatedValue,
      outstandingBalance: estimatedValue,
    },
  }
}

function normalizeLeadTitleFields(lead = {}) {
  const projectTitle = lead?.projectTitle || lead?.title || lead?.projectType || ''
  const projectType = lead?.projectType || projectTitle

  return {
    ...lead,
    title: lead?.title || projectTitle,
    projectTitle,
    projectType,
  }
}

function resolvePersistedProjectLink(...records) {
  for (const record of records) {
    const projectId = record?.projectId || record?.project_id || null

    if (projectId) {
      return projectId
    }
  }

  return null
}

function isLeadArchivedRecord(lead = {}, archivedLeadIds = []) {
  return Boolean(
    lead?.isArchived
      || lead?.archivedAt
      || lead?.archived_at
      || archivedLeadIds.includes(lead?.id)
  )
}

function getLinkedContract(lead) {
  if (hasContractData(lead?.portal?.contract)) {
    return lead.portal.contract
  }

  return readLinkedContractDraft(lead)
}

function isArchivedContractRecord(contract = {}) {
  return Boolean(
    contract?.archivedAt
      || contract?.archived_at
      || contract?.isArchived
      || contract?.archived
  )
}

function isSignedContractRecord(contract = {}) {
  return Boolean(
    contract?.status === 'Signed'
      || contract?.signed
      || contract?.signedDate
      || contract?.signedAt
      || contract?.signed_at
  )
}

function getLinkedActiveContract(lead) {
  const linkedContract = getLinkedContract(lead)

  if (!hasContractData(linkedContract) || isArchivedContractRecord(linkedContract)) {
    return null
  }

  return linkedContract
}

function selectActiveContractRecord(contracts = []) {
  if (!Array.isArray(contracts)) {
    return null
  }

  return contracts.find((contract) => hasContractData(contract) && !isArchivedContractRecord(contract)) || null
}

function attachContractToLeadState(lead = {}, contract = null) {
  const linkedContract = hasContractData(contract) ? contract : getLinkedContract(lead)

  if (!hasContractData(linkedContract)) {
    return lead
  }

  const linkedEstimate = hasEstimateData(lead?.portal?.estimate)
    ? lead.portal.estimate
    : readLinkedEstimateDraft(lead)
  const contractAmount = resolveEstimateTotal({
    ...lead,
    portal: {
      ...(lead?.portal || {}),
      contractAmount: linkedContract?.total ?? linkedContract?.totalAmount ?? linkedContract?.contractAmount,
    },
  }, linkedEstimate, toSafeNumber(linkedContract?.total ?? linkedContract?.totalAmount ?? linkedContract?.contractAmount ?? lead?.value))

  return {
    ...lead,
    estimateId: lead?.estimateId || linkedContract?.estimateId || linkedEstimate?.id || null,
    value: contractAmount,
    estimatedValue: resolveEstimateTotal({ estimatedValue: lead?.estimatedValue }, linkedEstimate, contractAmount),
    portal: {
      ...(lead?.portal || {}),
      estimate: linkedEstimate
        ? {
            ...linkedEstimate,
            status: linkedEstimate?.status === 'Converted to Contract' ? linkedEstimate.status : 'Converted to Contract',
          }
        : lead?.portal?.estimate,
      contract: {
        ...(lead?.portal?.contract || {}),
        ...linkedContract,
        total: Number(linkedContract?.total ?? linkedContract?.totalAmount ?? linkedContract?.contractAmount ?? contractAmount),
      },
      contractAmount,
      outstandingBalance: Math.max(contractAmount - Number(lead?.portal?.amountPaid || 0), 0),
    },
  }
}

function withLeadPipelineStage(lead) {
  if (!lead) return lead

  const explicitPipelineStage = normalizeLeadPipelineStage(lead.leadPipelineStage || lead.lead_pipeline_stage)
  const storedPipelineStage = readLeadPipelineStage(lead.id)
  const nextLead = explicitPipelineStage
    ? { ...lead, leadPipelineStage: explicitPipelineStage }
    : storedPipelineStage
    ? { ...lead, leadPipelineStage: storedPipelineStage }
    : lead

  return {
    ...nextLead,
    leadPipelineStage: nextLead.leadPipelineStage || getLeadPipelineStage(nextLead),
  }
}

function hydrateLeadEstimateData(lead) {
  if (!lead) return lead

  const linkedEstimate = hasEstimateData(lead?.portal?.estimate)
    ? lead.portal.estimate
    : readLinkedEstimateDraft(lead)
  const linkedContract = getLinkedContract(lead)

  if (!hasEstimateData(linkedEstimate)) {
    return withLeadPipelineStage(attachContractToLeadState(lead, linkedContract))
  }

  const estimateTotal = resolveEstimateTotal(lead, linkedEstimate)

  return withLeadPipelineStage(attachContractToLeadState({
    ...lead,
    estimateId: lead.estimateId || linkedEstimate.id || null,
    value: estimateTotal,
    estimatedValue: estimateTotal,
    portal: {
      ...(lead.portal || {}),
      estimate: {
        ...(lead.portal?.estimate || {}),
        ...linkedEstimate,
      },
    },
  }, linkedContract))
}

function matchesLinkedEstimate(lead, estimate) {
  if (!lead || !estimate) return false

  const leadId = resolveLinkedLeadId(lead)
  const projectId = resolveLinkedProjectId(lead)

  if (estimate.projectId || estimate.project_id) {
    return Boolean(projectId && (estimate.projectId === projectId || estimate.project_id === projectId))
  }

  if (estimate.leadId || estimate.lead_id) {
    return Boolean(leadId && (estimate.leadId === leadId || estimate.lead_id === leadId))
  }

  return Boolean(estimate.id && estimate.id === lead.estimateId)
}

function matchesLinkedContract(lead, contract, estimate = null) {
  if (!lead || !contract) return false

  const leadId = resolveLinkedLeadId(lead)
  const projectId = resolveLinkedProjectId(lead)

  if (contract.projectId || contract.project_id) {
    return Boolean(projectId && (contract.projectId === projectId || contract.project_id === projectId))
  }

  if (estimate?.id && contract.estimateId && contract.estimateId === estimate.id) {
    return true
  }

  if (contract.estimateId && contract.estimateId === lead.estimateId) {
    return true
  }

  if (contract.leadId || contract.lead_id) {
    return Boolean(leadId && (contract.leadId === leadId || contract.lead_id === leadId))
  }

  return Boolean(contract.id && contract.id === lead.contractId)
}

function mergePersistedDocumentsIntoLead(lead, persistedEstimates = [], persistedContracts = []) {
  if (!lead) return lead

  const persistedEstimate = persistedEstimates.find((estimate) => matchesLinkedEstimate(lead, estimate))
  const linkedEstimate = hasEstimateData(persistedEstimate)
    ? persistedEstimate
    : hasEstimateData(lead?.portal?.estimate)
      ? lead.portal.estimate
      : readLinkedEstimateDraft(lead)
  const persistedContract = persistedContracts.find((contract) => matchesLinkedContract(lead, contract, linkedEstimate))
  const linkedContract = hasContractData(persistedContract)
    ? persistedContract
    : hasContractData(lead?.portal?.contract)
      ? lead.portal.contract
      : readLinkedContractDraft(lead)

  if (!hasEstimateData(linkedEstimate) && !hasContractData(linkedContract)) {
    return withLeadPipelineStage(lead)
  }

  const nextLead = {
    ...lead,
    estimateId: lead.estimateId || linkedEstimate?.id || null,
    portal: {
      ...(lead.portal || {}),
      ...(hasEstimateData(linkedEstimate) ? { estimate: linkedEstimate } : {}),
      ...(hasContractData(linkedContract) ? { contract: linkedContract } : {}),
    },
  }

  return hydrateLeadEstimateData(nextLead)
}

const defaultUserProfile = {
  name: 'Josue Arana',
  email: 'josue@aymero.example',
  phone: '(410) 555-0188',
  preferredLanguage: 'en',
  timezone: 'America/New_York',
  source: 'mock',
  authUserId: 'mock-user',
}

const initialNotifications = []

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value) {
  return typeof value === 'string' && uuidPattern.test(value.trim())
}

function normalizeComparableText(value) {
  return String(value || '').trim().toLowerCase()
}

function normalizeUserProfileDraft(profile = {}, fallbackLanguage = 'en') {
  return {
    ...profile,
    preferredLanguage: normalizeSupportedLanguage(profile?.preferredLanguage, fallbackLanguage),
  }
}

function normalizeLeadLanguageRecord(lead = {}, fallbackLanguage = '') {
  return normalizeLeadClientLanguageFields(lead, fallbackLanguage)
}

function normalizeClientLanguageRecord(client = {}, fallbackLanguage = '') {
  return normalizeClientPreferredLanguageFields(client, fallbackLanguage)
}

function logLeadDevError(message, error, meta) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error(message, {
    error,
    ...meta,
  })
}

function logEstimateDevError(message, error, meta) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error(message, {
    error,
    ...meta,
  })
}

function App() {
  return (
    <BrowserRouter>
      <HostnameRouteBoundary publicEstimateElement={<PublicEstimatePage />}>
        <ToastProvider>
          <AuthProvider>
            <ScrollToTop />
            <ContractorFlowApp />
          </AuthProvider>
        </ToastProvider>
      </HostnameRouteBoundary>
    </BrowserRouter>
  )
}

function ContractorFlowApp() {
  const [leads, setLeads] = useState(() => (
    USE_SUPABASE_LEADS
      ? []
      : readStoredLeads(initialLeads.map(withLeadPipelineStage)).map((lead) => normalizeLeadLanguageRecord(lead))
  ))
  const [customClients, setCustomClients] = useState(() => (
    USE_SUPABASE_CLIENTS
      ? []
      : readStoredCustomClients([]).map((client) => normalizeClientLanguageRecord(client))
  ))
  const [scheduleEvents, setScheduleEvents] = useState(USE_SUPABASE_EVENTS ? [] : mockScheduleEvents)
  const [invoiceRecords, setInvoiceRecords] = useState([])
  const [persistedPayments, setPersistedPayments] = useState([])
  const [areInvoicesLoaded, setAreInvoicesLoaded] = useState(false)
  const [scheduleModalState, setScheduleModalState] = useState({ isOpen: false, leadId: '', context: 'event', editingEvent: null, origin: '' })
  const [jobModalState, setJobModalState] = useState({ isOpen: false, initialClientId: '', initialClient: null, origin: '' })
  const [isDashboardLeadModalOpen, setIsDashboardLeadModalOpen] = useState(false)
  const [dashboardSuccessMessage, setDashboardSuccessMessage] = useState('')
  const [archives, setArchives] = useState(emptyArchiveState)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [onboardingSessionActive, setOnboardingSessionActive] = useState(false)
  const [isCompanySetupReopen, setIsCompanySetupReopen] = useState(false)
  const [draggedLeadId, setDraggedLeadId] = useState(null)
  const [selectedMobileStage, setSelectedMobileStage] = useState(leadPipelineStageOrder[0])
  const [language, setLanguage] = useLocalStorage('contractorflow.language', resolveInitialSupportedLanguage('contractorflow.language', 'en'))
  const [portalLanguage, setPortalLanguage] = useLocalStorage('contractorflow.portalLanguage', 'en')
  const scheduleSaveInFlightRef = useRef(false)
  const settingsMutationVersionRef = useRef(0)
  const sampleGuideVisitRef = useRef('')
  const [companySettings, setCompanySettings] = useState(() => createDefaultCompanySettings({
    appLanguage: language,
    portal: {
      defaultLanguage: portalLanguage,
    },
  }))
  const [persistedEstimates, setPersistedEstimates] = useState([])
  const [persistedContracts, setPersistedContracts] = useState([])
  const [notifications, setNotifications] = useState(initialNotifications)
  const contractEnsureGuardRef = useRef(new Map())
  const [userProfilesByUserId, setUserProfilesByUserId] = useState(() => {
    const storedProfiles = readStoredUserProfiles({})
    const normalizedProfiles = Object.fromEntries(
      Object.entries(storedProfiles).map(([profileKey, profile]) => [profileKey, normalizeUserProfileDraft(profile)])
    )

    return {
      ...normalizedProfiles,
      'mock-user': normalizeUserProfileDraft({
        ...defaultUserProfile,
        ...(normalizedProfiles['mock-user'] || {}),
      }),
    }
  })
  const t = useMemo(() => createTranslator(language), [language])
  const portalT = useMemo(() => createTranslator(portalLanguage), [portalLanguage])
  const navigate = useNavigate()
  const location = useLocation()
  const { showToast } = useToast()
  const { authSetupError, company, contractor, contractorAccess, hasContractorAccess, isAuthenticated, isLoading, logout, onboardingRequired, persistPreferredLanguage, session, user } = useAuth()
  const activeUserProfileKey = USE_AUTH ? (user?.id || session?.user?.id || 'anonymous-auth') : 'mock-user'
  const preferredLanguageSyncRef = useRef('')
  const {
    profile: userProfile,
  } = useMemo(() => buildDisplayedUserProfile({
    contractor,
    contractorAccess,
    mockProfile: defaultUserProfile,
    session,
    user,
    profileOverrides: userProfilesByUserId[activeUserProfileKey],
  }), [activeUserProfileKey, contractor, contractorAccess, session, user, userProfilesByUserId])
  const clientsContractorId = getClientsContractorId({ contractor, company, session })
  const leadsContractorId = getLeadsContractorId({ contractor, company, session })
  const eventsContractorId = getEventsContractorId({ contractor, company, session })
  const projectsContractorId = getProjectsContractorId({ contractor, company, session })
  const settingsContractorId = getSettingsContractorId({ contractor, company, session })
  const invoicesContractorId = getInvoicesContractorId({ contractor, company, session })
  const isAwaitingResolvedSettings = Boolean(
    USE_AUTH
      && contractorAccess?.membershipStatus === 'active'
      && settingsContractorId
      && companySettings?.contractorId !== settingsContractorId
  )
  const isAuthPage = [appRoutes.login, appRoutes.signup, appRoutes.forgotPassword].includes(location.pathname)
  const isPortalRoute = Boolean(matchPath(appRoutes.portal, location.pathname))
  const isDeveloperRoute = ENABLE_DEVELOPER_ROUTES
    && [appRoutes.developerHealth, appRoutes.developerTranslations].includes(location.pathname)
  const isMobileClientProfileRoute = Boolean(matchPath(appRoutes.clientProfile, location.pathname))
  const localProfilePreferredLanguage = normalizeSupportedLanguageOrEmpty(userProfilesByUserId[activeUserProfileKey]?.preferredLanguage || '')
  const remotePreferredLanguage = normalizeSupportedLanguageOrEmpty(
    contractorAccess?.membership?.preferred_language || user?.user_metadata?.preferred_language || ''
  )
  const storedAppLanguage = readStoredSupportedLanguage('contractorflow.language')
  const persistedSettingsAppLanguage = companySettings?.contractorId === settingsContractorId
    ? normalizeSupportedLanguageOrEmpty(companySettings?.appLanguage)
    : ''
  const resolvedAuthenticatedLanguage = persistedSettingsAppLanguage
    || localProfilePreferredLanguage
    || remotePreferredLanguage
    || storedAppLanguage
    || resolveInitialSupportedLanguage('contractorflow.language', 'en')
  const mainLayoutClassName = isMobileClientProfileRoute
    ? 'px-0 py-0 lg:px-8 lg:py-6'
    : 'px-4 py-6 sm:px-6 lg:px-8'

  const hasResolvedOnboardingSettings = Boolean(
    contractorAccess?.membershipStatus === 'active'
      && settingsContractorId
      && companySettings?.contractorId === settingsContractorId
  )
  const shouldAutoOpenOnboarding = Boolean(
    hasResolvedOnboardingSettings
      && companySettings?.onboarding?.completed === false
      && companySettings?.onboarding?.dismissed !== true
  )

  useEffect(() => {
    if (onboardingRequired) {
      setOnboardingSessionActive(true)
    }
  }, [onboardingRequired])

  async function persistOnboardingSettings(nextSettings, contractorIdOverride = '') {
    const contractorId = contractorIdOverride || settingsContractorId
    settingsMutationVersionRef.current += 1
    const response = await dataProvider?.settings?.updateSettings?.(nextSettings, { contractorId })
    settingsMutationVersionRef.current += 1

    if (!response?.error) {
      const persistedSettings = createDefaultCompanySettings(response?.data || {
        ...nextSettings,
        contractorId,
      })
      setCompanySettings(persistedSettings)
    }

    return response || { data: nextSettings, error: null, skipped: true }
  }

  function closeOnboarding() {
    setOnboardingSessionActive(false)
    setIsCompanySetupReopen(false)
  }

  async function refreshWorkspaceEntities(contractorId = settingsContractorId, { expectedSampleEventId = '' } = {}) {
    if (!contractorId) return { data: null, error: { code: 'MISSING_CONTRACTOR_ID' } }

    const [clientsResponse, leadsResponse, estimatesResponse, projectsResponse, contractsResponse, invoicesResponse, paymentsResponse, eventsResponse, settingsResponse] = await Promise.all([
      dataProvider.clients.list({ contractorId, includeArchived: true }),
      dataProvider.leads.list({ contractorId, includeArchived: true }),
      dataProvider.estimates.list({ contractorId, includeArchived: true }),
      dataProvider.projects.list({ contractorId, includeArchived: true }),
      dataProvider.contracts.list({ contractorId, includeArchived: true }),
      dataProvider.invoices.list({ contractorId, includeArchived: true }),
      dataProvider.payments.list({ contractorId, includeArchived: true }),
      dataProvider.events.list({ contractorId, includeArchived: true }),
      dataProvider.settings.getSettings({ contractorId }),
    ])

    if (!clientsResponse?.error && Array.isArray(clientsResponse?.data)) setCustomClients(clientsResponse.data)
    if (!leadsResponse?.error && Array.isArray(leadsResponse?.data)) setLeads(leadsResponse.data)
    if (!estimatesResponse?.error && Array.isArray(estimatesResponse?.data)) setPersistedEstimates(estimatesResponse.data)
    if (!contractsResponse?.error && Array.isArray(contractsResponse?.data)) setPersistedContracts(contractsResponse.data)
    if (!invoicesResponse?.error && Array.isArray(invoicesResponse?.data)) {
      setInvoiceRecords(dedupeInvoiceRecords(invoicesResponse.data))
      setAreInvoicesLoaded(true)
    }
    if (!paymentsResponse?.error && Array.isArray(paymentsResponse?.data)) setPersistedPayments(paymentsResponse.data)
    if (!eventsResponse?.error && Array.isArray(eventsResponse?.data)) setScheduleEvents(sortScheduleEventRecords(eventsResponse.data))
    if (!settingsResponse?.error && settingsResponse?.data) setCompanySettings(createDefaultCompanySettings(settingsResponse.data))

    if (
      import.meta.env.DEV
      && expectedSampleEventId
      && !eventsResponse?.error
      && Array.isArray(eventsResponse?.data)
      && !eventsResponse.data.some((event) => event.id === expectedSampleEventId)
    ) {
      // eslint-disable-next-line no-console
      console.warn('[dev] The contractor-scoped Calendar query did not return the persisted sample event.', {
        failingFunction: 'dataProvider.events.list',
        contractorId,
        expectedSampleEventId,
        queryFilters: { contractorId, includeArchived: true },
        returnedEventIds: eventsResponse.data.map((event) => event.id),
      })
    }

    const refreshResponses = {
      clients: clientsResponse,
      leads: leadsResponse,
      estimates: estimatesResponse,
      projects: projectsResponse,
      contracts: contractsResponse,
      invoices: invoicesResponse,
      payments: paymentsResponse,
      events: eventsResponse,
      settings: settingsResponse,
    }
    const failedEntry = Object.entries(refreshResponses).find(([, response]) => response?.error)

    if (failedEntry) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Sample workspace state refresh did not fully complete.', {
          stage: failedEntry[0],
          contractorId,
          code: failedEntry[1]?.error?.code || null,
          message: failedEntry[1]?.error?.message || null,
          details: failedEntry[1]?.error?.details || null,
        })
      }
      return { data: { projects: projectsResponse?.data || [] }, error: { code: 'SAMPLE_DATA_REFRESH_FAILED' } }
    }

    return { data: { projects: projectsResponse?.data || [] }, error: null }
  }

  async function installSampleWorkspace(onProgress) {
    try {
      const result = await createSampleWorkspace({
        contractorId: settingsContractorId,
        authenticatedUserId: user?.id || session?.user?.id || '',
        companyId: company?.id || company?.contractorId || '',
        settings: companySettings,
        onProgress,
        sampleLabel: t('sampleDataBadge'),
      })
      return finalizeSampleWorkspaceInstallation(result)
    } catch (error) {
      return {
        success: false,
        installed: false,
        partial: false,
        manifest: null,
        recordIds: {},
        records: {},
        settings: companySettings,
        warnings: [],
        errorCode: error?.code || 'SAMPLE_DATA_CREATE_FAILED',
        duplicate: false,
        upgradeRequired: false,
        upgraded: false,
      }
    }
  }

  function finalizeSampleWorkspaceInstallation(result) {
    if (result?.settings) {
      setCompanySettings(createDefaultCompanySettings(result.settings))
    }

    const installationIsComplete = result?.success === true && result?.installed === true
    const partialRecordsExist = result?.partial === true

    if (!installationIsComplete && !partialRecordsExist) return result

    // Refreshing local collections is deliberately detached from the result.
    // A completed install can close immediately, while a partial install still
    // makes already-persisted records (such as its event) visible to the app.
    void refreshWorkspaceEntities(settingsContractorId, {
      expectedSampleEventId: result.recordIds?.event || '',
    })
      .then((refreshResult) => {
        if (refreshResult?.error && import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] Sample workspace records persisted; a non-critical UI refresh did not fully complete.', {
            failingFunction: 'refreshWorkspaceEntities',
            failingPayload: { contractorId: settingsContractorId },
            code: refreshResult.error.code,
            recordsAlreadyCreated: result.recordIds,
          })
        }
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] Sample workspace records persisted; a non-critical UI refresh threw unexpectedly.', {
            failingFunction: 'refreshWorkspaceEntities',
            failingPayload: { contractorId: settingsContractorId },
            code: error?.code || 'SAMPLE_DATA_REFRESH_FAILED',
            message: error?.message || null,
            details: error?.details || null,
            recordsAlreadyCreated: result.recordIds,
          })
        }
      })
      .finally(() => {
        // A refresh response must not replace a verified installed manifest
        // with stale local settings.
        if (installationIsComplete && result.settings) {
          setCompanySettings((current) => createDefaultCompanySettings({
            ...current,
            sampleWorkspace: result.settings.sampleWorkspace,
          }))
        }
      })

    return result
  }

  async function uninstallSampleWorkspace(onProgress) {
    const result = await removeSampleWorkspace({
      contractorId: settingsContractorId,
      authenticatedUserId: user?.id || session?.user?.id || '',
      settings: companySettings,
      onProgress,
    })

    if (result?.data?.settings) {
      setCompanySettings(createDefaultCompanySettings(result.data.settings))
    }
    try {
      await refreshWorkspaceEntities(settingsContractorId)
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Sample cleanup persisted changes, but the UI refresh failed.', {
          failingFunction: 'refreshWorkspaceEntities',
          contractorId: settingsContractorId,
          code: error?.code || 'SAMPLE_DATA_REFRESH_FAILED',
          message: error?.message || null,
        })
      }
    }
    return result
  }

  async function updateInstalledSampleWorkspace(onProgress) {
    try {
      const result = await upgradeSampleWorkspaceRecords({
        contractorId: settingsContractorId,
        authenticatedUserId: user?.id || session?.user?.id || '',
        companyId: company?.id || company?.contractorId || '',
        settings: companySettings,
        onProgress,
        sampleLabel: t('sampleDataBadge'),
      })
      return finalizeSampleWorkspaceInstallation(result)
    } catch (error) {
      return {
        success: false,
        installed: false,
        partial: false,
        manifest: null,
        recordIds: {},
        records: {},
        settings: companySettings,
        warnings: [],
        errorCode: error?.code || 'SAMPLE_DATA_UPDATE_FAILED',
        duplicate: false,
        upgradeRequired: false,
        upgraded: false,
      }
    }
  }

  async function persistSampleGuide(updates) {
    const result = await updateSampleWorkspaceGuide({
      contractorId: settingsContractorId,
      settings: companySettings,
      guide: updates,
    })

    if (result?.data?.settings) {
      setCompanySettings(createDefaultCompanySettings(result.data.settings))
    }
    return result
  }

  function openSampleGuideItem(itemKey) {
    const records = companySettings?.sampleWorkspace?.records || {}
    const routes = {
      lead: records.lead ? `/leads/${records.lead}` : appRoutes.leads,
      estimate: records.project ? `/projects/${records.project}/estimate` : appRoutes.estimates,
      job: records.project ? `/projects/${records.project}` : appRoutes.jobs,
      event: records.project ? `/projects/${records.project}` : appRoutes.calendar,
      client: records.client ? `/clients/${records.client}` : appRoutes.clients,
      financial: records.invoice ? `/invoices/${records.invoice}` : appRoutes.invoices,
    }
    const target = routes[itemKey] || appRoutes.dashboard
    const separator = target.includes('?') ? '&' : '?'
    navigate(`${target}${separator}sampleGuide=${encodeURIComponent(itemKey)}`)
  }

  useEffect(() => {
    const itemKey = new URLSearchParams(location.search).get('sampleGuide') || ''
    const guide = companySettings?.sampleWorkspace?.guide || {}
    const records = companySettings?.sampleWorkspace?.records || {}
    const completedItems = Array.isArray(guide.completedItems) ? guide.completedItems : []
    const visitKey = `${settingsContractorId}:${location.pathname}:${itemKey}`

    if (
      companySettings?.sampleWorkspace?.status !== 'installed'
      || Number(companySettings?.sampleWorkspace?.version || 0) !== SAMPLE_WORKSPACE_VERSION
      || !SAMPLE_GUIDE_ITEM_KEYS.includes(itemKey)
      || !isSampleGuideDestination(itemKey, location.pathname, records)
      || completedItems.includes(itemKey)
      || sampleGuideVisitRef.current === visitKey
    ) return

    sampleGuideVisitRef.current = visitKey
    persistSampleGuide({
      ...guide,
      completedItems: [...completedItems, itemKey],
    }).then((result) => {
      if (result?.error) sampleGuideVisitRef.current = ''
    })
  }, [companySettings, location.pathname, location.search, settingsContractorId])

  function syncActiveUserProfileLanguage(nextLanguage) {
    if (!activeUserProfileKey || (USE_AUTH && !isAuthenticated)) {
      return
    }

    const normalizedLanguage = normalizeSupportedLanguage(nextLanguage, 'en')

    setUserProfilesByUserId((current) => {
      const existingProfile = current[activeUserProfileKey]

      if (existingProfile?.preferredLanguage === normalizedLanguage) {
        return current
      }

      return {
        ...current,
        [activeUserProfileKey]: {
          ...(existingProfile || {}),
          preferredLanguage: normalizedLanguage,
          timezone: existingProfile?.timezone || 'America/New_York',
        },
      }
    })
  }

  async function syncStoredLanguageSettings(nextAppLanguage = language) {
    const normalizedAppLanguage = normalizeSupportedLanguage(nextAppLanguage, language)

    if (USE_SUPABASE_SETTINGS && (!settingsContractorId || contractorAccess?.membershipStatus !== 'active')) {
      return {
        data: null,
        error: {
          message: t('authContractorSetupRequiredMessage'),
          code: 'MISSING_CONTRACTOR_ID',
        },
      }
    }

    settingsMutationVersionRef.current += 1

    try {
      const response = await dataProvider?.settings?.updateSettings?.(
        {
          ...companySettings,
          appLanguage: normalizedAppLanguage,
          portal: {
            ...(companySettings?.portal || {}),
            defaultLanguage: normalizeSupportedLanguage(portalLanguage, companySettings?.portal?.defaultLanguage || 'en'),
          },
        },
        USE_SUPABASE_SETTINGS
          ? { contractorId: settingsContractorId }
          : {}
      )

      if (response?.error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] App language persistence failed.', response.error)
        }
        return response
      }

      if (response?.data) {
        setCompanySettings(createDefaultCompanySettings(response.data))
      }

      return response || { data: null, error: null, skipped: true }
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] App language persistence threw unexpectedly.', error)
      }

      return {
        data: null,
        error: {
          message: error?.message || t('settingsSaveFailed'),
          code: error?.code || 'SETTINGS_LANGUAGE_SAVE_FAILED',
        },
      }
    } finally {
      settingsMutationVersionRef.current += 1
    }
  }

  async function handleAppLanguageChange(nextLanguage) {
    const normalizedLanguage = normalizeSupportedLanguage(nextLanguage, language)
    const lastConfirmedLanguage = persistedSettingsAppLanguage || normalizeSupportedLanguage(language, 'en')
    setLanguage(normalizedLanguage)

    const settingsResponse = await syncStoredLanguageSettings(normalizedLanguage)

    if (settingsResponse?.error) {
      setLanguage(lastConfirmedLanguage)
      showToast(settingsResponse.error.message || t('settingsSaveFailed'), 'error')
      return settingsResponse
    }

    syncActiveUserProfileLanguage(normalizedLanguage)

    if (isAuthenticated || !USE_AUTH) {
      preferredLanguageSyncRef.current = `${activeUserProfileKey}:${normalizedLanguage}:${remotePreferredLanguage || 'none'}`
      void persistPreferredLanguage(normalizedLanguage)
    }

    return settingsResponse
  }

  function upsertPersistedEstimateRecord(estimateRecord) {
    if (!hasEstimateData(estimateRecord)) return

    writeLinkedEstimateDrafts([
      estimateRecord?.leadId,
      estimateRecord?.projectId,
      estimateRecord?.id,
    ], estimateRecord)

    setPersistedEstimates((current) => {
      const nextId = estimateRecord.id || estimateRecord.number || `estimate-${Date.now()}`
      const existing = current.find((item) => (
        item.id === nextId
        || (estimateRecord.projectId && item.projectId === estimateRecord.projectId)
        || (!estimateRecord.projectId && estimateRecord.leadId && item.leadId === estimateRecord.leadId)
      ))

      if (existing) {
        return dedupeById(current.map((item) => (
          item.id === existing.id
            ? { ...item, ...estimateRecord, id: estimateRecord.id || item.id }
            : item
        )), ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
      }

      return dedupeById([{ ...estimateRecord, id: estimateRecord.id || nextId }, ...current], ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber'])
    })
  }

  function removePersistedEstimateRecord(estimateId) {
    if (!estimateId) return
    setPersistedEstimates((current) => current.filter((estimate) => estimate.id !== estimateId))
  }

  function upsertPersistedContractRecord(contractRecord) {
    if (!hasContractData(contractRecord)) return

    writeLinkedContractDrafts([
      contractRecord?.leadId,
      contractRecord?.projectId,
      contractRecord?.estimateId,
      contractRecord?.id,
    ], contractRecord)

    setPersistedContracts((current) => {
      const nextId = contractRecord.id || contractRecord.number || `contract-${Date.now()}`
      const existing = current.find((item) => (
        item.id === nextId
        || (contractRecord.projectId && item.projectId === contractRecord.projectId)
        || (!contractRecord.projectId && contractRecord.estimateId && item.estimateId === contractRecord.estimateId)
      ))

      if (existing) {
        return dedupeById(current.map((item) => (
          item.id === existing.id
            ? { ...item, ...contractRecord, id: contractRecord.id || item.id }
            : item
        )), ['projectId', 'project_id', 'estimateId', 'estimate_id', 'number', 'contractNumber'])
      }

      return dedupeById([{ ...contractRecord, id: contractRecord.id || nextId }, ...current], ['projectId', 'project_id', 'estimateId', 'estimate_id', 'number', 'contractNumber'])
    })
  }

  function removePersistedContractRecord(contractId) {
    if (!contractId) return
    setPersistedContracts((current) => current.filter((contract) => contract.id !== contractId))
  }

  useClientsBootstrap(setCustomClients)
  useLeadsBootstrap(setLeads)

  useEffect(() => {
    if (!USE_AUTH || !isAuthenticated || isLoading) {
      return
    }

    const normalizedLanguage = normalizeSupportedLanguage(resolvedAuthenticatedLanguage, 'en')
    setLanguage((currentLanguage) => (
      currentLanguage === normalizedLanguage ? currentLanguage : normalizedLanguage
    ))
    syncActiveUserProfileLanguage(normalizedLanguage)
  }, [isAuthenticated, isLoading, resolvedAuthenticatedLanguage])

  useEffect(() => {
    if (!USE_AUTH || !isAuthenticated || isLoading) {
      return
    }

    const preferredLanguageToPersist = localProfilePreferredLanguage || storedAppLanguage || ''

    if (!preferredLanguageToPersist || preferredLanguageToPersist === remotePreferredLanguage) {
      preferredLanguageSyncRef.current = ''
      return
    }

    const syncKey = `${activeUserProfileKey}:${preferredLanguageToPersist}:${remotePreferredLanguage || 'none'}`

    if (preferredLanguageSyncRef.current === syncKey) {
      return
    }

    preferredLanguageSyncRef.current = syncKey
    void persistPreferredLanguage(preferredLanguageToPersist)
  }, [activeUserProfileKey, isAuthenticated, isLoading, localProfilePreferredLanguage, persistPreferredLanguage, remotePreferredLanguage, storedAppLanguage])

  useEffect(() => {
    writeStoredUserProfiles(userProfilesByUserId)
  }, [userProfilesByUserId])

  useEffect(() => {
    if (USE_SUPABASE_LEADS) return
    writeStoredLeads(leads)
  }, [leads])

  useEffect(() => {
    if (USE_SUPABASE_CLIENTS) return
    writeStoredCustomClients(customClients)
  }, [customClients])

  useEffect(() => {
    if (!USE_AUTH || contractorAccess?.membershipStatus !== 'active' || !settingsContractorId) {
      return
    }

    setCompanySettings((current) => createDefaultCompanySettings({
      ...current,
      company: {
        ...(current?.company || {}),
        name: company?.name || contractorAccess?.contractorRecord?.company_name || current?.company?.name || '',
        ownerName: contractor?.fullName || contractorAccess?.contractorRecord?.owner_name || current?.company?.ownerName || '',
        phone: contractorAccess?.contractorRecord?.phone || current?.company?.phone || '',
        email: contractorAccess?.contractorRecord?.email || user?.email || current?.company?.email || '',
        address: contractorAccess?.contractorRecord?.business_address || current?.company?.address || '',
      },
    }))
  }, [company?.name, contractor?.fullName, contractorAccess?.contractorRecord?.business_address, contractorAccess?.contractorRecord?.company_name, contractorAccess?.contractorRecord?.email, contractorAccess?.contractorRecord?.owner_name, contractorAccess?.contractorRecord?.phone, contractorAccess?.membershipStatus, settingsContractorId, user?.email])

  useEffect(() => {
    let isCancelled = false

    if (USE_SUPABASE_SETTINGS && (!settingsContractorId || contractorAccess?.membershipStatus !== 'active')) {
      return undefined
    }

    async function loadCompanySettings() {
      const loadVersion = settingsMutationVersionRef.current
      const response = await dataProvider?.settings?.getSettings?.(
        USE_SUPABASE_SETTINGS
          ? { contractorId: settingsContractorId }
          : {}
      )

      if (isCancelled || loadVersion !== settingsMutationVersionRef.current) return

      if (response?.error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] App settings bootstrap failed.', response.error)
        }
        return
      }

      if (response?.data) {
        const persistedSettings = createDefaultCompanySettings(response.data)
        setCompanySettings(persistedSettings)
        setLanguage(normalizeSupportedLanguage(persistedSettings.appLanguage, 'en'))
        if (response.data.portal?.defaultLanguage) {
          setPortalLanguage(normalizeSupportedLanguage(response.data.portal.defaultLanguage, 'en'))
        }
      }
    }

    loadCompanySettings()

    return () => {
      isCancelled = true
    }
  }, [contractorAccess?.membershipStatus, settingsContractorId])

  useEffect(() => {
    let isCancelled = false

    if ((!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) || !projectsContractorId) {
      setPersistedEstimates([])
      return undefined
    }

    async function loadPersistedEstimates() {
      const response = await dataProvider.estimates.list({
        contractorId: projectsContractorId,
        includeArchived: true,
      })

      if (isCancelled || response?.error || !Array.isArray(response?.data)) {
        return
      }

      response.data.forEach((estimate) => {
        writeLinkedEstimateDrafts([
          estimate?.leadId,
          estimate?.projectId,
          estimate?.id,
        ], estimate)
      })

      setPersistedEstimates(dedupeById(response.data, ['projectId', 'project_id', 'leadId', 'lead_id', 'number', 'estimateNumber']))
    }

    loadPersistedEstimates()

    return () => {
      isCancelled = true
    }
  }, [projectsContractorId])

  useEffect(() => {
    let isCancelled = false

    if ((!USE_SUPABASE && !USE_SUPABASE_CONTRACTS) || !projectsContractorId) {
      setPersistedContracts([])
      return undefined
    }

    async function loadPersistedContracts() {
      const response = await dataProvider.contracts.list({
        contractorId: projectsContractorId,
        includeArchived: true,
      })

      if (isCancelled || response?.error || !Array.isArray(response?.data)) {
        return
      }

      response.data.forEach((contract) => {
        writeLinkedContractDrafts([
          contract?.leadId,
          contract?.estimateId,
          contract?.projectId,
          contract?.id,
        ], contract)
      })

      setPersistedContracts(dedupeById(response.data, ['projectId', 'project_id', 'estimateId', 'estimate_id', 'number', 'contractNumber']))
    }

    loadPersistedContracts()

    return () => {
      isCancelled = true
    }
  }, [projectsContractorId])

  useEffect(() => {
    let isCancelled = false

    const requiresContractorId = USE_SUPABASE || USE_SUPABASE_PAYMENTS

    if (requiresContractorId && !invoicesContractorId) {
      setPersistedPayments([])
      return undefined
    }

    async function loadPersistedPayments() {
      const response = await dataProvider.payments.list({
        contractorId: invoicesContractorId,
        includeArchived: true,
      })

      if (isCancelled || response?.error || !Array.isArray(response?.data)) {
        if (!isCancelled) {
          setPersistedPayments([])
        }
        return
      }

      setPersistedPayments(dedupePayments(response.data))
    }

    loadPersistedPayments()

    return () => {
      isCancelled = true
    }
  }, [invoicesContractorId])

  useEffect(() => {
    let isCancelled = false
    const requiresContractorId = USE_SUPABASE || USE_SUPABASE_INVOICES

    if (requiresContractorId && !invoicesContractorId) {
      setInvoiceRecords([])
      setAreInvoicesLoaded(false)
      return undefined
    }

    async function loadInvoices() {
      setAreInvoicesLoaded(false)

      const response = await dataProvider.invoices.list({
        contractorId: invoicesContractorId,
        includeArchived: true,
      })

      if (isCancelled) return

      if (response?.error || !Array.isArray(response?.data)) {
        setInvoiceRecords([])
        setAreInvoicesLoaded(true)
        return
      }

      setInvoiceRecords(dedupeInvoiceRecords(response.data))
      setAreInvoicesLoaded(true)
    }

    loadInvoices()

    return () => {
      isCancelled = true
    }
  }, [invoicesContractorId])

  useEffect(() => {
    let isCancelled = false

    if ((!USE_SUPABASE && !USE_SUPABASE_EVENTS) || !eventsContractorId) {
      if (!USE_SUPABASE_EVENTS) {
        setScheduleEvents(mockScheduleEvents)
      } else {
        setScheduleEvents([])
      }
      return undefined
    }

    async function loadPersistedEvents() {
      const response = await dataProvider.events.list({
        contractorId: eventsContractorId,
        includeArchived: true,
      })

      if (isCancelled || response?.error || !Array.isArray(response?.data)) {
        return
      }

      setScheduleEvents(sortScheduleEventRecords(response.data))
    }

    loadPersistedEvents()

    return () => {
      isCancelled = true
    }
  }, [eventsContractorId])

  const visibleLeads = useMemo(() => leads
    .filter((lead) => !archives.deletedLeadIds.includes(lead.id))
    .map((lead) => mergePersistedDocumentsIntoLead(lead, persistedEstimates, persistedContracts)), [archives.deletedLeadIds, leads, persistedContracts, persistedEstimates])
  const activeLeads = useMemo(() => visibleLeads.filter((lead) => !isLeadArchivedRecord(lead, archives.leadIds)), [visibleLeads, archives.leadIds])
  const clients = useMemo(() => buildClientProfiles(visibleLeads, customClients).filter((client) => !archives.deletedClientIds.includes(client.id)), [visibleLeads, customClients, archives.deletedClientIds])
  const visibleScheduleEvents = useMemo(() => sortScheduleEventRecords(scheduleEvents.filter((event) => !archives.deletedScheduleEventIds.includes(event.id))), [scheduleEvents, archives.deletedScheduleEventIds])
  const activeScheduleEvents = useMemo(() => visibleScheduleEvents.filter((event) => !archives.scheduleEventIds.includes(event.id) && !event.archivedAt), [visibleScheduleEvents, archives.scheduleEventIds])
  const invoices = useMemo(() => dedupeInvoiceRecords(
    invoiceRecords.map((invoice) => hydrateInvoiceRecord(invoice, {
      leads: visibleLeads,
      payments: persistedPayments,
      defaultContractorId: invoicesContractorId,
    }))
  ), [invoiceRecords, invoicesContractorId, persistedPayments, visibleLeads])
  const mobileTodaySummary = useMemo(() => {
    const todayKey = buildDateKey(new Date())
    const findLeadByAnyId = (...ids) => {
      const normalizedIds = ids.map((id) => String(id || '').trim()).filter(Boolean)
      if (normalizedIds.length === 0) return null

      return visibleLeads.find((lead) => normalizedIds.includes(String(lead.id || '').trim())
        || normalizedIds.includes(String(lead.projectId || '').trim())
        || normalizedIds.includes(String(lead.project_id || '').trim()))
    }
    const resolveProjectRouteId = (record = {}) => {
      const matchedLead = findLeadByAnyId(record.projectId, record.project_id, record.leadId, record.lead_id, record.id)
      return matchedLead?.projectId
        || matchedLead?.project_id
        || record.projectId
        || record.project_id
        || matchedLead?.id
        || record.leadId
        || record.lead_id
        || ''
    }

    const todayEvent = activeScheduleEvents.find((event) => {
      const eventDate = toDateKey(event?.date || event?.eventDate || event?.event_date || event?.startsAt || event?.starts_at)
      return eventDate === todayKey
    })

    if (todayEvent) {
      const projectRouteId = resolveProjectRouteId(todayEvent)
      const eventTime = todayEvent.time || todayEvent.startTime || todayEvent.start_time || ''
      const eventLabel = todayEvent.type || todayEvent.eventType || todayEvent.event_type || todayEvent.title || t('todayScheduledJob')
      const clientName = todayEvent.clientName
        || findLeadByAnyId(todayEvent.leadId, todayEvent.projectId)?.client
        || ''
      const projectTitle = todayEvent.projectTitle || ''
      const eventTitle = todayEvent.title || ''
      const supportingLine = clientName || projectTitle || eventTitle || t('todayScheduledJob')
      const eventHeadline = [eventTime, eventLabel]
        .filter(Boolean)
        .join(' ')

      return {
        title: t('today'),
        headline: eventHeadline || t('todayScheduledJob'),
        supporting: supportingLine,
        to: projectRouteId ? `/projects/${projectRouteId}` : appRoutes.calendar,
      }
    }

    const estimateLead = visibleLeads.find((lead) => getLeadPipelineStage(lead) === leadPipelineStages.ESTIMATE_CREATED)

    if (estimateLead) {
      return {
        title: t('today'),
        headline: t('todayEstimateReady'),
        supporting: t('todaySendEstimateForProject', { project: estimateLead.projectTitle || estimateLead.projectType || estimateLead.client || t('estimate') }),
        to: `/projects/${estimateLead.id}/estimate`,
      }
    }

    const contractLead = visibleLeads.find((lead) => {
      const contract = hasContractData(lead?.portal?.contract) ? lead.portal.contract : readLinkedContractDraft(lead)
      if (!hasContractData(contract)) return false

      const contractStatus = String(contract?.status || '').trim().toLowerCase()
      const signed = Boolean(
        contract?.signedAt
        || contract?.signed_at
        || contract?.signedDate
        || contract?.isSigned
        || contractStatus === 'signed'
      )

      return !signed && ['sent', 'draft', 'pending', 'pending_signature', 'viewed'].includes(contractStatus || 'draft')
    })

    if (contractLead) {
      return {
        title: t('today'),
        headline: t('todayContractAwaitingSignature'),
        supporting: contractLead.projectTitle || contractLead.projectType || contractLead.client || t('contracts'),
        to: `/projects/${contractLead.id}/contract`,
      }
    }

    const overdueInvoice = invoices.find((invoice) => {
      const remainingBalance = Math.max(Number(invoice?.amount || 0) - Number(invoice?.amountPaid || 0), 0)
      if (remainingBalance <= 0) return false

      const invoiceStatus = String(invoice?.status || '').trim().toLowerCase()
      if (invoiceStatus === 'overdue') return true

      const dueDate = new Date(invoice?.dueDate || '')
      return !Number.isNaN(dueDate.getTime()) && buildDateKey(dueDate) < todayKey
    })

    if (overdueInvoice) {
      const remainingBalance = Math.max(Number(overdueInvoice?.amount || 0) - Number(overdueInvoice?.amountPaid || 0), 0)
      const customerName = overdueInvoice.client || findLeadByAnyId(overdueInvoice.leadId, overdueInvoice.projectId)?.client || t('client')

      return {
        title: t('today'),
        headline: t('todayOverdueInvoice'),
        supporting: t('todayCustomerAmountLine', { name: customerName, amount: currency.format(remainingBalance), suffix: t('todayDueSuffix') }),
        to: `/invoices/${overdueInvoice.id}`,
      }
    }

    const outstandingProject = visibleLeads
      .map((lead) => {
        const outstandingBalance = Math.max(
          Number(
            lead?.portal?.outstandingBalance
            ?? lead?.remainingBalance
            ?? lead?.remaining
            ?? ((lead?.portal?.contractAmount || lead?.contractValue || lead?.value || 0) - (lead?.portal?.amountPaid || 0))
          ) || 0,
          0,
        )

        return {
          lead,
          outstandingBalance,
        }
      })
      .find((record) => record.outstandingBalance > 0)

    if (outstandingProject) {
      return {
        title: t('today'),
        headline: t('todayOutstandingBalance'),
        supporting: t('todayCustomerAmountLine', {
          name: outstandingProject.lead.client || t('client'),
          amount: currency.format(outstandingProject.outstandingBalance),
          suffix: t('todayRemainingSuffix'),
        }),
        to: `/projects/${outstandingProject.lead.id}`,
      }
    }

    return {
      title: t('today'),
      headline: t('todayCaughtUp'),
      supporting: t('todayNothingRequiresAttention'),
      to: appRoutes.dashboard,
    }
  }, [activeScheduleEvents, invoices, t, visibleLeads])

  const metrics = useMemo(() => {
    const pipelineCounts = getLeadPipelineStageCounts(activeLeads)
    const newLeads = pipelineCounts.newLeads
    const estimates = pipelineCounts.estimatesToSend + pipelineCounts.followUpsDue
    const activeJobs = pipelineCounts.readyForJob + pipelineCounts.byStage[leadPipelineStages.CONVERTED_TO_JOB]
    const pipelineValue = activeLeads.reduce((sum, lead) => sum + lead.value, 0)

    return [
      { label: t('metricNewLeads'), value: newLeads, helper: t('metricNewLeadsHelper'), icon: Users, tone: 'blue' },
      { label: t('metricActiveEstimates'), value: estimates, helper: t('metricActiveEstimatesHelper'), icon: ClipboardList, tone: 'violet' },
      { label: t('metricJobsInProgress'), value: activeJobs, helper: t('metricJobsInProgressHelper'), icon: BriefcaseBusiness, tone: 'amber' },
      { label: t('metricRevenuePipeline'), value: currency.format(pipelineValue), helper: t('metricRevenuePipelineHelper'), icon: DollarSign, tone: 'emerald' },
    ]
  }, [activeLeads, t])

  function addNotification(titleKey, messageKey) {
    setNotifications((current) => [
      { id: `notif-${Date.now()}`, titleKey, messageKey, timeKey: 'justNow', read: false },
      ...current,
    ])
  }

  function markAllNotificationsRead() {
    setNotifications((current) => current.map((notification) => ({ ...notification, read: true })))
  }

  function clearNotifications() {
    setNotifications([])
  }

  function updateArchiveList(listName, id, mode) {
    setArchives((current) => {
      const currentList = current[listName] || []
      const nextList = mode === 'add'
        ? [...new Set([...currentList, id])]
        : currentList.filter((itemId) => itemId !== id)
      return { ...current, [listName]: nextList }
    })
  }

  function archiveLeadRecord(id) {
    const resolvedLeadId = findLeadByProjectLookup(leads, id)?.id || id

    updateArchiveList('leadIds', resolvedLeadId, 'add')
    const archivedAt = new Date().toISOString()
    setLeads((current) => current.map((lead) => (
      lead.id === resolvedLeadId
        ? { ...lead, archivedAt, archived_at: archivedAt, isArchived: true }
        : lead
    )))
    showToast(t('itemArchived'))
  }

  function restoreLeadRecord(id) {
    const resolvedLeadId = findLeadByProjectLookup(leads, id)?.id || id

    updateArchiveList('leadIds', resolvedLeadId, 'remove')
    setLeads((current) => current.map((lead) => (
      lead.id === resolvedLeadId
        ? { ...lead, archivedAt: null, archived_at: null, isArchived: false }
        : lead
    )))
    showToast(t('itemRestored'))
  }

  function deleteLeadRecord(id) {
    const resolvedLeadId = findLeadByProjectLookup(leads, id)?.id || id

    updateArchiveList('deletedLeadIds', resolvedLeadId, 'add')
    showToast(t('itemDeletedPermanently'))
  }

  function archiveProjectRecord(id) {
    updateArchiveList('projectIds', id, 'add')
    showToast(t('itemArchived'))
  }

  function restoreProjectRecord(id) {
    updateArchiveList('projectIds', id, 'remove')
    showToast(t('itemRestored'))
  }

  function deleteProjectRecord(id) {
    updateArchiveList('deletedProjectIds', id, 'add')
  }

  const archiveRecord = {
    lead: archiveLeadRecord,
    project: archiveProjectRecord,
    job: archiveProjectRecord,
    estimate: archiveLeadRecord,
    client: archiveClientRecord,
    invoice: (id) => { updateArchiveList('invoiceIds', id, 'add'); showToast(t('itemArchived')) },
    scheduleEvent: (id) => {
      const archivedAt = new Date().toISOString()
      updateArchiveList('scheduleEventIds', id, 'add')
      setScheduleEvents((current) => current.map((event) => (
        event.id === id ? { ...event, archivedAt, archived_at: archivedAt } : event
      )))
      showToast(t('itemArchived'))
    },
  }

  const restoreRecord = {
    lead: restoreLeadRecord,
    project: restoreProjectRecord,
    job: restoreProjectRecord,
    estimate: restoreLeadRecord,
    client: restoreClientRecord,
    invoice: (id) => { updateArchiveList('invoiceIds', id, 'remove'); showToast(t('itemRestored')) },
    scheduleEvent: (id) => {
      updateArchiveList('scheduleEventIds', id, 'remove')
      setScheduleEvents((current) => current.map((event) => (
        event.id === id ? { ...event, archivedAt: null, archived_at: null } : event
      )))
      showToast(t('itemRestored'))
    },
  }

  const deleteRecord = {
    lead: deleteLeadRecord,
    project: deleteProjectRecord,
    job: deleteProjectRecord,
    estimate: deleteLeadRecord,
    client: deleteClientRecord,
    invoice: (id) => { updateArchiveList('deletedInvoiceIds', id, 'add'); showToast(t('itemDeletedPermanently')) },
    scheduleEvent: (id) => {
      updateArchiveList('deletedScheduleEventIds', id, 'add')
      setScheduleEvents((current) => current.filter((event) => event.id !== id))
      showToast(t('itemDeletedPermanently'))
    },
  }

  function upsertLeadState(leadRecord) {
    if (!leadRecord) return null

    const normalizedLeadRecord = normalizeLeadLanguageRecord(
      normalizeLeadTitleFields(leadRecord),
      leadRecord?.clientLanguage || language
    )
    const id = normalizedLeadRecord.id || `lead-${Date.now()}`
    const linkedEstimate = hasEstimateData(normalizedLeadRecord?.portal?.estimate)
      ? normalizedLeadRecord.portal.estimate
      : readLinkedEstimateDraft(normalizedLeadRecord, id)
    const resolvedValue = resolveEstimateTotal(normalizedLeadRecord, linkedEstimate)
    const nextLead = withLeadPipelineStage({
      id,
      ...normalizedLeadRecord,
      value: resolvedValue,
      estimatedValue: resolveEstimateTotal({ estimatedValue: normalizedLeadRecord.estimatedValue }, linkedEstimate, resolvedValue),
      projectStatus: normalizedLeadRecord.projectStatus || (normalizedLeadRecord.status === 'Won' ? 'Signed' : 'Lead'),
      portal: {
        ...(normalizedLeadRecord.portal || {}),
        ...(linkedEstimate ? { estimate: linkedEstimate } : {}),
      },
    })

    if (nextLead.leadPipelineStage) {
      writeLeadPipelineStage(id, nextLead.leadPipelineStage)
    }

    setLeads((current) => {
      const existing = current.find((item) => item.id === id)

      if (existing) {
        return current.map((item) => (item.id === id ? { ...item, ...nextLead, id } : item))
      }

      return [nextLead, ...current]
    })

    return nextLead
  }

  function createLead(lead) {
    const persistedLead = upsertLeadState({
      ...lead,
      leadPipelineStage: lead.leadPipelineStage || getLeadPipelineStage(lead),
    })
    showToast(t('leadCreated'))
    return persistedLead?.id || ''
  }

function buildWorkspaceJobRecord(job, clientRecord = null) {
    const linkedEstimate = hasEstimateData(job?.portal?.estimate)
      ? job.portal.estimate
      : readLinkedEstimateDraft(job)
    const clientName = job?.client || job?.clientName || job?.customerName || clientRecord?.name || ''
    const projectValue = resolveEstimateTotal(job, linkedEstimate)
    const projectStatus = job?.projectStatus || 'Scheduled'
    const amountPaid = projectStatus === 'Paid' ? projectValue : 0
    const outstandingBalance = Math.max(projectValue - amountPaid, 0)
    const address = job?.address || job?.location || clientRecord?.address || ''

  const projectRecordId = job?.id || createLocalRecordId('project')

  return {
      id: projectRecordId,
      projectId: job?.projectId || job?.project_id || projectRecordId,
      project_id: job?.projectId || job?.project_id || projectRecordId,
      contractorId: job?.contractorId || undefined,
      clientId: job?.clientId || clientRecord?.id || '',
      leadId: job?.leadId || job?.lead_id || '',
      estimateId: job?.estimateId || linkedEstimate?.id || null,
      client: clientName || t('newClientFallback'),
      clientName: clientName || t('newClientFallback'),
      customerName: clientName || t('newClientFallback'),
      phone: job?.phone || clientRecord?.phone || '',
      email: job?.email || clientRecord?.email || '',
      clientLanguage: job?.clientLanguage || clientRecord?.preferredLanguage || '',
      address,
      location: job?.location || address,
      projectTitle: job?.projectTitle || job?.title || job?.projectType || t('jobs'),
      projectType: job?.projectType || job?.projectTitle || t('jobs'),
      value: projectValue,
      estimatedValue: resolveEstimateTotal({ estimatedValue: job?.estimatedValue }, linkedEstimate, projectValue),
      contractValue: resolveEstimateTotal({ contractValue: job?.contractValue }, linkedEstimate, projectValue),
      source: job?.source || 'Direct Job',
      priority: job?.priority || 'Medium',
      notes: job?.notes || '',
      nextStep: job?.nextStep || job?.notes || t('jobReadyToManage'),
      status: 'Won',
      projectStatus,
      portal: {
        ...(job?.portal || {}),
        contractAmount: Number(job?.contractValue ?? projectValue) || 0,
        depositRequired: job?.portal?.depositRequired ?? Math.round(projectValue * 0.5),
        amountPaid,
        outstandingBalance,
        paymentStatus: projectStatus === 'Paid' ? 'Paid in Full' : job?.portal?.paymentStatus || 'Not Paid',
        startDate: job?.startDate || job?.portal?.startDate || '',
        estimatedCompletion: job?.targetCompletion || job?.portal?.estimatedCompletion || '',
        timeline: job?.portal?.timeline || [],
        photos: job?.portal?.photos || [],
        documents: job?.portal?.documents || [],
        estimate: linkedEstimate || job?.portal?.estimate,
        contract: job?.portal?.contract,
      },
    }
  }

  function createJob(job, clientRecord = null) {
    const workspaceJob = buildWorkspaceJobRecord(job, clientRecord)
    const nextJob = {
      ...workspaceJob,
      leadPipelineStage: workspaceJob.leadPipelineStage || leadPipelineStages.CONVERTED_TO_JOB,
    }

    updateArchiveList('leadIds', nextJob.id, 'remove')
    updateArchiveList('deletedLeadIds', nextJob.id, 'remove')
    if (nextJob.leadPipelineStage) {
      writeLeadPipelineStage(nextJob.id, nextJob.leadPipelineStage)
    }
    setLeads((current) => {
      const existing = current.find((item) => item.id === nextJob.id)
      if (existing) {
        return current.map((item) => (item.id === nextJob.id ? { ...item, ...nextJob, id: nextJob.id } : item))
      }

      return [nextJob, ...current]
    })
    showToast(t('jobCreated'))
  }

  function upsertClientSilently(clientRecord) {
    if (!clientRecord?.id) return

    setCustomClients((current) => {
      const normalizedClientRecord = normalizeClientLanguageRecord(clientRecord)
      const existing = current.find((item) => item.id === clientRecord.id)
      if (existing) return current.map((item) => (item.id === clientRecord.id ? { ...item, ...normalizedClientRecord, id: clientRecord.id } : item))
      return [normalizedClientRecord, ...current]
    })
  }

  function findClientForLead(leadRecord) {
    const requestedClientId = leadRecord?.clientId || leadRecord?.client_id || ''
    const normalizedClientName = normalizeComparableText(leadRecord?.client || leadRecord?.clientName || leadRecord?.customerName || '')
    const normalizedPhone = normalizeComparableText(leadRecord?.phone || '')
    const normalizedEmail = normalizeComparableText(leadRecord?.email || '')

    if (requestedClientId) {
      const clientById = clients.find((client) => client.id === requestedClientId)
      if (clientById) {
        return clientById
      }
    }

    if (!normalizedClientName) {
      return null
    }

    return clients.find((client) => {
      const candidateName = normalizeComparableText(client?.displayName || client?.name || '')
      if (!candidateName || candidateName !== normalizedClientName) {
        return false
      }

      const candidatePhone = normalizeComparableText(client?.phone || '')
      const candidateEmail = normalizeComparableText(client?.email || '')

      if (normalizedEmail && candidateEmail && normalizedEmail !== candidateEmail) {
        return false
      }

      if (normalizedPhone && candidatePhone && normalizedPhone !== candidatePhone) {
        return false
      }

      return true
    }) || null
  }

  async function ensureClientForLeadConversion(leadRecord) {
    const matchedClient = findClientForLead(leadRecord)
    const matchedClientId = matchedClient?.id || ''
    const requiresUuid = USE_SUPABASE || USE_SUPABASE_CLIENTS

    if (matchedClientId && (!requiresUuid || isUuid(matchedClientId))) {
      return matchedClient
    }

    const clientName = String(leadRecord?.client || leadRecord?.clientName || leadRecord?.customerName || '').trim()
    if (!clientName) {
      return null
    }

    const fallbackClientId = getClientSlug(clientName) || `client-${Date.now()}`
    const resolvedClientLanguage = resolvePreferredClientLanguage({
      lead: leadRecord,
      userLanguage: language,
    })
    const clientDraft = {
      id: fallbackClientId,
      name: clientName,
      displayName: clientName,
      phone: leadRecord?.phone || '',
      email: leadRecord?.email || '',
      address: leadRecord?.address || leadRecord?.location || '',
      preferredLanguage: resolvedClientLanguage,
    }

    try {
      const clientResponse = await dataProvider?.clients?.create?.(clientDraft, {
        contractorId: clientsContractorId,
      })

      if (clientResponse?.error) {
        showToast(clientResponse.error.message || t('leadClientLinkFailed'), 'error')
        logLeadConversionDevError('[dev] Failed to create or link a client during lead conversion.', clientResponse.error, {
          leadId: leadRecord?.id || null,
          clientDraft,
        })
        return null
      }

      const persistedClient = {
        ...clientDraft,
        ...(clientResponse?.data || {}),
        id: clientResponse?.data?.id || clientDraft.id,
      }

      if (requiresUuid && !isUuid(persistedClient.id)) {
        const error = new Error('Client conversion linkage did not return a valid uuid.')
        showToast(t('leadClientLinkFailed'), 'error')
        logLeadConversionDevError('[dev] Client conversion linkage returned an invalid id.', error, {
          leadId: leadRecord?.id || null,
          clientDraft,
          clientResponse,
        })
        return null
      }

      upsertClientSilently(persistedClient)
      return persistedClient
    } catch (error) {
      showToast(error?.message || t('leadClientLinkFailed'), 'error')
      logLeadConversionDevError('[dev] Client conversion linkage threw unexpectedly.', error, {
        leadId: leadRecord?.id || null,
        clientDraft,
      })
      return null
    }
  }

  async function ensureProjectForLeadConversion(sourceLead, { leadId = sourceLead?.id, estimateRecord = null, silent = false, successToastKey = 'jobCreated' } = {}) {
    const linkedClientRecord = await ensureClientForLeadConversion(sourceLead)
    const linkedClientId = linkedClientRecord?.id || sourceLead?.clientId || sourceLead?.client_id || null
    const requiresClientLink = Boolean(String(sourceLead?.client || sourceLead?.clientName || sourceLead?.customerName || '').trim())
    const requiresPersistedProjectId = USE_SUPABASE || USE_SUPABASE_PROJECTS

    if (requiresClientLink && !linkedClientId) {
      logLeadConversionDevError('[dev] Lead conversion stopped because no client could be linked.', null, {
        leadId,
        sourceLead,
      })
      return null
    }

    const existingProjectId = sourceLead.projectId || sourceLead.project_id || ''
    const fallbackProjectId = !requiresPersistedProjectId ? (existingProjectId || leadId) : ''
    const sourceEstimate = hasEstimateData(estimateRecord)
      ? estimateRecord
      : hasEstimateData(sourceLead?.portal?.estimate)
        ? sourceLead.portal.estimate
        : readLinkedEstimateDraft(sourceLead || leadId, leadId)
    const projectDraft = buildProjectFromLead({
      ...sourceLead,
      ...(linkedClientId ? { clientId: linkedClientId, client_id: linkedClientId } : {}),
      client: linkedClientRecord?.displayName || linkedClientRecord?.name || sourceLead?.client,
      clientName: linkedClientRecord?.displayName || linkedClientRecord?.name || sourceLead?.clientName || sourceLead?.client,
      customerName: linkedClientRecord?.displayName || linkedClientRecord?.name || sourceLead?.customerName || sourceLead?.client,
    }, fallbackProjectId, sourceEstimate)
    let linkedProject = existingProjectId && (!requiresPersistedProjectId || isUuid(existingProjectId))
      ? { id: existingProjectId }
      : null
    let reusedExistingProject = Boolean(linkedProject)

    if (!linkedProject && (USE_SUPABASE || USE_SUPABASE_PROJECTS)) {
      try {
        const existingProjectResponse = await dataProvider?.projects?.list?.({
          contractorId: projectsContractorId,
          leadId,
          includeArchived: true,
        })

        if (existingProjectResponse?.error) {
          showToast(existingProjectResponse.error.message || t('jobCreateFailed'), 'error')
          logLeadConversionDevError('[dev] Failed to look up an existing project before lead conversion.', existingProjectResponse.error, {
            leadId,
          })
          return null
        }

        if (existingProjectResponse?.data?.[0]) {
          linkedProject = existingProjectResponse.data[0]
          reusedExistingProject = true
        }
      } catch (error) {
        showToast(error?.message || t('jobCreateFailed'), 'error')
        logLeadConversionDevError('[dev] Existing project lookup threw before lead conversion.', error, {
          leadId,
        })
        return null
      }
    }

    if (!linkedProject) {
      try {
        const projectResponse = await dataProvider?.projects?.create?.(projectDraft, {
          contractorId: projectsContractorId,
        })

        if (projectResponse?.error) {
          showToast(projectResponse.error.message || t('jobCreateFailed'), 'error')
          logLeadConversionDevError('[dev] Failed to create project during lead conversion.', projectResponse.error, {
            leadId,
            projectDraft,
          })
          return null
        }

        linkedProject = projectResponse?.data || projectDraft
      } catch (error) {
        showToast(error?.message || t('jobCreateFailed'), 'error')
        logLeadConversionDevError('[dev] Project creation threw during lead conversion.', error, {
          leadId,
          projectDraft,
        })
        return null
      }
    }

    const linkedProjectId = linkedProject?.id || fallbackProjectId
    const estimateTotal = resolveEstimateTotal(sourceLead, sourceEstimate)
    let linkedEstimateId = sourceEstimate?.id || sourceLead?.estimateId || null
    let persistedProjectEstimate = sourceEstimate || null

    if (!linkedProjectId || (requiresPersistedProjectId && !isUuid(linkedProjectId))) {
      showToast(t('contractRequiresRealProject'), 'error')
      logLeadConversionDevError('[dev] Lead conversion did not receive a real persisted project id.', null, {
        leadId,
        linkedProject,
      })
      return null
    }

    if (sourceEstimate) {
      const linkedEstimate = {
        ...sourceEstimate,
        id: sourceEstimate?.id || null,
        leadId,
        projectId: linkedProjectId,
        project_id: linkedProjectId,
        clientId: linkedClientId || sourceEstimate?.clientId || sourceEstimate?.client_id || null,
        client_id: linkedClientId || sourceEstimate?.clientId || sourceEstimate?.client_id || null,
        projectTitle: sourceLead?.projectTitle || sourceLead?.projectType || sourceEstimate?.projectTitle || 'Estimate',
        total: resolveEstimateTotal(sourceLead, sourceEstimate),
      }
      writeLinkedEstimateDrafts([leadId, linkedProjectId, linkedEstimate.id], linkedEstimate)

      try {
        const estimateResponse = sourceEstimate?.id
          ? await dataProvider?.estimates?.update?.(sourceEstimate.id, linkedEstimate, { contractorId: projectsContractorId })
          : await dataProvider?.estimates?.create?.(linkedEstimate, { contractorId: projectsContractorId })

        if (estimateResponse?.error) {
          showToast(estimateResponse.error.message || t('estimateLinkToProjectFailed'), 'error')
          logLeadConversionDevError('[dev] Failed to link estimate to the new project during lead conversion.', estimateResponse.error, {
            leadId,
            projectId: linkedProjectId,
            estimate: linkedEstimate,
          })
          return null
        }

        const persistedEstimate = {
          ...linkedEstimate,
          ...(estimateResponse?.data || {}),
          id: estimateResponse?.data?.id || linkedEstimate.id,
        }

        linkedEstimateId = persistedEstimate.id || linkedEstimateId
        persistedProjectEstimate = persistedEstimate
        writeLinkedEstimateDrafts([leadId, linkedProjectId, persistedEstimate.id], persistedEstimate)
      } catch (error) {
        if (!sourceEstimate?.id || USE_SUPABASE_PROJECTS) {
          showToast(error?.message || t('estimateLinkToProjectFailed'), 'error')
          logLeadConversionDevError('[dev] Estimate linkage threw during lead conversion.', error, {
            leadId,
            projectId: linkedProjectId,
            estimate: linkedEstimate,
          })
          return null
        }
      }
    }

    try {
      await dataProvider?.projects?.update?.(linkedProjectId, {
        leadId,
        clientId: linkedClientId,
        projectTitle: sourceLead?.projectTitle || sourceLead?.projectType || projectDraft.projectTitle,
        projectType: sourceLead?.projectType || sourceLead?.projectTitle || projectDraft.projectType,
        value: estimateTotal,
        estimatedValue: estimateTotal,
        contractValue: estimateTotal,
        source: sourceLead?.source || 'Direct Job',
        priority: sourceLead?.priority || 'Medium',
        startDate: sourceLead?.startDate || sourceLead?.portal?.startDate || '',
      }, {
        contractorId: projectsContractorId,
      })
    } catch (error) {
      logLeadConversionDevError('[dev] Failed to sync project fields during lead conversion.', error, {
        leadId,
        projectId: linkedProjectId,
      })
    }

    const nextLead = withLeadPipelineStage(buildLeadPipelineTransition({
      ...sourceLead,
      projectId: linkedProjectId,
      project_id: linkedProjectId,
      clientId: linkedClientId,
      client_id: linkedClientId,
      estimateId: linkedEstimateId,
      value: estimateTotal,
      estimatedValue: estimateTotal,
      projectStatus: 'Scheduled',
    }, leadPipelineStages.CONVERTED_TO_JOB))

    let responseData = null

    try {
      const response = await dataProvider?.leads?.update?.(leadId, {
        projectId: linkedProjectId,
        clientId: linkedClientId,
        estimateId: linkedEstimateId,
        value: estimateTotal,
        estimatedValue: estimateTotal,
        status: nextLead.status,
        leadPipelineStage: nextLead.leadPipelineStage,
      }, {
        contractorId: leadsContractorId,
      })

      if (response?.error) {
        showToast(response.error.message || t('leadLinkToJobFailed'), 'error')
        logLeadConversionDevError('[dev] Lead conversion could not link the new project to the lead.', response.error, {
          leadId,
          projectId: linkedProjectId,
        })
        return null
      }

      responseData = response?.data || null
    } catch (error) {
      showToast(error?.message || t('leadLinkToJobFailed'), 'error')
      logLeadConversionDevError('[dev] Lead update threw after project creation during conversion.', error, {
        leadId,
        projectId: linkedProjectId,
      })
      return null
    }

    writeLeadPipelineStage(leadId, nextLead.leadPipelineStage)
    const persistedLead = withLeadPipelineStage({
      ...sourceLead,
      ...(responseData || {}),
      ...nextLead,
      id: leadId,
      projectId: linkedProjectId,
      project_id: linkedProjectId,
      clientId: linkedClientId,
      client_id: linkedClientId,
      estimateId: linkedEstimateId,
      value: estimateTotal,
      estimatedValue: estimateTotal,
      projectStatus: 'Scheduled',
      archivedAt: null,
      archived_at: null,
      isArchived: false,
      portal: {
        ...(sourceLead?.portal || {}),
        ...(persistedProjectEstimate ? { estimate: { ...persistedProjectEstimate, leadId, projectId: linkedProjectId, project_id: linkedProjectId, total: estimateTotal } } : {}),
      },
    })

    setLeads((current) => current.map((lead) => (lead.id === leadId ? persistedLead : lead)))

    if (!silent) {
      showToast(reusedExistingProject ? t('leadAlreadyConvertedToJob') : t(successToastKey))
    }

    return {
      persistedLead,
      linkedProject,
      linkedProjectId,
      linkedClientRecord,
      linkedEstimate: persistedProjectEstimate,
      linkedEstimateId,
      reusedExistingProject,
    }
  }

  async function saveLeadRecord(leadDraft) {
    try {
      const normalizedLeadDraft = normalizeLeadLanguageRecord(leadDraft, language)
      let clientId = leadDraft.clientId || ''

      if (USE_SUPABASE_LEADS && normalizedLeadDraft.clientMode === 'new' && normalizedLeadDraft.client?.trim()) {
        const clientResponse = await dataProvider?.clients?.create?.({
          name: normalizedLeadDraft.client.trim(),
          phone: normalizedLeadDraft.phone || '',
          email: normalizedLeadDraft.email || '',
          address: normalizedLeadDraft.address || normalizedLeadDraft.location || '',
          preferredLanguage: resolvePreferredClientLanguage({
            lead: normalizedLeadDraft,
            userLanguage: language,
          }),
        }, {
          contractorId: clientsContractorId,
        })

        if (clientResponse?.error) {
          showToast(clientResponse.error.message || t('leadSaveFailed'), 'error')
          logLeadDevError('[dev] Failed to create client during lead creation.', clientResponse.error, {
            leadDraft: normalizedLeadDraft,
          })
          return null
        }

        if (!isUuid(clientResponse?.data?.id)) {
          const error = new Error('Client creation did not return a valid uuid.')
          showToast(t('leadSaveFailed'), 'error')
          logLeadDevError('[dev] Client creation during lead save returned an invalid id.', error, {
            leadDraft: normalizedLeadDraft,
            clientResponse,
          })
          return null
        }

        clientId = clientResponse.data.id
        upsertClientSilently(clientResponse.data)
      }

      const response = await dataProvider?.leads?.create?.({
        ...normalizedLeadDraft,
        leadPipelineStage: normalizedLeadDraft.leadPipelineStage || leadPipelineStages.NEW_LEAD,
        ...(clientId ? { clientId } : {}),
      }, {
        contractorId: leadsContractorId,
      })

      if (response?.error) {
        showToast(response.error.message || t('leadSaveFailed'), 'error')
        logLeadDevError('[dev] Failed to create lead.', response.error, {
          leadDraft: normalizedLeadDraft,
        })
        return null
      }

      const persistedLead = normalizeLeadLanguageRecord(
        response?.data || {
          ...normalizedLeadDraft,
          leadPipelineStage: normalizedLeadDraft.leadPipelineStage || leadPipelineStages.NEW_LEAD,
          ...(clientId ? { clientId } : {}),
        },
        language
      )
      createLead(persistedLead)
      return persistedLead
    } catch (err) {
      showToast(err?.message || t('leadSaveFailed'), 'error')
      logLeadDevError('[dev] Lead creation threw an unexpected error.', err, {
        leadDraft,
      })
      return null
    }
  }

  async function createLeadFromDashboard(lead) {
    const persistedLead = await saveLeadRecord(lead)

    if (!persistedLead) {
      return
    }

    try {
      setIsDashboardLeadModalOpen(false)
      if (persistedLead.id) {
        navigate(appRoutes.leadDetail.replace(':id', persistedLead.id))
      }
    } catch (err) {
      logLeadDevError('[dev] Failed to finalize dashboard lead creation state.', err, {
        leadDraft: lead,
        persistedLead,
      })
    }
  }

  async function createJobFromModal(jobDraft) {
    const matchedClient = clients.find((client) => client.id === jobDraft.clientId)
      || clients.find((client) => client.name === jobDraft.client)

    try {
      const response = await dataProvider?.projects?.create?.(jobDraft, { contractorId: projectsContractorId })

      if (response?.error) {
        showToast(response.error.message || t('jobSaveFailed'), 'error')
        return
      }

      const persistedJob = mergeCreatedJobDraft(jobDraft, response?.data || {}, matchedClient || null)
      const shouldOpenCreatedProject = jobModalState.origin === 'dashboard'
      const persistedProjectId = persistedJob.projectId || persistedJob.project_id || persistedJob.id || ''
      createJob(persistedJob, matchedClient || null)
      setJobModalState({ isOpen: false, initialClientId: '', initialClient: null, origin: '' })
      if (shouldOpenCreatedProject && persistedProjectId) {
        navigate(appRoutes.projects.replace(':id', persistedProjectId))
      }
    } catch (err) {
      showToast(err?.message || t('jobSaveFailed'), 'error')
    }
  }

  function updateLead(leadId, updates) {
    const existingLead = leads.find((lead) => lead.id === leadId)
    const normalizedUpdates = normalizeLeadTitleFields({
      ...(existingLead || {}),
      ...(updates || {}),
    })
    const normalizedLanguageUpdates = normalizeLeadLanguageRecord(
      normalizedUpdates,
      existingLead?.clientLanguage || language
    )
    const linkedEstimate = hasEstimateData(updates?.portal?.estimate)
      ? updates.portal.estimate
      : hasEstimateData(existingLead?.portal?.estimate)
        ? existingLead.portal.estimate
        : readLinkedEstimateDraft(existingLead || leadId, leadId)
    const resolvedValue = normalizedUpdates.value !== undefined
      ? toSafeNumber(normalizedUpdates.value)
      : resolveEstimateTotal({
        ...(existingLead || {}),
        ...normalizedUpdates,
      }, linkedEstimate, toSafeNumber(existingLead?.value))
    const nextLead = withLeadPipelineStage({
      ...(existingLead || {}),
      ...normalizedLanguageUpdates,
      id: leadId,
      value: resolvedValue,
      estimatedValue: normalizedLanguageUpdates.estimatedValue !== undefined
        ? toSafeNumber(normalizedLanguageUpdates.estimatedValue)
        : resolveEstimateTotal({ estimatedValue: existingLead?.estimatedValue }, linkedEstimate, resolvedValue),
      portal: {
        ...(existingLead?.portal || {}),
        ...(normalizedLanguageUpdates.portal || {}),
        ...(linkedEstimate ? { estimate: linkedEstimate } : {}),
      },
    })

    if (nextLead?.leadPipelineStage) {
      writeLeadPipelineStage(leadId, nextLead.leadPipelineStage)
    }

    setLeads((current) => current.map((lead) => (lead.id === leadId ? nextLead : lead)))
    showToast(t('leadUpdated'))
  }

  function createClient(client) {
    const normalizedClient = normalizeClientLanguageRecord(client, language)
    const id = normalizedClient.id || getClientSlug(normalizedClient.name) || `client-${Date.now()}`
    updateArchiveList('deletedClientIds', id, 'remove')
    updateArchiveList('clientIds', id, 'remove')
    setCustomClients((current) => {
      const existing = current.find((item) => item.id === id)
      if (existing) return current.map((item) => (item.id === id ? { ...item, ...normalizedClient, id } : item))
      return [{ id, ...normalizedClient }, ...current]
    })
    showToast(t('clientCreated'))
    addNotification('notificationClientCreatedTitle', 'notificationClientCreatedMessage')
  }

  function updateClient(clientId, updates) {
    setCustomClients((current) => {
      const existing = current.find((item) => item.id === clientId)
      const normalizedClient = normalizeClientLanguageRecord({
        ...(existing || {}),
        ...(updates || {}),
      }, existing?.preferredLanguage || language)
      if (existing) return current.map((item) => (item.id === clientId ? { ...item, ...normalizedClient, id: clientId } : item))
      return [{ id: clientId, ...normalizedClient }, ...current]
    })

    setLeads((current) => current.map((lead) => {
      const leadClientId = lead.clientId || lead.client_id || getClientSlug(lead.client)
      if (leadClientId !== clientId) return lead
      return {
        ...lead,
        client: updates.name || lead.client,
        phone: updates.phone || lead.phone,
        email: updates.email || lead.email,
        address: updates.address || lead.address,
        location: updates.address || lead.location,
      }
    }))
    showToast(t('clientUpdated'))
    addNotification('notificationClientUpdatedTitle', 'notificationClientUpdatedMessage')
  }

  function archiveClientRecord(id, clientRecord = null) {
    updateArchiveList('clientIds', id, 'add')

    if (USE_SUPABASE_CLIENTS && clientRecord) {
      setCustomClients((current) => current.map((item) => (item.id === id ? { ...item, ...clientRecord, id } : item)))
    }

    showToast(t('itemArchived'))
  }

  function restoreClientRecord(id, clientRecord = null) {
    updateArchiveList('clientIds', id, 'remove')

    if (USE_SUPABASE_CLIENTS && clientRecord) {
      setCustomClients((current) => current.map((item) => (item.id === id ? { ...item, ...clientRecord, id } : item)))
    }

    showToast(t('itemRestored'))
  }

  function deleteClientRecord(id) {
    updateArchiveList('deletedClientIds', id, 'add')

    if (USE_SUPABASE_CLIENTS) {
      setCustomClients((current) => current.filter((item) => item.id !== id))
      updateArchiveList('clientIds', id, 'remove')
    }

    showToast(t('itemDeletedPermanently'))
  }

  async function transitionLeadStage(leadId, targetStage, { silent = false } = {}) {
    const sourceLead = leads.find((lead) => lead.id === leadId)

    if (!sourceLead) {
      return null
    }

    const isArchivedLead = archives.leadIds.includes(leadId) || Boolean(sourceLead.archivedAt || sourceLead.archived_at || sourceLead.isArchived)

    if (targetStage === leadPipelineStages.ARCHIVED) {
      try {
        const response = await dataProvider?.leads?.archive?.(leadId, { contractorId: leadsContractorId })
        if (response?.error) {
          showToast(response.error.message || t('archiveFailed'), 'error')
          return null
        }
      } catch (error) {
        if (USE_SUPABASE_LEADS) {
          showToast(error?.message || t('archiveFailed'), 'error')
          return null
        }
      }

      updateArchiveList('leadIds', leadId, 'add')
      setLeads((current) => current.map((lead) => (
        lead.id === leadId
          ? { ...lead, archivedAt: new Date().toISOString(), archived_at: new Date().toISOString(), isArchived: true }
          : lead
      )))

      if (!silent) {
        showToast(t('itemArchived'))
      }

      return { ...sourceLead, archivedAt: new Date().toISOString(), archived_at: new Date().toISOString(), isArchived: true }
    }

    if (isArchivedLead) {
      try {
        const response = await dataProvider?.leads?.restore?.(leadId, { contractorId: leadsContractorId })
        if (response?.error) {
          showToast(response.error.message || t('restoreFailed'), 'error')
          return null
        }
      } catch (error) {
        if (USE_SUPABASE_LEADS) {
          showToast(error?.message || t('restoreFailed'), 'error')
          return null
        }
      }

      updateArchiveList('leadIds', leadId, 'remove')
    }

    if (targetStage === leadPipelineStages.CONVERTED_TO_JOB) {
      const conversionResult = await ensureProjectForLeadConversion(sourceLead, {
        leadId,
        silent,
        successToastKey: 'leadToastConvertedToJob',
      })
      return conversionResult?.persistedLead || null
    }

    const nextLead = withLeadPipelineStage(buildLeadPipelineTransition(sourceLead, targetStage))

    let responseData = null

    try {
      const response = await dataProvider?.leads?.update?.(leadId, {
        status: nextLead.status,
        leadPipelineStage: nextLead.leadPipelineStage,
      }, {
        contractorId: leadsContractorId,
      })

      if (response?.error) {
        showToast(response.error.message || t('leadSaveFailed'), 'error')
        return null
      }

      responseData = response?.data || null
    } catch (error) {
      if (USE_SUPABASE_LEADS) {
        showToast(error?.message || t('leadSaveFailed'), 'error')
        return null
      }
    }

    writeLeadPipelineStage(leadId, nextLead.leadPipelineStage)
    const nextEstimateStatus = targetStage === leadPipelineStages.ESTIMATE_SENT || targetStage === leadPipelineStages.FOLLOW_UP
      ? 'Sent'
      : targetStage === leadPipelineStages.ESTIMATE_APPROVED
        ? 'Approved'
        : null
    const linkedEstimate = persistedEstimates.find((item) => matchesLinkedEstimate(sourceLead, item))
      || (hasEstimateData(sourceLead?.portal?.estimate) ? sourceLead.portal.estimate : readLinkedEstimateDraft(sourceLead || leadId, leadId))

    if (nextEstimateStatus && linkedEstimate?.id) {
      try {
        const estimateResponse = await dataProvider.estimates.update(linkedEstimate.id, {
          ...linkedEstimate,
          status: nextEstimateStatus,
        }, {
          contractorId: projectsContractorId,
        })

        if (!estimateResponse?.error && estimateResponse?.data) {
          upsertPersistedEstimateRecord(estimateResponse.data)
        }
      } catch (error) {
        logEstimateDevError('[dev] Failed to sync estimate status during lead stage transition.', error, {
          leadId,
          targetStage,
          estimateId: linkedEstimate.id,
        })
      }
    }

    const persistedLead = withLeadPipelineStage({
      ...sourceLead,
      ...(responseData || {}),
      ...nextLead,
      id: leadId,
      archivedAt: null,
      archived_at: null,
      isArchived: false,
    })

    setLeads((current) => current.map((lead) => (lead.id === leadId ? persistedLead : lead)))

    if (!silent) {
      const successToastKey = {
        [leadPipelineStages.ESTIMATE_SENT]: 'leadToastEstimateSent',
        [leadPipelineStages.FOLLOW_UP]: 'leadToastFollowUpComplete',
        [leadPipelineStages.ESTIMATE_APPROVED]: 'leadToastEstimateApproved',
      }[targetStage] || 'leadStageUpdated'
      showToast(t(successToastKey))
    }

    return persistedLead
  }

  function moveLead(leadId, targetStatus) {
    transitionLeadStage(leadId, targetStatus, { silent: true })
  }

  async function duplicateLead(leadId) {
    const sourceLead = leads.find((lead) => lead.id === leadId)

    if (!sourceLead) {
      return null
    }

    const duplicatedLead = {
      ...sourceLead,
      id: undefined,
      projectId: null,
      project_id: null,
      projectStatus: 'Lead',
      status: 'New Lead',
      leadPipelineStage: leadPipelineStages.NEW_LEAD,
      archivedAt: null,
      archived_at: null,
      isArchived: false,
      portal: {},
    }

    return saveLeadRecord(duplicatedLead)
  }

  function syncProjectPayments(leadId, nextPayments, { toastKey } = {}) {
    setLeads((current) => current.map((lead) => {
      if (lead.id !== leadId) return lead

      const portal = lead.portal || {}
      const combinedPayments = dedupePayments(nextPayments)
      const paymentSummary = calculateProjectPaymentSummary({
        ...lead,
        portal,
      }, combinedPayments)

      return {
        ...lead,
        paid: paymentSummary.totalPaid,
        amountPaid: paymentSummary.totalPaid,
        remaining: paymentSummary.outstandingBalance,
        remainingBalance: paymentSummary.outstandingBalance,
        payments: combinedPayments,
        portal: {
          ...portal,
          contractAmount: paymentSummary.projectValue,
          depositRequired: paymentSummary.depositRequired,
          depositPaid: paymentSummary.depositPaidTotal,
          otherPaymentsTotal: paymentSummary.otherPaymentsTotal,
          totalPaid: paymentSummary.totalPaid,
          amountPaid: paymentSummary.totalPaid,
          outstandingBalance: paymentSummary.outstandingBalance,
          paymentStatus: paymentSummary.paymentStatus,
          payments: combinedPayments,
          paymentHistory: combinedPayments,
        },
      }
    }))

    if (toastKey) {
      showToast(t(toastKey))
    }
  }

  function recordProjectPayment(leadId, payment) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)

    if (!sourceLead) {
      return
    }

    const portal = sourceLead?.portal || {}
    const relatedProjectId = payment?.projectId || payment?.project_id || resolvePaymentProjectId(sourceLead)
    const paymentEntry = normalizePaymentRecord({
      id: payment?.id || `payment-${Date.now()}`,
      ...payment,
      clientId: sourceLead?.clientId || sourceLead?.client_id || null,
      projectId: relatedProjectId,
      leadId: sourceLead?.leadId || sourceLead?.lead_id || sourceLead?.id || leadId,
    })
    const existingPayments = dedupePayments([
      ...(Array.isArray(portal.payments) ? portal.payments : []),
      ...(Array.isArray(portal.paymentHistory) ? portal.paymentHistory : []),
    ])
    const combinedPayments = [
      paymentEntry,
      ...existingPayments.filter((entry) => entry.id !== paymentEntry.id),
    ]

    syncProjectPayments(sourceLead.id, combinedPayments, {
      toastKey: 'paymentRecorded',
    })
  }

  function updateProjectPayment(leadId, payment) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)

    if (!sourceLead) {
      return
    }

    const portal = sourceLead?.portal || {}
    const relatedProjectId = payment?.projectId || payment?.project_id || resolvePaymentProjectId(sourceLead)
    const paymentEntry = normalizePaymentRecord({
      id: payment?.id || `payment-${Date.now()}`,
      ...payment,
      clientId: sourceLead?.clientId || sourceLead?.client_id || null,
      projectId: relatedProjectId,
      leadId: sourceLead?.leadId || sourceLead?.lead_id || sourceLead?.id || leadId,
    })
    const existingPayments = dedupePayments([
      ...(Array.isArray(portal.payments) ? portal.payments : []),
      ...(Array.isArray(portal.paymentHistory) ? portal.paymentHistory : []),
    ])

    syncProjectPayments(sourceLead.id, [
      paymentEntry,
      ...existingPayments.filter((entry) => entry.id !== paymentEntry.id),
    ], {
      toastKey: 'paymentUpdated',
    })
  }

  function deleteProjectPayment(leadId, payment) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)

    if (!sourceLead) {
      return
    }

    const portal = sourceLead?.portal || {}
    const timestamp = new Date().toISOString()
    const existingPayments = dedupePayments([
      ...(Array.isArray(portal.payments) ? portal.payments : []),
      ...(Array.isArray(portal.paymentHistory) ? portal.paymentHistory : []),
    ]).map((entry) => (
      entry.id === payment?.id
        ? normalizePaymentRecord({
            ...entry,
            ...payment,
            archivedAt: payment?.archivedAt || timestamp,
            updatedAt: timestamp,
          }, entry)
        : entry
    ))

    syncProjectPayments(sourceLead.id, existingPayments, {
      toastKey: 'paymentDeleted',
    })
  }

  function uploadProjectPhotos(leadId, photos, { notify = true } = {}) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)
    const resolvedLeadId = sourceLead?.id || leadId

    setLeads((current) => current.map((lead) => {
      if (lead.id !== resolvedLeadId) return lead
      return {
        ...lead,
        portal: {
          ...lead.portal,
          photos: [...photos, ...(lead.portal?.photos || [])],
        },
      }
    }))
    if (notify) {
      showToast(t(photos.length > 1 ? 'photosUploaded' : 'photoUploaded'))
    }
  }

  async function saveEstimate(leadId, estimate) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)

    if (!sourceLead) {
      const directEstimate = estimate?.id
        ? persistedEstimates.find((item) => item.id === estimate.id) || estimate
        : null

      if (directEstimate?.id && (USE_SUPABASE || USE_SUPABASE_ESTIMATES)) {
        const response = await dataProvider.estimates.update(directEstimate.id, {
          ...directEstimate,
          ...estimate,
        }, { contractorId: projectsContractorId })

        if (response?.error) {
          showToast(response.error.message || t('estimateSaveFailed'), 'error')
          return null
        }

        const persistedEstimate = {
          ...directEstimate,
          ...estimate,
          ...(response?.data || {}),
          id: directEstimate.id,
        }
        upsertPersistedEstimateRecord(persistedEstimate)
        showToast(t('estimateSaved'))
        return persistedEstimate
      }

      return null
    }

    const portal = sourceLead?.portal || {}
    const persistedEstimateMatch = persistedEstimates.find((item) => matchesLinkedEstimate(sourceLead || { id: leadId }, item))
    const existingEstimate = hasEstimateData(persistedEstimateMatch)
      ? persistedEstimateMatch
      : hasEstimateData(portal.estimate)
        ? portal.estimate
        : readLinkedEstimateDraft(sourceLead || leadId, leadId) || {}
    const lineItems = Array.isArray(estimate?.lineItems) ? estimate.lineItems : []
    const relatedProjectId = resolvePersistedProjectLink(estimate, existingEstimate, sourceLead)
    const nextEstimateId = estimate?.id || existingEstimate.id || createLocalRecordId('estimate')
    const estimateNumber = estimate?.number
      || existingEstimate.number
      || generateEstimateNumber({
        ...(sourceLead || {}),
        ...(estimate || {}),
        id: nextEstimateId,
        leadId: sourceLead?.id || leadId,
        projectId: relatedProjectId,
      })
    const nextEstimateDraft = {
      ...existingEstimate,
      ...estimate,
      id: nextEstimateId,
      contractorId: estimate?.contractorId || estimate?.contractor_id || existingEstimate.contractorId || projectsContractorId || undefined,
      leadId: sourceLead?.id || leadId,
      lead_id: sourceLead?.id || leadId,
      projectId: relatedProjectId,
      project_id: relatedProjectId,
      clientId: estimate?.clientId || estimate?.client_id || existingEstimate.clientId || existingEstimate.client_id || sourceLead?.clientId || sourceLead?.client_id || null,
      client_id: estimate?.clientId || estimate?.client_id || existingEstimate.clientId || existingEstimate.client_id || sourceLead?.clientId || sourceLead?.client_id || null,
      projectTitle: estimate?.projectTitle || existingEstimate.projectTitle || sourceLead?.projectTitle || sourceLead?.projectType || 'Estimate',
      number: estimateNumber,
      total: resolveEstimateTotal(sourceLead, estimate, toSafeNumber(existingEstimate.total)),
      lineItems,
      pricingMode: estimate?.pricingMode || (lineItems.length ? 'detailed' : 'simple'),
      status: estimate?.status || existingEstimate.status || 'Draft',
    }

    try {
      let estimateId = estimate?.id || existingEstimate.id || null

      if (!estimate?.id && !existingEstimate.id && (USE_SUPABASE || USE_SUPABASE_ESTIMATES)) {
        const existingEstimateResponse = await dataProvider.estimates.list({
          contractorId: projectsContractorId,
          ...(relatedProjectId ? { projectId: relatedProjectId } : { leadId: sourceLead?.id || leadId }),
          includeArchived: true,
        })

        if (existingEstimateResponse?.error) {
          showToast(existingEstimateResponse.error.message || t('estimateSaveFailed'), 'error')
          logEstimateDevError('[dev] Failed to look up existing estimate before save.', existingEstimateResponse.error, {
            leadId,
            estimate: nextEstimateDraft,
          })
          return null
        }

        estimateId = existingEstimateResponse?.data?.[0]?.id || estimateId
      }

      const response = estimateId
        ? await dataProvider.estimates.update(estimateId, nextEstimateDraft, { contractorId: projectsContractorId })
        : await dataProvider.estimates.create(nextEstimateDraft, { contractorId: projectsContractorId })

      if (response?.error) {
        showToast(response.error.message || t('estimateSaveFailed'), 'error')
        logEstimateDevError('[dev] Estimate save failed.', response.error, {
          leadId,
          estimate: nextEstimateDraft,
        })
        return null
      }

      const persistedEstimate = {
        ...nextEstimateDraft,
        ...(response?.data || {}),
        id: response?.data?.id || estimateId || nextEstimateDraft.id,
        lineItems: Array.isArray(response?.data?.lineItems) ? response.data.lineItems : lineItems,
        pricingMode: nextEstimateDraft.pricingMode,
      }
      const estimateTotal = resolveEstimateTotal(sourceLead, persistedEstimate)
      const nextPipelineStage = persistedEstimate.status === 'Sent'
        ? leadPipelineStages.ESTIMATE_SENT
        : persistedEstimate.status === 'Approved'
          ? leadPipelineStages.ESTIMATE_APPROVED
          : persistedEstimate.status === 'Converted to Contract'
            ? leadPipelineStages.ESTIMATE_APPROVED
            : [leadPipelineStages.ESTIMATE_SENT, leadPipelineStages.FOLLOW_UP, leadPipelineStages.ESTIMATE_APPROVED, leadPipelineStages.READY_FOR_JOB, leadPipelineStages.CONVERTED_TO_JOB].includes(getLeadPipelineStage(sourceLead))
              ? getLeadPipelineStage(sourceLead)
              : leadPipelineStages.ESTIMATE_CREATED

      writeLinkedEstimateDrafts([leadId, relatedProjectId, persistedEstimate.id], persistedEstimate)
      upsertPersistedEstimateRecord(persistedEstimate)
      writeLeadPipelineStage(leadId, nextPipelineStage)

      try {
        await dataProvider.leads.update?.(leadId, {
          projectId: relatedProjectId || sourceLead?.projectId || sourceLead?.project_id || null,
          estimateId: persistedEstimate.id || null,
          value: estimateTotal,
          estimatedValue: estimateTotal,
        }, {
          contractorId: leadsContractorId,
        })
      } catch (error) {
        logEstimateDevError('[dev] Failed to sync lead estimated value after saving estimate.', error, {
          leadId,
          estimate: persistedEstimate,
        })
      }

      if (relatedProjectId) {
        try {
          await dataProvider.projects.update?.(relatedProjectId, {
            leadId,
            clientId: sourceLead?.clientId || sourceLead?.client_id || persistedEstimate.clientId || null,
            projectTitle: sourceLead?.projectTitle || sourceLead?.projectType || persistedEstimate.projectTitle || 'Untitled Project',
            projectType: sourceLead?.projectType || sourceLead?.projectTitle || '',
            value: estimateTotal,
            estimatedValue: estimateTotal,
            contractValue: estimateTotal,
            source: sourceLead?.source || 'Direct Job',
            priority: sourceLead?.priority || 'Medium',
          }, {
            contractorId: projectsContractorId,
          })
        } catch (error) {
          logEstimateDevError('[dev] Failed to sync project estimated value after saving estimate.', error, {
            leadId,
            projectId: relatedProjectId,
            estimate: persistedEstimate,
          })
        }
      }

      setLeads((current) => current.map((lead) => {
        if (lead.id !== leadId) return lead
        const currentPortal = lead.portal || {}
        const contractAmount = resolveEstimateTotal(lead, persistedEstimate)
        const amountPaid = toSafeNumber(currentPortal.amountPaid)
        const nextContract = hasContractData(currentPortal.contract) && !isArchivedContractRecord(currentPortal.contract)
          ? {
              ...(currentPortal.contract || {}),
              total: contractAmount,
              updatedAt: new Date().toISOString(),
            }
          : null

        return {
          ...lead,
          value: contractAmount,
          estimatedValue: contractAmount,
          estimateId: persistedEstimate.id || lead.estimateId || null,
          leadPipelineStage: nextPipelineStage,
          status: nextPipelineStage === leadPipelineStages.ESTIMATE_CREATED
            ? 'Contacted'
            : nextPipelineStage === leadPipelineStages.ESTIMATE_SENT
              ? 'Estimate Sent'
              : nextPipelineStage === leadPipelineStages.ESTIMATE_APPROVED || nextPipelineStage === leadPipelineStages.READY_FOR_JOB || nextPipelineStage === leadPipelineStages.CONVERTED_TO_JOB
                ? 'Won'
                : lead.status,
          portal: {
            ...currentPortal,
            estimate: persistedEstimate,
            ...(nextContract ? { contract: nextContract } : {}),
            contractAmount,
            outstandingBalance: Math.max(contractAmount - amountPaid, 0),
          },
        }
      }))

      showToast(t('estimateSaved'))
      return persistedEstimate
    } catch (error) {
      showToast(error?.message || t('estimateSaveFailed'), 'error')
      logEstimateDevError('[dev] Estimate save threw an unexpected error.', error, {
        leadId,
        estimate: nextEstimateDraft,
      })
      return null
    }
  }

  async function refreshEstimateManagementState() {
    const [estimatesResponse, projectsResponse, settingsResponse] = await Promise.all([
      dataProvider.estimates.list({ contractorId: projectsContractorId, includeArchived: true }),
      dataProvider.projects.list({ contractorId: projectsContractorId, includeArchived: true }),
      dataProvider.settings.getSettings({ contractorId: settingsContractorId }),
    ])

    if (!estimatesResponse?.error && Array.isArray(estimatesResponse?.data)) {
      setPersistedEstimates(estimatesResponse.data)
    }
    if (!settingsResponse?.error && settingsResponse?.data) {
      setCompanySettings(createDefaultCompanySettings(settingsResponse.data))
    }

    const failedEntry = [
      ['estimates', estimatesResponse],
      ['projects', projectsResponse],
      ['settings', settingsResponse],
    ].find(([, response]) => response?.error)

    if (failedEntry && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.warn('[dev] Estimate management refresh did not fully complete.', {
        stage: failedEntry[0],
        contractorId: projectsContractorId,
        error: failedEntry[1].error,
      })
    }
  }

  async function archiveEstimateRecord(leadId, estimateRecord = null) {
    if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
      archiveLeadRecord(leadId)
      return null
    }

    const sourceLead = visibleLeads.find((lead) => lead.id === leadId || lead.projectId === leadId || lead.project_id === leadId)
    const linkedEstimate = hasEstimateData(estimateRecord)
      ? estimateRecord
      : persistedEstimates.find((item) => matchesLinkedEstimate(sourceLead || { id: leadId }, item))
        || sourceLead?.portal?.estimate
        || readLinkedEstimateDraft(sourceLead || leadId, leadId)

    if (!linkedEstimate?.id) {
      return null
    }

    const response = await dataProvider.estimates.archive(linkedEstimate.id, { contractorId: projectsContractorId })

    if (response?.error) {
      showToast(response.error.message || t('archiveFailed'), 'error')
      return null
    }

    const archivedEstimate = {
      ...linkedEstimate,
      ...(response?.data || {}),
      archivedAt: response?.data?.archivedAt || new Date().toISOString(),
    }

    upsertPersistedEstimateRecord(archivedEstimate)
    setLeads((current) => current.map((lead) => (
      matchesLinkedEstimate(lead, archivedEstimate)
        ? {
            ...lead,
            portal: {
              ...(lead.portal || {}),
              estimate: archivedEstimate,
            },
          }
        : lead
    )))
    showToast(t('itemArchived'))
    await refreshEstimateManagementState()
    return archivedEstimate
  }

  async function restoreEstimateRecord(leadId, estimateRecord = null) {
    if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
      restoreLeadRecord(leadId)
      return null
    }

    const sourceLead = visibleLeads.find((lead) => lead.id === leadId || lead.projectId === leadId || lead.project_id === leadId)
    const linkedEstimate = hasEstimateData(estimateRecord)
      ? estimateRecord
      : persistedEstimates.find((item) => matchesLinkedEstimate(sourceLead || { id: leadId }, item))
        || sourceLead?.portal?.estimate
        || readLinkedEstimateDraft(sourceLead || leadId, leadId)

    if (!linkedEstimate?.id) {
      return null
    }

    const response = await dataProvider.estimates.restore(linkedEstimate.id, { contractorId: projectsContractorId })

    if (response?.error) {
      showToast(response.error.message || t('restoreFailed'), 'error')
      return null
    }

    const restoredEstimate = {
      ...linkedEstimate,
      ...(response?.data || {}),
      archivedAt: null,
      archived_at: null,
    }

    upsertPersistedEstimateRecord(restoredEstimate)
    setLeads((current) => current.map((lead) => (
      matchesLinkedEstimate(lead, restoredEstimate)
        ? {
            ...lead,
            portal: {
              ...(lead.portal || {}),
              estimate: restoredEstimate,
            },
          }
        : lead
    )))
    showToast(t('itemRestored'))
    await refreshEstimateManagementState()
    return restoredEstimate
  }

  async function deleteEstimateRecord(leadId, estimateRecord = null) {
    if (!USE_SUPABASE && !USE_SUPABASE_ESTIMATES) {
      deleteLeadRecord(leadId)
      return null
    }

    const sourceLead = visibleLeads.find((lead) => lead.id === leadId || lead.projectId === leadId || lead.project_id === leadId)
    const linkedEstimate = hasEstimateData(estimateRecord)
      ? estimateRecord
      : persistedEstimates.find((item) => matchesLinkedEstimate(sourceLead || { id: leadId }, item))
        || sourceLead?.portal?.estimate
        || readLinkedEstimateDraft(sourceLead || leadId, leadId)

    if (!linkedEstimate?.id) {
      return null
    }

    const response = await dataProvider.estimates.deletePermanently(linkedEstimate.id, {
      contractorId: projectsContractorId,
      authenticatedUserId: user?.id || session?.user?.id || '',
    })

    if (response?.error) {
      showToast(
        response.error.code === 'ESTIMATE_DELETE_NO_ROWS'
          ? t('estimateDeleteUnavailable')
          : response.error.message || t('deleteFailed'),
        'error'
      )
      return null
    }

    buildEstimateLookupIds(linkedEstimate, [leadId]).forEach((lookupId) => {
      clearEstimateDraft(lookupId)
    })
    removePersistedEstimateRecord(linkedEstimate.id)
    setLeads((current) => current.map((lead) => (
      matchesLinkedEstimate(lead, linkedEstimate)
        ? {
            ...lead,
            estimateId: null,
            portal: {
              ...(lead.portal || {}),
              estimate: {},
            },
          }
        : lead
    )))
    showToast(t('itemDeletedPermanently'))
    await refreshEstimateManagementState()
    return response?.data || { id: linkedEstimate.id, deleted: true }
  }

  async function findExistingLinkedContract({ sourceLead, estimateRecord = null, projectId = '', leadId = '' } = {}) {
    const persistedContract = selectActiveContractRecord(
      persistedContracts.filter((contract) => matchesLinkedContract(sourceLead || { id: leadId }, contract, estimateRecord))
    )
    const existingContract = hasContractData(persistedContract) ? persistedContract : getLinkedActiveContract(sourceLead)

    if (hasContractData(existingContract)) {
      return existingContract
    }

    const estimateId = estimateRecord?.id || sourceLead?.estimateId || sourceLead?.portal?.estimate?.id || null
    const resolvedProjectId = projectId || sourceLead?.projectId || sourceLead?.project_id || null
    const leadMatches = leads.find((lead) => {
      const contract = getLinkedActiveContract(lead)
      if (!hasContractData(contract)) return false

      if (estimateId && (contract.estimateId === estimateId || lead.estimateId === estimateId)) {
        return true
      }

      if (resolvedProjectId && (
        contract.projectId === resolvedProjectId
        || lead.id === resolvedProjectId
        || lead.projectId === resolvedProjectId
        || lead.project_id === resolvedProjectId
      )) {
        return true
      }
 
      return false
    })

    if (leadMatches) {
      return getLinkedActiveContract(leadMatches)
    }

    if (!projectsContractorId) {
      return null
    }

    const lookupResponses = []

    if (estimateId) {
      lookupResponses.push(await dataProvider.contracts.list({
        contractorId: projectsContractorId,
        estimateId,
        includeArchived: true,
      }))
    }

    if (resolvedProjectId) {
      lookupResponses.push(await dataProvider.contracts.list({
        contractorId: projectsContractorId,
        projectId: resolvedProjectId,
        includeArchived: true,
      }))
    }

    for (const response of lookupResponses) {
      if (response?.error) {
        continue
      }

      const nextContract = selectActiveContractRecord(response?.data)

      if (hasContractData(nextContract)) {
        writeLinkedContractDrafts([
          leadId,
          resolvedProjectId,
          estimateId,
          nextContract.id,
        ], nextContract)
        return nextContract
      }
    }

    return null
  }

  function syncLeadContractState(leadId, contract, estimateRecord = null) {
    if (!hasContractData(contract)) return

    upsertPersistedContractRecord(contract)

    writeLinkedContractDrafts([
      leadId,
      contract.projectId,
      contract.estimateId,
      contract.id,
    ], contract)

    if (hasEstimateData(estimateRecord)) {
      upsertPersistedEstimateRecord(estimateRecord)
      writeLinkedEstimateDrafts([
        leadId,
        contract.projectId,
        contract.estimateId,
      ], estimateRecord)
    }

    setLeads((current) => current.map((lead) => {
      const leadMatches = lead.id === leadId
        || (contract.projectId && (lead.id === contract.projectId || lead.projectId === contract.projectId || lead.project_id === contract.projectId))
        || (contract.estimateId && lead.estimateId === contract.estimateId)

      if (!leadMatches) {
        return lead
      }

      const linkedEstimate = hasEstimateData(estimateRecord)
        ? estimateRecord
        : hasEstimateData(lead?.portal?.estimate)
          ? lead.portal.estimate
          : readLinkedEstimateDraft(lead, [leadId, contract.projectId, contract.estimateId])
      const nextLead = attachContractToLeadState({
        ...lead,
        estimateId: lead.estimateId || contract.estimateId || linkedEstimate?.id || null,
        portal: {
          ...(lead.portal || {}),
          estimate: linkedEstimate
            ? {
                ...linkedEstimate,
                status: 'Converted to Contract',
              }
            : lead.portal?.estimate,
          contract: {
            ...(lead.portal?.contract || {}),
            ...contract,
          },
        },
      }, contract)

      return nextLead
    }))
  }

  function buildEstimateDerivedContractValues(leadRecord, estimateRecord) {
    const contractAmount = resolveEstimateTotal(leadRecord, estimateRecord, toSafeNumber(leadRecord?.value))
    const derivedWorkBreakdown = buildContractWorkBreakdownFromEstimate(estimateRecord)
    const estimateDepositPercentage = Number(estimateRecord?.depositPercentage ?? estimateRecord?.deposit_percentage)
    const derivedDepositAmount = Number.isFinite(estimateDepositPercentage) && estimateDepositPercentage > 0
      ? Number(((contractAmount * estimateDepositPercentage) / 100).toFixed(2))
      : null

    return {
      contractAmount,
      derivedWorkBreakdown,
      derivedDepositAmount,
      derivedScope: estimateRecord?.summary || estimateRecord?.scopeOfWork || '',
      derivedPaymentTerms: estimateRecord?.paymentTerms || '',
      derivedContractLanguage: normalizeDocumentLanguageOverride(estimateRecord?.estimateLanguage),
    }
  }

  async function ensureContractForLead(leadId, estimateInput = null) {
    const existingContractPromise = contractEnsureGuardRef.current.get(leadId)
    if (existingContractPromise) {
      return existingContractPromise
    }

    const contractPromise = (async () => {
      const sourceLead = findLeadByProjectLookup(leads, leadId)

      if (!sourceLead) {
        return null
      }

      const baseEstimate = hasEstimateData(estimateInput)
        ? estimateInput
        : hasEstimateData(sourceLead?.portal?.estimate)
          ? sourceLead.portal.estimate
          : readLinkedEstimateDraft(sourceLead, leadId)

      const persistedEstimate = hasEstimateData(baseEstimate)
        ? await saveEstimate(leadId, {
            ...baseEstimate,
            status: 'Converted to Contract',
            projectId: resolvePersistedProjectLink(baseEstimate, sourceLead),
            clientId: baseEstimate?.clientId || sourceLead?.clientId || sourceLead?.client_id || null,
          })
        : null

      const estimateRecord = persistedEstimate || baseEstimate || null
      const conversionResult = await ensureProjectForLeadConversion(sourceLead, {
        leadId,
        estimateRecord,
        silent: true,
      })

      if (!conversionResult?.linkedProjectId) {
        showToast(t('contractRequiresRealProject'), 'error')
        return null
      }

      const refreshedLead = conversionResult.persistedLead || findLeadByProjectLookup(leads, leadId) || sourceLead
      const linkedEstimateRecord = conversionResult.linkedEstimate || estimateRecord
      const relatedProjectId = conversionResult.linkedProjectId || resolvePersistedProjectLink(linkedEstimateRecord, refreshedLead)
      const {
        contractAmount,
        derivedWorkBreakdown,
        derivedDepositAmount,
        derivedScope,
        derivedPaymentTerms,
        derivedContractLanguage,
      } = buildEstimateDerivedContractValues(refreshedLead, linkedEstimateRecord)
      const existingContract = await findExistingLinkedContract({
        sourceLead: refreshedLead,
        estimateRecord: linkedEstimateRecord,
        projectId: relatedProjectId,
        leadId,
      })

      if (hasContractData(existingContract)) {
        const existingWorkBreakdown = Array.isArray(existingContract.workBreakdown) ? existingContract.workBreakdown : []
        const shouldBackfillWorkBreakdown = existingWorkBreakdown.length === 0 && derivedWorkBreakdown.length > 0
        const existingScope = existingContract.scope || existingContract.scopeOfWork || ''
        const shouldBackfillScope = (!String(existingScope).trim() || isGeneratedContractScopeText(existingScope)) && Boolean(derivedScope)
        const updatedExistingContract = {
          ...existingContract,
          estimateId: existingContract.estimateId || linkedEstimateRecord?.id || null,
          projectId: existingContract.projectId || relatedProjectId || null,
          project_id: existingContract.project_id || relatedProjectId || null,
          clientId: existingContract.clientId || refreshedLead?.clientId || refreshedLead?.client_id || linkedEstimateRecord?.clientId || null,
          projectTitle: existingContract.projectTitle || refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || 'Contract',
          title: existingContract.title || refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || 'Contract',
          scope: shouldBackfillScope ? derivedScope : existingScope,
          paymentTerms: existingContract.paymentTerms || derivedPaymentTerms,
          contractLanguage: existingContract.contractLanguage || derivedContractLanguage,
          depositAmount: existingContract.depositAmount ?? derivedDepositAmount,
          workBreakdown: shouldBackfillWorkBreakdown ? derivedWorkBreakdown : existingWorkBreakdown,
        }

        if (existingContract.id && (
          updatedExistingContract.estimateId !== existingContract.estimateId
          || updatedExistingContract.projectId !== existingContract.projectId
          || updatedExistingContract.clientId !== existingContract.clientId
          || updatedExistingContract.scope !== existingContract.scope
          || updatedExistingContract.paymentTerms !== existingContract.paymentTerms
          || updatedExistingContract.contractLanguage !== existingContract.contractLanguage
          || updatedExistingContract.depositAmount !== existingContract.depositAmount
          || updatedExistingContract.workBreakdown !== existingWorkBreakdown
        )) {
          try {
            const updateResponse = await dataProvider.contracts.update(existingContract.id, updatedExistingContract, {
              contractorId: projectsContractorId,
            })
            if (!updateResponse?.error && updateResponse?.data) {
              Object.assign(updatedExistingContract, updateResponse.data)
            }
          } catch {
            // Keep the local state updated even if the normalization patch fails.
          }
        }

        syncLeadContractState(leadId, updatedExistingContract, linkedEstimateRecord)
        return updatedExistingContract
      }

      const nextContractId = createLocalRecordId('contract')
      const contractPayload = {
        id: nextContractId,
        leadId: refreshedLead?.id || leadId,
        contractorId: projectsContractorId,
        clientId: conversionResult.linkedClientRecord?.id || refreshedLead?.clientId || refreshedLead?.client_id || linkedEstimateRecord?.clientId || null,
        projectId: relatedProjectId,
        project_id: relatedProjectId,
        estimateId: linkedEstimateRecord?.id || refreshedLead?.estimateId || null,
        projectTitle: refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || 'Contract',
        title: refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || 'Contract',
        number: generateContractNumber({
          ...refreshedLead,
          id: nextContractId,
          projectId: relatedProjectId || refreshedLead?.projectId || refreshedLead?.project_id || undefined,
        }),
        scope: derivedScope,
        paymentTerms: derivedPaymentTerms,
        contractLanguage: derivedContractLanguage,
        depositAmount: derivedDepositAmount,
        workBreakdown: derivedWorkBreakdown,
        total: contractAmount,
        status: 'Draft',
        updatedAt: new Date().toISOString(),
      }

      try {
        const response = await dataProvider.contracts.create(contractPayload, {
          contractorId: projectsContractorId,
        })

        if (response?.error) {
          showToast(response.error.message || t('contractSaveFailed'), 'error')
          return null
        }

        const persistedContract = {
          ...contractPayload,
          ...(response?.data || {}),
        }

        syncLeadContractState(leadId, persistedContract, linkedEstimateRecord)
        showToast(t('contractSaved'))
        return persistedContract
      } catch (error) {
        showToast(error?.message || t('contractSaveFailed'), 'error')
        return null
      }
    })()

    contractEnsureGuardRef.current.set(leadId, contractPromise)

    try {
      return await contractPromise
    } finally {
      if (contractEnsureGuardRef.current.get(leadId) === contractPromise) {
        contractEnsureGuardRef.current.delete(leadId)
      }
    }
  }

  function saveContract(leadId, contract) {
    let persistedEstimate = null

    setLeads((current) => current.map((lead) => {
      if (lead.id !== leadId) return lead
      const portal = lead.portal || {}
      persistedEstimate = hasEstimateData(portal.estimate) ? { ...portal.estimate, status: 'Converted to Contract' } : null
      const contractAmount = Number(contract?.total || portal.contractAmount || portal.estimate?.total || lead.value || 0)
      const amountPaid = Number(portal.amountPaid || 0)
      writeLeadPipelineStage(lead.id, leadPipelineStages.ESTIMATE_APPROVED)
      return {
        ...lead,
        leadPipelineStage: leadPipelineStages.ESTIMATE_APPROVED,
        portal: {
          ...portal,
          contractAmount,
          outstandingBalance: Math.max(contractAmount - amountPaid, 0),
          contract: {
            ...(portal.contract || {}),
            ...contract,
            number: contract?.number || portal.contract?.number || `CON-${String(lead.id).replace(/\D/g, '').padStart(4, '0')}`,
            status: contract?.status || portal.contract?.status || 'Draft',
            total: contractAmount,
          },
        },
      }
    }))
    syncLeadContractState(leadId, contract, persistedEstimate)
    showToast(t('contractSaved'))
  }

  function markContractSigned(leadId, contract) {
    let persistedEstimate = null

    setLeads((current) => current.map((lead) => {
      if (lead.id !== leadId) return lead
      const portal = lead.portal || {}
      persistedEstimate = hasEstimateData(portal.estimate) ? { ...portal.estimate, status: 'Converted to Contract' } : null
      const contractAmount = Number(contract?.total || portal.contractAmount || portal.estimate?.total || lead.value || 0)
      const signedDate = contract?.signedDate || new Date().toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' })
      const timeline = (portal.timeline || []).map((item) => (
        item.title === 'Contract Signed'
          ? { ...item, date: signedDate, status: 'Complete', note: item.note || 'Agreement approved and signed by homeowner.' }
          : item
      ))
      const documents = portal.documents || []
      const hasSignedContract = documents.some((doc) => doc.name === 'Signed Contract')
      const nextDocuments = hasSignedContract
        ? documents.map((doc) => (doc.name === 'Signed Contract' ? { ...doc, status: 'Available' } : doc))
        : [{ name: 'Signed Contract', type: 'PDF', status: 'Available' }, ...documents]
      writeLeadPipelineStage(lead.id, leadPipelineStages.READY_FOR_JOB)
      return {
        ...lead,
        status: 'Won',
        projectStatus: 'Signed',
        leadPipelineStage: leadPipelineStages.READY_FOR_JOB,
        portal: {
          ...portal,
          contractAmount,
          outstandingBalance: Math.max(contractAmount - Number(portal.amountPaid || 0), 0),
          timeline,
          documents: nextDocuments,
          contract: {
            ...(portal.contract || {}),
            ...contract,
            number: contract?.number || portal.contract?.number || `CON-${String(lead.id).replace(/\D/g, '').padStart(4, '0')}`,
            status: 'Signed',
            signedDate,
            total: contractAmount,
          },
        },
      }
    }))
    syncLeadContractState(leadId, {
      ...contract,
      status: 'Signed',
    }, persistedEstimate)
    showToast(t('contractSigned'))
  }

  function markContractUnsigned(leadId, contract) {
    let persistedEstimate = null

    setLeads((current) => current.map((lead) => {
      if (lead.id !== leadId) return lead
      const portal = lead.portal || {}
      persistedEstimate = hasEstimateData(portal.estimate) ? { ...portal.estimate, status: 'Converted to Contract' } : null
      const contractAmount = Number(contract?.total || portal.contractAmount || portal.estimate?.total || lead.value || 0)

      return {
        ...lead,
        portal: {
          ...portal,
          contractAmount,
          outstandingBalance: Math.max(contractAmount - Number(portal.amountPaid || 0), 0),
          contract: {
            ...(portal.contract || {}),
            ...contract,
            number: contract?.number || portal.contract?.number || `CON-${String(lead.id).replace(/\D/g, '').padStart(4, '0')}`,
            status: contract?.status || 'Draft',
            signed: false,
            signedDate: '',
            signedAt: null,
            signed_at: null,
            signedBy: '',
            signed_by: '',
            total: contractAmount,
          },
        },
      }
    }))
    syncLeadContractState(leadId, {
      ...contract,
      status: contract?.status || 'Draft',
      signed: false,
      signedDate: '',
      signedAt: null,
      signed_at: null,
      signedBy: '',
      signed_by: '',
    }, persistedEstimate)
    showToast(t('contractMarkedUnsigned'))
  }

  async function syncContractFromEstimate(leadId, estimateInput = null, { force = false } = {}) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)

    if (!sourceLead) {
      return { contract: null, blockedReason: 'missing_lead' }
    }

    const baseEstimate = hasEstimateData(estimateInput)
      ? estimateInput
      : hasEstimateData(sourceLead?.portal?.estimate)
        ? sourceLead.portal.estimate
        : readLinkedEstimateDraft(sourceLead, leadId)

    const persistedEstimate = hasEstimateData(baseEstimate)
      ? await saveEstimate(leadId, {
          ...baseEstimate,
          status: 'Converted to Contract',
          projectId: resolvePersistedProjectLink(baseEstimate, sourceLead),
          clientId: baseEstimate?.clientId || sourceLead?.clientId || sourceLead?.client_id || null,
        })
      : null

    const estimateRecord = persistedEstimate || baseEstimate || null
    const conversionResult = await ensureProjectForLeadConversion(sourceLead, {
      leadId,
      estimateRecord,
      silent: true,
    })

    if (!conversionResult?.linkedProjectId) {
      showToast(t('contractRequiresRealProject'), 'error')
      return { contract: null, blockedReason: 'missing_project' }
    }

    const refreshedLead = conversionResult.persistedLead || findLeadByProjectLookup(leads, leadId) || sourceLead
    const linkedEstimateRecord = conversionResult.linkedEstimate || estimateRecord
    const relatedProjectId = conversionResult.linkedProjectId || resolvePersistedProjectLink(linkedEstimateRecord, refreshedLead)
    const existingContract = await findExistingLinkedContract({
      sourceLead: refreshedLead,
      estimateRecord: linkedEstimateRecord,
      projectId: relatedProjectId,
      leadId,
    })

    if (!hasContractData(existingContract) || !existingContract?.id) {
      showToast(t('contractSyncRequiresLinkedContract'), 'error')
      return { contract: null, blockedReason: 'missing_contract' }
    }

    if (isSignedContractRecord(existingContract) && !force) {
      showToast(t('signedContractSyncConfirmationRequired'), 'error')
      return { contract: existingContract, blockedReason: 'signed' }
    }

    const {
      contractAmount,
      derivedWorkBreakdown,
      derivedDepositAmount,
      derivedScope,
      derivedPaymentTerms,
      derivedContractLanguage,
    } = buildEstimateDerivedContractValues(refreshedLead, linkedEstimateRecord)

    const syncedContractPayload = {
      ...existingContract,
      leadId: refreshedLead?.id || existingContract.leadId || leadId,
      clientId: conversionResult.linkedClientRecord?.id || refreshedLead?.clientId || refreshedLead?.client_id || linkedEstimateRecord?.clientId || existingContract.clientId || null,
      projectId: relatedProjectId || existingContract.projectId || existingContract.project_id || null,
      project_id: relatedProjectId || existingContract.project_id || existingContract.projectId || null,
      estimateId: linkedEstimateRecord?.id || existingContract.estimateId || refreshedLead?.estimateId || null,
      projectTitle: refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || existingContract.projectTitle || 'Contract',
      title: refreshedLead?.projectTitle || refreshedLead?.projectType || linkedEstimateRecord?.projectTitle || existingContract.title || 'Contract',
      scope: derivedScope,
      workBreakdown: derivedWorkBreakdown,
      paymentTerms: derivedPaymentTerms,
      contractLanguage: existingContract.contractLanguage || derivedContractLanguage,
      depositAmount: derivedDepositAmount,
      total: contractAmount,
      updatedAt: new Date().toISOString(),
    }

    try {
      const response = await dataProvider.contracts.update(existingContract.id, syncedContractPayload, {
        contractorId: projectsContractorId,
      })

      if (response?.error) {
        showToast(response.error.message || t('contractSyncFailed'), 'error')
        return { contract: null, blockedReason: 'save_failed' }
      }

      const persistedContract = {
        ...syncedContractPayload,
        ...(response?.data || {}),
      }

      syncLeadContractState(leadId, persistedContract, linkedEstimateRecord)
      showToast(t('contractSyncedFromEstimate'))
      return { contract: persistedContract, blockedReason: null }
    } catch (error) {
      showToast(error?.message || t('contractSyncFailed'), 'error')
      return { contract: null, blockedReason: 'save_failed' }
    }
  }

  async function archiveContractRecord(leadId, contractRecord = null) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)
    const linkedEstimate = hasEstimateData(sourceLead?.portal?.estimate)
      ? sourceLead.portal.estimate
      : readLinkedEstimateDraft(sourceLead || leadId, leadId)
    const linkedContract = hasContractData(contractRecord)
      ? contractRecord
      : selectActiveContractRecord(
          persistedContracts.filter((contract) => matchesLinkedContract(sourceLead || { id: leadId }, contract, linkedEstimate))
        ) || getLinkedActiveContract(sourceLead)

    if (!linkedContract?.id) {
      showToast(t('archiveFailed'), 'error')
      return null
    }

    const response = await dataProvider.contracts.archive(linkedContract.id, {
      contractorId: projectsContractorId,
    })

    if (response?.error) {
      showToast(response.error.message || t('archiveFailed'), 'error')
      return null
    }

    const archivedAt = response?.data?.archivedAt || response?.data?.archived_at || new Date().toISOString()
    const archivedContract = {
      ...linkedContract,
      ...(response?.data || {}),
      archivedAt,
      archived_at: archivedAt,
    }

    upsertPersistedContractRecord(archivedContract)

    setLeads((current) => current.map((lead) => (
      matchesLinkedContract(lead, archivedContract, linkedEstimate)
        ? {
            ...lead,
            portal: {
              ...(lead.portal || {}),
              contract: archivedContract,
            },
          }
        : lead
    )))

    showToast(t('contractArchived'))
    return archivedContract
  }

  async function restoreContractRecord(leadId, contractRecord = null) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)
    const linkedEstimate = hasEstimateData(sourceLead?.portal?.estimate)
      ? sourceLead.portal.estimate
      : readLinkedEstimateDraft(sourceLead || leadId, leadId)
    const linkedContract = hasContractData(contractRecord)
      ? contractRecord
      : persistedContracts.find((contract) => matchesLinkedContract(sourceLead || { id: leadId }, contract, linkedEstimate))
        || sourceLead?.portal?.contract
        || readLinkedContractDraft(sourceLead || leadId, leadId)

    if (!linkedContract?.id) {
      showToast(t('restoreFailed'), 'error')
      return null
    }

    const response = await dataProvider.contracts.restore(linkedContract.id, {
      contractorId: projectsContractorId,
    })

    if (response?.error) {
      showToast(response.error.message || t('restoreFailed'), 'error')
      return null
    }

    const restoredContract = {
      ...linkedContract,
      ...(response?.data || {}),
      archivedAt: null,
      archived_at: null,
      isArchived: false,
      archived: false,
    }

    upsertPersistedContractRecord(restoredContract)
    setLeads((current) => current.map((lead) => (
      matchesLinkedContract(lead, restoredContract, linkedEstimate)
        ? {
            ...lead,
            portal: {
              ...(lead.portal || {}),
              contract: restoredContract,
            },
          }
        : lead
    )))

    showToast(t('itemRestored'))
    return restoredContract
  }

  async function deleteContractRecord(leadId, contractRecord = null) {
    const sourceLead = findLeadByProjectLookup(leads, leadId)
    const linkedEstimate = hasEstimateData(sourceLead?.portal?.estimate)
      ? sourceLead.portal.estimate
      : readLinkedEstimateDraft(sourceLead || leadId, leadId)
    const linkedContract = hasContractData(contractRecord)
      ? contractRecord
      : persistedContracts.find((contract) => matchesLinkedContract(sourceLead || { id: leadId }, contract, linkedEstimate))
        || sourceLead?.portal?.contract
        || readLinkedContractDraft(sourceLead || leadId, leadId)

    if (!linkedContract?.id || !isArchivedContractRecord(linkedContract)) {
      showToast(t('deleteFailed'), 'error')
      return null
    }

    const response = await dataProvider.contracts.deletePermanently(linkedContract.id, {
      contractorId: projectsContractorId,
      authenticatedUserId: user?.id || session?.user?.id || '',
    })

    if (response?.error) {
      showToast(response.error.message || t('deleteFailed'), 'error')
      return null
    }

    [
      linkedContract.id,
      linkedContract.estimateId,
      linkedContract.projectId || linkedContract.project_id,
      linkedContract.leadId || linkedContract.lead_id,
      leadId,
    ].filter(Boolean).forEach((lookupId) => clearContractDraft(lookupId))

    removePersistedContractRecord(linkedContract.id)
    setLeads((current) => current.map((lead) => (
      matchesLinkedContract(lead, linkedContract, linkedEstimate)
        ? {
            ...lead,
            contractId: null,
            portal: {
              ...(lead.portal || {}),
              contract: {},
            },
          }
        : lead
    )))

    showToast(t('itemDeletedPermanently'))
    return response?.data || { id: linkedContract.id, deleted: true }
  }

  function getInvoiceStatus(invoice) {
    if (invoice.status === 'Archived' || invoice.status === 'Canceled') return invoice.status
    const amount = Number(invoice.amount || 0)
    const paid = Number(invoice.amountPaid || 0)
    if (amount > 0 && paid >= amount) return 'Paid'
    if (paid > 0) return 'Partially Paid'
    return invoice.status || 'Draft'
  }

  function updateInvoice(invoiceId, updates) {
    setInvoiceRecords((current) => {
      const hasExistingInvoice = current.some((invoice) => invoice.id === invoiceId)

      if (!hasExistingInvoice) {
        const next = {
          ...updates,
          id: invoiceId,
          amount: Number(updates.amount || 0),
          amountPaid: Number(updates.amountPaid || 0),
          paymentHistory: updates.paymentHistory || [],
        }

        return dedupeInvoiceRecords([
          { ...next, status: getInvoiceStatus(next) },
          ...current,
        ])
      }

      return current.map((invoice) => {
        if (invoice.id !== invoiceId) return invoice
        const nextLineItems = updates.lineItems || invoice.lineItems || []
        const nextAmount = updates.amount !== undefined ? Number(updates.amount || 0) : nextLineItems.reduce((sum, item) => sum + Number(item.amount || 0), 0) || invoice.amount
        const next = {
          ...invoice,
          ...updates,
          amount: nextAmount,
          amountPaid: Number(updates.amountPaid ?? invoice.amountPaid ?? 0),
          paymentHistory: updates.paymentHistory || invoice.paymentHistory || [],
        }
        return { ...next, status: getInvoiceStatus(next) }
      })
    })
    showToast(t('invoiceSaved'))
  }

  function recordInvoicePayment(invoiceId, payment) {
    let invoiceMatch = null

    setInvoiceRecords((current) => current.map((invoice) => {
      if (invoice.id !== invoiceId) return invoice
      invoiceMatch = invoice
      const amount = Number(payment.amount || 0)
      const paymentEntry = {
        id: payment.id || `payment-${Date.now()}`,
        ...payment,
        amount,
      }
      const amountPaid = Math.min(Number(invoice.amount || 0), Number(invoice.amountPaid || 0) + amount)
      const next = {
        ...invoice,
        amountPaid,
        paymentHistory: [
          paymentEntry,
          ...(invoice.paymentHistory || []),
        ],
      }
      return { ...next, status: getInvoiceStatus(next) }
    }))

    if (payment) {
      const nextPayment = normalizePaymentRecord({
        id: payment.id || `payment-${Date.now()}`,
        ...payment,
        invoiceId,
        clientId: invoiceMatch?.clientId || null,
        projectId: invoiceMatch?.projectId || null,
        contractId: invoiceMatch?.contractId || null,
        estimateId: invoiceMatch?.estimateId || null,
        leadId: invoiceMatch?.leadId || null,
        contractorId: invoiceMatch?.contractorId || invoicesContractorId || undefined,
        status: 'Recorded',
      })

      setPersistedPayments((current) => dedupePayments([nextPayment, ...current]))
    }

    showToast(t('paymentRecorded'))
  }

  function markInvoicePaid(invoiceId, payment = null) {
    let invoiceMatch = null

    setInvoiceRecords((current) => current.map((invoice) => {
      if (invoice.id !== invoiceId) return invoice
      invoiceMatch = invoice
      const amount = Number(invoice.amount || 0)
      const alreadyPaid = Number(invoice.amountPaid || 0)
      const remaining = Math.max(amount - alreadyPaid, 0)
      const paymentEntry = payment || {
        id: `payment-${Date.now()}`,
        amount: remaining,
        date: new Date().toISOString().slice(0, 10),
        method: 'Other',
        type: 'Final Payment',
        notes: 'Marked as paid.',
      }
      const paymentHistory = remaining > 0
        ? [paymentEntry, ...(invoice.paymentHistory || [])]
        : invoice.paymentHistory || []
      return { ...invoice, amountPaid: amount, status: 'Paid', paymentHistory }
    }))

    if (payment) {
      const nextPayment = normalizePaymentRecord({
        id: payment.id || `payment-${Date.now()}`,
        ...payment,
        invoiceId,
        clientId: invoiceMatch?.clientId || null,
        projectId: invoiceMatch?.projectId || null,
        contractId: invoiceMatch?.contractId || null,
        estimateId: invoiceMatch?.estimateId || null,
        leadId: invoiceMatch?.leadId || null,
        contractorId: invoiceMatch?.contractorId || invoicesContractorId || undefined,
        status: 'Recorded',
      })

      setPersistedPayments((current) => dedupePayments([nextPayment, ...current]))
    }

    showToast(t('paymentRecorded'))
  }

  function markInvoiceSent(invoiceId) {
    setInvoiceRecords((current) => current.map((invoice) => invoice.id === invoiceId && invoice.status === 'Draft' ? { ...invoice, status: 'Sent' } : invoice))
  }

  function createScheduleEvent(event, source = 'event') {
    setScheduleEvents((current) => sortScheduleEventRecords([{ ...event }, ...current.filter((item) => item.id !== event.id)]))
    showToast(t(source === 'job' ? 'jobScheduled' : 'eventCreated'))
    addNotification('notificationEventScheduledTitle', 'notificationEventScheduledMessage')
  }

  function updateScheduleEvent(eventId, updates) {
    setScheduleEvents((current) => sortScheduleEventRecords(current.map((event) => (event.id === eventId ? { ...event, ...updates } : event))))
    showToast(t('eventUpdated'))
  }

  async function markScheduleEventComplete(eventId) {
    const existingEvent = scheduleEvents.find((event) => event.id === eventId)

    if (!existingEvent) {
      return
    }

    const completionUpdates = {
      ...existingEvent,
      status: 'Complete',
    }

    const response = await dataProvider.events.update?.(eventId, completionUpdates, {
      contractorId: eventsContractorId || projectsContractorId,
    })

    if (response?.error) {
      throw response.error
    }

    updateScheduleEvent(eventId, response?.data || completionUpdates)
  }

  function openScheduleModal({ leadId = '', context = 'event', event = null, origin = '' } = {}) {
    setScheduleModalState({ isOpen: true, leadId: leadId || event?.leadId || '', context, editingEvent: event, origin })
  }

  function closeScheduleModal() {
    setScheduleModalState({ isOpen: false, leadId: '', context: 'event', editingEvent: null, origin: '' })
  }

  function openJobModal({ clientId = '', client = null, origin = '' } = {}) {
    setJobModalState({
      isOpen: true,
      initialClientId: clientId || client?.id || '',
      initialClient: client || null,
      origin,
    })
  }

  function closeJobModal() {
    setJobModalState({ isOpen: false, initialClientId: '', initialClient: null, origin: '' })
  }

  function exportScheduleEvent(event) {
    const startDate = event.date || new Date().toISOString().slice(0, 10)
    const startTime = (event.startTime || event.time || '09:00').slice(0, 5).replace(':', '')
    const endTime = (event.endTime || '10:00').slice(0, 5).replace(':', '')
    const dateStamp = startDate.replaceAll('-', '')
    const reminderMinutes = Number(event.reminder || 0)
    const escapeIcs = (value = '') => String(value).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n')
    const alarm = reminderMinutes > 0 ? `\nBEGIN:VALARM\nTRIGGER:-PT${reminderMinutes}M\nACTION:DISPLAY\nDESCRIPTION:${escapeIcs(event.title)}\nEND:VALARM` : ''
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Aymero//Schedule Event//EN',
      'BEGIN:VEVENT',
      `UID:${event.id || Date.now()}@aymero.local`,
      `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
      `DTSTART:${dateStamp}T${startTime}00`,
      `DTEND:${dateStamp}T${endTime}00`,
      `SUMMARY:${escapeIcs(event.title)}`,
      `LOCATION:${escapeIcs(event.location)}`,
      `DESCRIPTION:${escapeIcs(event.notes || `${event.clientName || ''} - ${event.projectTitle || ''}`)}`,
      alarm,
      'END:VEVENT',
      'END:VCALENDAR',
    ].join('\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${(event.title || 'aymero-event').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  function openProject(leadId) {
    const matchingLead = findLeadByProjectLookup(visibleLeads, leadId)
    const routeId = matchingLead?.projectId || matchingLead?.project_id || ''

    if (!routeId) {
      navigate(`/leads/${matchingLead?.id || leadId}`)
      setSidebarOpen(false)
      return
    }

    navigate(`/projects/${routeId}`, {
      state: {
        source: 'project',
        projectId: routeId,
        leadId: matchingLead?.id || leadId,
      },
    })
    setSidebarOpen(false)
  }

  function openCalendarProject(projectId, leadId = '') {
    if (!projectId) {
      if (leadId) openLead(leadId)
      return
    }

    const matchingLead = findLeadByProjectLookup(visibleLeads, projectId, leadId)
    navigate(`/projects/${projectId}`, {
      state: {
        source: 'project',
        projectId,
        leadId: matchingLead?.id || leadId || null,
      },
    })
    setSidebarOpen(false)
  }

  function openEstimateForLead(leadId, estimateRecord = null) {
    if (estimateRecord?.routeUsesEstimateId && estimateRecord?.id) {
      navigate(`/estimates/${estimateRecord.id}`, {
        state: {
          source: 'estimate',
          estimateId: estimateRecord.id,
          projectId: estimateRecord.projectId || estimateRecord.project_id || null,
          leadId: estimateRecord.leadId || estimateRecord.lead_id || null,
        },
      })
      setSidebarOpen(false)
      return
    }

    const matchingLead = findLeadByProjectLookup(visibleLeads, leadId)
    const hasProject = Boolean(matchingLead?.projectId || matchingLead?.project_id)
    const routeId = hasProject ? resolveLinkedProjectId(matchingLead, leadId) : (matchingLead?.id || leadId)

    navigate(`/projects/${routeId}/estimate`, {
      state: {
        source: hasProject ? 'project' : 'lead',
        projectId: routeId,
        leadId: matchingLead?.id || leadId,
      },
    })
    setSidebarOpen(false)
  }

  function openContractForLead(leadId, options = {}) {
    const matchingLead = findLeadByProjectLookup(visibleLeads, leadId)
    const routeId = options.projectId || resolveLinkedProjectId(matchingLead, leadId)
    const routeLeadId = options.leadId || matchingLead?.id || leadId

    navigate(`/projects/${routeId}/contract`, {
      state: {
        source: options.source || 'project',
        projectId: options.projectId || routeId,
        leadId: routeLeadId,
      },
    })
    setSidebarOpen(false)
  }

  function openLead(leadId) {
    navigate(`/leads/${leadId}`)
    setSidebarOpen(false)
  }

  function openPortal(leadId) {
    const matchingLead = findLeadByProjectLookup(visibleLeads, leadId)
    const portalId = resolvePortalRouteId(matchingLead || { id: leadId })
    const portalUrl = buildPortalShareUrl(portalId)

    if (portalUrl) {
      window.open(portalUrl, '_blank', 'noopener,noreferrer')
    }
    setSidebarOpen(false)
  }

  function openClient(clientId) {
    navigate(`/clients/${clientId}`)
    setSidebarOpen(false)
  }

  const dashboardPage = (
    <DashboardPage
      leads={activeLeads}
      metrics={metrics}
      scheduleEvents={activeScheduleEvents}
      invoices={invoices.filter((invoice) => !archives.deletedInvoiceIds.includes(invoice.id) && !archives.invoiceIds.includes(invoice.id))}
      draggedLeadId={draggedLeadId}
      setDraggedLeadId={setDraggedLeadId}
      selectedMobileStage={selectedMobileStage}
      setSelectedMobileStage={setSelectedMobileStage}
      moveLead={moveLead}
      onLeadClick={openLead}
      onOpenProject={openProject}
      onOpenInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)}
      onCreateLeadClick={() => setIsDashboardLeadModalOpen(true)}
      onCreateJob={() => openJobModal({ origin: 'dashboard' })}
      onRecordPayment={() => navigate(appRoutes.invoices)}
      onScheduleVisit={() => openScheduleModal({ origin: 'dashboard' })}
      successMessage={dashboardSuccessMessage}
      showOnboardingReminder={companySettings?.onboarding?.completed === false}
      onResumeOnboarding={() => {
        setIsCompanySetupReopen(true)
        setOnboardingSessionActive(true)
      }}
      sampleGuide={companySettings?.sampleWorkspace?.status === 'installed'
        && Number(companySettings?.sampleWorkspace?.version || 0) === SAMPLE_WORKSPACE_VERSION
        ? companySettings.sampleWorkspace.guide
        : null}
      onOpenSampleGuideItem={openSampleGuideItem}
      onDismissSampleGuide={() => persistSampleGuide({
        ...(companySettings?.sampleWorkspace?.guide || {}),
        dismissed: true,
      })}
      t={t}
      userProfile={userProfile}
    />
  )

  const routeElements = (
    <Routes>
      <Route path={appRoutes.root} element={dashboardPage} />
      <Route path={appRoutes.dashboard} element={dashboardPage} />
      <Route path={appRoutes.leads} element={<LeadsPage leads={visibleLeads} clients={clients} archivedIds={archives.leadIds} onViewLead={openLead} onCreateLead={saveLeadRecord} onArchiveLead={archiveRecord.lead} onRestoreLead={restoreRecord.lead} onDeleteLead={deleteRecord.lead} language={language} t={t} />} />
      <Route path={appRoutes.leadDetail} element={<LeadRoute leads={visibleLeads} clients={clients} archivedIds={archives.leadIds} onBack={() => navigate(appRoutes.leads)} onOpenProject={openProject} onDuplicateLead={duplicateLead} onConvertLeadToJob={(leadId) => transitionLeadStage(leadId, leadPipelineStages.CONVERTED_TO_JOB)} onTransitionLeadStage={transitionLeadStage} onUpdateLead={updateLead} onArchiveLead={archiveRecord.lead} onRestoreLead={restoreRecord.lead} onDeleteLead={deleteRecord.lead} language={language} t={t} />} />
      <Route path={appRoutes.estimates} element={<EstimatesPage leads={visibleLeads} estimates={persistedEstimates} contracts={persistedContracts} archivedIds={archives.leadIds} onOpenEstimate={openEstimateForLead} onConvertEstimate={async (leadId, estimate) => { const contract = await ensureContractForLead(leadId, estimate); if (contract) openContractForLead(leadId, { source: 'estimate', projectId: contract.projectId || contract.project_id || undefined, leadId }) }} onArchiveEstimate={archiveEstimateRecord} onRestoreEstimate={restoreEstimateRecord} onDeleteEstimate={deleteEstimateRecord} t={t} />} />
      <Route path={appRoutes.estimateDetail} element={<EstimateBuilderRoute companySettings={companySettings} leads={visibleLeads} clients={clients} estimates={persistedEstimates} archivedIds={archives.leadIds} onSaveEstimate={saveEstimate} onConvertEstimate={async (leadId, estimate) => { const contract = await ensureContractForLead(leadId, estimate); if (contract) openContractForLead(leadId, { source: 'estimate', projectId: contract.projectId || contract.project_id || undefined, leadId }); return contract }} onSyncEstimateContract={async (leadId, estimate, options = {}) => syncContractFromEstimate(leadId, estimate, options)} onArchiveEstimate={archiveEstimateRecord} onRestoreEstimate={restoreEstimateRecord} onDeleteEstimate={deleteEstimateRecord} t={t} appLanguage={language} />} />
      <Route path={appRoutes.contracts} element={<ContractsPage leads={activeLeads} contracts={persistedContracts} onViewContract={openContractForLead} onRestoreContract={restoreContractRecord} onDeleteContract={deleteContractRecord} t={t} />} />
      <Route path={appRoutes.jobs} element={<JobsPage leads={visibleLeads} clients={clients} archivedIds={archives.projectIds} sampleWorkspace={companySettings?.sampleWorkspace} onViewJob={openCalendarProject} onViewLead={openLead} onCreateJob={() => openJobModal()} onArchiveJob={archiveRecord.job} onRestoreJob={restoreRecord.job} onDeleteJob={deleteRecord.job} t={t} />} />
      <Route path={appRoutes.calendar} element={<CalendarPage leads={activeLeads} scheduleEvents={activeScheduleEvents} onCreateEvent={(event) => createScheduleEvent(event, 'event')} onExportEvent={exportScheduleEvent} onViewProject={openCalendarProject} onViewLead={openLead} onMarkComplete={markScheduleEventComplete} t={t} language={language} />} />
      <Route path={appRoutes.clients} element={<ClientsPage leads={visibleLeads} customClients={customClients} archivedClientIds={archives.clientIds} onOpenClient={openClient} onCreateClient={createClient} onArchiveClient={archiveRecord.client} onRestoreClient={restoreRecord.client} onDeleteClient={deleteRecord.client} language={language} t={t} />} />
      <Route path={appRoutes.clientProfile} element={<ClientProfilePage leads={visibleLeads} customClients={customClients} archivedClientIds={archives.clientIds} onBack={() => navigate('/clients')} onOpenProject={openProject} onOpenLead={openLead} onOpenEstimate={openEstimateForLead} onOpenContract={openContractForLead} onCreateJob={(client) => openJobModal({ clientId: client?.id, client })} onUpdateClient={updateClient} onArchiveClient={archiveRecord.client} onRestoreClient={restoreRecord.client} onDeleteClient={deleteRecord.client} language={language} setLanguage={handleAppLanguageChange} t={t} />} />
      <Route path={appRoutes.invoices} element={<InvoicesPage leads={visibleLeads} clients={clients} invoices={invoices} archivedIds={archives.invoiceIds} deletedIds={archives.deletedInvoiceIds} onViewInvoice={(invoiceId) => navigate(`/invoices/${invoiceId}`)} onRecordPayment={(invoiceId) => navigate(`/invoices/${invoiceId}`)} onArchiveInvoice={archiveRecord.invoice} onRestoreInvoice={restoreRecord.invoice} onDeleteInvoice={deleteRecord.invoice} onInvoiceSent={markInvoiceSent} t={t} appLanguage={language} />} />
      <Route path={appRoutes.invoiceDetail} element={<InvoiceDetailRoute companySettings={companySettings} leads={visibleLeads} clients={clients} invoices={invoices} invoicesLoaded={areInvoicesLoaded} archivedIds={archives.invoiceIds} deletedIds={archives.deletedInvoiceIds} onUpdateInvoice={updateInvoice} onRecordInvoicePayment={recordInvoicePayment} onMarkInvoicePaid={markInvoicePaid} onInvoiceSent={markInvoiceSent} onArchiveInvoice={archiveRecord.invoice} onRestoreInvoice={restoreRecord.invoice} onDeleteInvoice={deleteRecord.invoice} t={t} appLanguage={language} />} />
      <Route path={appRoutes.settings} element={<SettingsPage settings={companySettings} onSaveSettings={(settings) => { setCompanySettings(settings); showToast(t('settingsSaved')) }} onOpenCompanySetup={() => { setIsCompanySetupReopen(true); setOnboardingSessionActive(true) }} onCreateSampleData={installSampleWorkspace} onUpdateSampleData={updateInstalledSampleWorkspace} onRemoveSampleData={uninstallSampleWorkspace} onReopenSampleGuide={async () => { const result = await persistSampleGuide({ ...(companySettings?.sampleWorkspace?.guide || {}), dismissed: false }); if (!result?.error) navigate(appRoutes.dashboard); return result }} onOpenSampleWorkspace={() => navigate(appRoutes.dashboard)} language={language} setLanguage={setLanguage} portalLanguage={portalLanguage} setPortalLanguage={setPortalLanguage} t={t} />} />
      <Route path={appRoutes.projects} element={<ProjectRoute companySettings={companySettings} leads={visibleLeads} clients={clients} scheduleEvents={visibleScheduleEvents} archivedIds={archives.projectIds} archivedScheduleEventIds={archives.scheduleEventIds} onBack={() => navigate('/dashboard')} onOpenPortal={openPortal} onOpenContract={openContractForLead} onConvertEstimate={async (leadId) => { const contract = await ensureContractForLead(leadId); if (contract) openContractForLead(leadId, { source: 'project', projectId: contract.projectId || contract.project_id || undefined, leadId }) }} onUpdateLead={updateLead} onRecordPayment={recordProjectPayment} onUpdatePayment={updateProjectPayment} onDeletePayment={deleteProjectPayment} onUploadPhotos={uploadProjectPhotos} onScheduleEvent={openScheduleModal} onExportEvent={exportScheduleEvent} onArchiveScheduleEvent={archiveRecord.scheduleEvent} onRestoreScheduleEvent={restoreRecord.scheduleEvent} onDeleteScheduleEvent={deleteRecord.scheduleEvent} onArchiveProject={archiveRecord.project} onRestoreProject={restoreRecord.project} onDeleteProject={deleteRecord.project} language={language} t={t} />} />
      <Route path={appRoutes.projectEstimate} element={<EstimateBuilderRoute companySettings={companySettings} leads={visibleLeads} clients={clients} estimates={persistedEstimates} archivedIds={archives.leadIds} onSaveEstimate={saveEstimate} onConvertEstimate={async (leadId, estimate) => { const contract = await ensureContractForLead(leadId, estimate); if (contract) openContractForLead(leadId, { source: 'estimate', projectId: contract.projectId || contract.project_id || undefined, leadId }); return contract }} onSyncEstimateContract={async (leadId, estimate, options = {}) => syncContractFromEstimate(leadId, estimate, options)} onArchiveEstimate={archiveEstimateRecord} onRestoreEstimate={restoreEstimateRecord} onDeleteEstimate={deleteEstimateRecord} t={t} appLanguage={language} />} />
      <Route path={appRoutes.projectContract} element={<ContractRoute companySettings={companySettings} leads={visibleLeads} clients={clients} onSaveContract={saveContract} onMarkContractSigned={markContractSigned} onMarkContractUnsigned={markContractUnsigned} onArchiveContract={archiveContractRecord} t={t} appLanguage={language} />} />
      <Route path={appRoutes.portal} element={<PortalRoute companySettings={companySettings} projects={visibleLeads} clients={clients} onBack={() => navigate(-1)} t={portalT} language={portalLanguage} setLanguage={setPortalLanguage} />} />
      <Route path={appRoutes.login} element={<LoginPage t={t} language={language} setLanguage={setLanguage} />} />
      <Route path={appRoutes.signup} element={<SignupPage t={t} language={language} setLanguage={setLanguage} />} />
      <Route path={appRoutes.forgotPassword} element={<ForgotPasswordPage t={t} language={language} setLanguage={setLanguage} />} />
      {ENABLE_DEVELOPER_ROUTES ? (
        <>
          <Route path={appRoutes.developerHealth} element={<Suspense fallback={null}><TranslationAuditPage t={t} /></Suspense>} />
          <Route path={appRoutes.developerTranslations} element={<Suspense fallback={null}><TranslationAuditPage t={t} /></Suspense>} />
        </>
      ) : null}
      <Route path="*" element={<Navigate to={appRoutes.dashboard} replace />} />
    </Routes>
  )

  if (isAuthPage || isPortalRoute) {
    return (
      <AnalyticsModeProvider settings={companySettings}>
        {routeElements}
      </AnalyticsModeProvider>
    )
  }

  if (USE_AUTH && isLoading) {
    return null
  }

  if (USE_AUTH && !isAuthenticated) {
    return <Navigate to={appRoutes.login} replace state={{ from: location.pathname }} />
  }

  if (USE_AUTH && isAuthenticated && (onboardingRequired || onboardingSessionActive || isCompanySetupReopen || shouldAutoOpenOnboarding) && !isDeveloperRoute) {
    return (
      <Suspense fallback={<div className="min-h-screen bg-slate-50" />}>
          <AuthOnboardingPage
            t={t}
            language={language}
            setLanguage={handleAppLanguageChange}
            settings={companySettings}
            onPersist={persistOnboardingSettings}
            onAddSampleData={installSampleWorkspace}
            onClose={() => {
              closeOnboarding()
              navigate(appRoutes.dashboard, { replace: true })
            }}
            onCreateClient={() => {
              closeOnboarding()
              navigate(appRoutes.clients, { replace: true, state: { createClient: true } })
            }}
            onGoToDashboard={() => {
              closeOnboarding()
              navigate(appRoutes.dashboard, { replace: true })
            }}
            isReopen={isCompanySetupReopen}
          />
      </Suspense>
    )
  }

  if (isAwaitingResolvedSettings && !isDeveloperRoute) {
    return null
  }

  if (USE_AUTH && isAuthenticated && !hasContractorAccess && !isDeveloperRoute) {
    return (
      <div className="min-h-screen bg-slate-50 text-slate-950">
        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <AuthSetupPage
            title={t('authContractorSetupRequiredTitle')}
            message={t('authContractorSetupRequiredMessage')}
            helper={authSetupError?.code === 'MULTIPLE_CONTRACTOR_MEMBERSHIPS'
              ? t('authContractorMultipleMembershipsHelper')
              : t('authContractorSetupRequiredHelper')}
            t={t}
          >
            <button
              type="button"
              onClick={async () => {
                await logout()
                navigate(appRoutes.login, { replace: true })
              }}
              className="rounded-2xl bg-slate-950 px-4 py-3 text-sm font-bold text-white hover:bg-slate-800"
            >
              {t('signOut')}
            </button>
          </AuthSetupPage>
        </main>
      </div>
    )
  }

  return (
    <AnalyticsModeProvider settings={companySettings}>
      <div className="min-h-screen bg-[#f5f7fb] text-slate-950">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} t={t} companySettings={companySettings} todaySummary={mobileTodaySummary} />

        <div className="lg:pl-[280px]">
          <div className={isMobileClientProfileRoute ? 'hidden lg:block' : ''}>
            <Topbar
              onMenuClick={() => setSidebarOpen(true)}
              language={language}
              setLanguage={handleAppLanguageChange}
              t={t}
              notifications={notifications}
              onMarkAllNotificationsRead={markAllNotificationsRead}
              onClearNotifications={clearNotifications}
              userProfile={userProfile}
              onSaveUserProfile={(nextProfile) => {
                const normalizedLanguage = normalizeSupportedLanguage(nextProfile?.preferredLanguage, language)
                handleAppLanguageChange(normalizedLanguage)
                setUserProfilesByUserId((current) => ({
                  ...current,
                  [activeUserProfileKey]: {
                    ...(current[activeUserProfileKey] || {}),
                    ...normalizeUserProfileDraft(nextProfile, normalizedLanguage),
                  },
                }))
              }}
              onOpenSettings={() => navigate('/settings')}
              onCreateLead={() => setIsDashboardLeadModalOpen(true)}
              onCreateJob={() => openJobModal()}
            />
          </div>

          <main className={mainLayoutClassName}>{routeElements}</main>
        </div>
        <LeadFormModal isOpen={isDashboardLeadModalOpen} mode="create" clients={clients} defaultClientLanguage={language} onClose={() => setIsDashboardLeadModalOpen(false)} onSave={createLeadFromDashboard} t={t} />
        <JobFormModal
          isOpen={jobModalState.isOpen}
          clients={clients}
          initialClientId={jobModalState.initialClientId}
          initialClient={jobModalState.initialClient}
          onClose={closeJobModal}
          onSave={createJobFromModal}
          t={t}
        />
        <ScheduleEventModal
          isOpen={scheduleModalState.isOpen}
          leads={activeLeads}
          initialLeadId={scheduleModalState.leadId}
          context={scheduleModalState.context}
          editingEvent={scheduleModalState.editingEvent}
          onClose={closeScheduleModal}
          onSave={async (event) => {
            if (scheduleSaveInFlightRef.current) {
              return
            }

            scheduleSaveInFlightRef.current = true

            try {
              const eventPayload = {
                ...event,
                contractorId: contractor?.contractorId || company?.contractorId || session?.user?.user_metadata?.contractor_id || eventsContractorId || projectsContractorId || undefined,
              }
              let response = null

              if (scheduleModalState.editingEvent?.id) {
                response = await dataProvider.events.update?.(scheduleModalState.editingEvent.id, eventPayload, { contractorId: eventsContractorId || projectsContractorId })
              } else {
                response = await dataProvider.events.create?.(eventPayload, { contractorId: eventsContractorId || projectsContractorId })
              }

              if (response?.error) {
                throw response.error
              }

              const savedEvent = { ...eventPayload, ...(response?.data || {}) }
              const shouldNavigateFromDashboard = scheduleModalState.origin === 'dashboard'
              const savedProjectId = savedEvent.projectId || savedEvent.project_id || ''

              if (scheduleModalState.editingEvent?.id) updateScheduleEvent(scheduleModalState.editingEvent.id, savedEvent)
              else createScheduleEvent(savedEvent, scheduleModalState.context)
              closeScheduleModal()
              if (shouldNavigateFromDashboard) {
                navigate(savedProjectId ? appRoutes.projects.replace(':id', savedProjectId) : appRoutes.calendar)
              }
            } catch (error) {
              logLeadDevError('[dev] Failed to save schedule event.', error, {
                event,
                context: scheduleModalState.context,
              })
            } finally {
              scheduleSaveInFlightRef.current = false
            }
          }}
          t={t}
        />
      </div>
    </AnalyticsModeProvider>
  )
}

function ProjectRoute({ companySettings, leads, clients, scheduleEvents = [], archivedIds = [], archivedScheduleEventIds = [], onBack, onOpenPortal, onOpenContract, onConvertEstimate, onUpdateLead, onRecordPayment, onUpdatePayment, onDeletePayment, onUploadPhotos, onScheduleEvent, onExportEvent, onArchiveScheduleEvent, onRestoreScheduleEvent, onDeleteScheduleEvent, onArchiveProject, onRestoreProject, onDeleteProject, language, t }) {
  const { id, leadId } = useParams()
  const projectId = id || leadId
  const lead = findLeadByProjectLookup(leads, projectId)
  const leadRecordId = lead?.id || ''

  return (
      <ProjectDetailPage
      lead={lead}
      companySettings={companySettings}
      clients={clients}
      isArchived={archivedIds.includes(projectId)}
      onBack={onBack}
      onOpenPortal={(portalTargetId) => onOpenPortal(portalTargetId || projectId)}
      onOpenContract={onOpenContract}
      onConvertEstimate={onConvertEstimate}
      onUpdateLead={onUpdateLead}
      onRecordPayment={(payment) => onRecordPayment?.(leadRecordId, payment)}
      onUpdatePayment={(payment) => onUpdatePayment?.(leadRecordId, payment)}
      onDeletePayment={(payment) => onDeletePayment?.(leadRecordId, payment)}
      onUploadPhotos={(photos, options) => onUploadPhotos?.(leadRecordId, photos, options)}
      scheduleEvents={scheduleEvents}
      archivedScheduleEventIds={archivedScheduleEventIds}
      onScheduleEvent={() => onScheduleEvent?.({ leadId: leadRecordId, context: 'job' })}
      onEditScheduleEvent={(event) => onScheduleEvent?.({ leadId: leadRecordId, context: 'job', event })}
      onExportEvent={onExportEvent}
      onArchiveScheduleEvent={onArchiveScheduleEvent}
      onRestoreScheduleEvent={onRestoreScheduleEvent}
      onDeleteScheduleEvent={onDeleteScheduleEvent}
      onArchiveProject={() => onArchiveProject(projectId)}
      onRestoreProject={() => onRestoreProject(projectId)}
      onDeleteProject={() => onDeleteProject(projectId)}
      language={language}
      t={t}
    />
  )
}

function LeadRoute({ leads, clients, archivedIds = [], onBack, onOpenProject, onDuplicateLead, onConvertLeadToJob, onTransitionLeadStage, onUpdateLead, onArchiveLead, onRestoreLead, onDeleteLead, language, t }) {
  const { id } = useParams()
  const lead = leads.find((item) => item.id === id)

  return (
    <LeadDetailPage
      lead={lead}
      clients={clients}
      archivedIds={archivedIds}
      onBack={onBack}
      onOpenProject={onOpenProject}
      onDuplicateLead={onDuplicateLead}
      onConvertLeadToJob={onConvertLeadToJob}
      onTransitionLeadStage={onTransitionLeadStage}
      onUpdateLead={onUpdateLead}
      onArchiveLead={onArchiveLead}
      onRestoreLead={onRestoreLead}
      onDeleteLead={onDeleteLead}
      language={language}
      t={t}
    />
  )
}

function PortalRoute({ companySettings, projects, clients, onBack, t, language, setLanguage }) {
  return <CustomerPortalPage projects={projects} clients={clients} onBack={onBack} t={t} language={language} setLanguage={setLanguage} companySettings={companySettings} />
}

function ProjectNotFound({ onBack, t }) {
  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
      <h1 className="text-2xl font-bold text-slate-950">{t('projectNotFound')}</h1>
      <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t('projectNotFoundHelp')}</p>
      <button onClick={onBack} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">
        {t('backToDashboardAction')}
      </button>
    </section>
  )
}

export default App
