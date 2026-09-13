import { Component, useEffect, useMemo, useState } from 'react'
import { Archive, CalendarDays, Camera, CheckCircle2, ChevronLeft, ChevronRight, Copy, Edit3, ExternalLink, FileText, MapPin, MoreVertical, Share2, DollarSign, Trash2, Undo2, X } from 'lucide-react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { ActionMenu } from '../components/common/ActionMenu'
import { RecordBackButton } from '../components/common/RecordBackButton'
import { AymeroLoader } from '../components/common/AymeroLoader'
import { ModalShell } from '../components/common/ModalShell'
import { InfoCard } from '../components/ui/InfoCard'
import { DetailRow } from '../components/ui/DetailRow'
import { StatusBadge } from '../components/ui/StatusBadge'
import { currency, formatDisplayDate } from '../utils/formatters'
import { getPortalData, normalizePortalShareUrl } from '../utils/portal'
import { JobFormModal } from '../components/jobs/JobFormModal'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { SendToCustomerModal } from '../components/common/SendToCustomerModal'
import { RecordPaymentModal } from '../components/common/RecordPaymentModal'
import { PhotoUploadModal } from '../components/common/PhotoUploadModal'
import { ProjectScheduleCard } from '../components/projects/ProjectScheduleCard'
import { useToast } from '../components/common/ToastProvider'
import { USE_SUPABASE, USE_SUPABASE_ESTIMATES, USE_SUPABASE_EVENTS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import dataProvider from '../services/dataProvider'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { readLinkedContractDraft } from '../utils/contractLinks'
import { hasEstimateData, readLinkedEstimateDraft, resolveEstimateTotal, toSafeNumber, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { formatContractDisplayNumber } from '../utils/contractNumber'
import { formatEstimateDisplayNumber } from '../utils/estimateNumber'
import { PROJECT_PHOTO_MAX_FILE_SIZE_BYTES, revokeProjectPhotoPreviewUrl, validateProjectPhotoFile } from '../services/photosService'
import { calculateProjectPaymentSummary, collectProjectInvoiceIds, dedupePayments, mergeProjectTimeline, normalizePaymentRecord } from '../utils/projectPayments'
import { calculateProjectFinancialSummary } from '../utils/projectFinancials'
import { dedupeById, getEstimatesForProject, getSelectedEstimateForProject, resolveLinkedProjectId } from '../utils/projectIdentity'
import { getRecordDetailsTitleKey } from '../utils/recordDetailsTitle'
import { sortScheduleEvents } from '../utils/scheduleEvents'
import { getInvoiceRemainingBalance } from '../utils/invoiceRecords'
import { buildProjectWorkspaceViewModel, selectProjectWorkspaceInvoices } from '../utils/projectWorkspaceViewModel'
import { resolveProjectHeroActionIds } from '../utils/projectHeroActions'
import { buildInvoicePaymentContext, getEligiblePaymentInvoices, validateInvoicePayment, validateProjectPaymentAmount } from '../utils/paymentAllocation'
import { parsePaymentAmount } from '../utils/paymentAmount'
import { getPaymentPersistenceErrorMessage, logPaymentPersistenceError } from '../utils/paymentErrors'
import { withNavigationContext } from '../utils/navigationContext'
import { canCreateContractFromEstimate } from '../utils/estimateFinalization'
import projectWorkspaceHeroBackground from '../assets/page-heroes/jobs-bg.png'

function logProjectDetailDevError(message, error, meta) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error(message, {
    error,
    ...meta,
  })
}

function logProjectPaymentDev(event, details) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.info(`[dev] Project payment ${event}.`, details)
}

async function copyTextToClipboard(value) {
  const text = String(value || '').trim()
  if (!text) throw new Error('Missing clipboard value')

  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  const didCopy = document.execCommand('copy')
  textarea.remove()

  if (!didCopy) throw new Error('Clipboard copy failed')
}

function matchesProjectScheduleEvent(event = {}, { projectId = '', relatedLeadId = '', clientId = '', projectTitle = '', projectType = '' } = {}) {
  if (!event) return false

  if (projectId && event.projectId === projectId) {
    return true
  }

  if (relatedLeadId && event.leadId === relatedLeadId) {
    return true
  }

  if (!event.projectId && !event.leadId && !projectId && !relatedLeadId) {
    if (clientId && event.clientId === clientId && (event.projectTitle === projectTitle || event.projectTitle === projectType)) {
      return true
    }

    if (event.projectTitle && (event.projectTitle === projectTitle || event.projectTitle === projectType)) {
      return true
    }
  }

  return false
}

function buildSafePortal(project = {}) {
  const value = toSafeNumber(project.value ?? project.estimatedValue ?? project.contractValue)
  const paid = toSafeNumber(project.amountPaid ?? project.paid)
  const remaining = toSafeNumber(project.remainingBalance ?? project.remaining ?? Math.max(value - paid, 0))
  const sourcePortal = project.portal && typeof project.portal === 'object' ? project.portal : {}

  return {
    ...sourcePortal,
    shareUrl: sourcePortal.shareUrl || '',
    percentComplete: toSafeNumber(sourcePortal.percentComplete ?? 0),
    contractAmount: toSafeNumber(sourcePortal.contractAmount ?? project.contractValue ?? value),
    depositRequired: toSafeNumber(sourcePortal.depositRequired ?? 0),
    depositPaid: toSafeNumber(sourcePortal.depositPaid ?? Math.min(sourcePortal.amountPaid ?? paid, sourcePortal.depositRequired ?? 0)),
    otherPaymentsTotal: toSafeNumber(sourcePortal.otherPaymentsTotal ?? Math.max((sourcePortal.totalPaid ?? sourcePortal.amountPaid ?? paid) - (sourcePortal.depositPaid ?? 0), 0)),
    totalPaid: toSafeNumber(sourcePortal.totalPaid ?? sourcePortal.amountPaid ?? paid),
    amountPaid: toSafeNumber(sourcePortal.amountPaid ?? paid),
    outstandingBalance: toSafeNumber(sourcePortal.outstandingBalance ?? remaining),
    paymentStatus: sourcePortal.paymentStatus || '',
    startDate: sourcePortal.startDate || project.startDate || '',
    estimatedCompletion: sourcePortal.estimatedCompletion || project.targetCompletion || '',
    timeline: Array.isArray(sourcePortal.timeline) ? sourcePortal.timeline : [],
    photos: Array.isArray(sourcePortal.photos) ? sourcePortal.photos : [],
    documents: Array.isArray(sourcePortal.documents) ? sourcePortal.documents : [],
    estimate: sourcePortal.estimate && typeof sourcePortal.estimate === 'object' ? sourcePortal.estimate : {},
    contract: sourcePortal.contract && typeof sourcePortal.contract === 'object' ? sourcePortal.contract : {},
    invoices: Array.isArray(sourcePortal.invoices) ? sourcePortal.invoices : [],
    payments: Array.isArray(sourcePortal.payments) ? sourcePortal.payments : [],
    paymentHistory: Array.isArray(sourcePortal.paymentHistory) ? sourcePortal.paymentHistory : [],
  }
}

function hasProjectEstimate(project = {}) {
  return hasEstimateData(project?.portal?.estimate)
}

function hasProjectContract(project = {}) {
  const contract = project?.portal?.contract

  if (!contract || typeof contract !== 'object') return false
  if (contract.id || contract.number || contract.contractNumber || contract.updatedAt || contract.updated_at) return true
  if (contract.total !== undefined || contract.totalAmount !== undefined || contract.contractAmount !== undefined) return true
  return false
}

function normalizeProjectEstimate(estimate) {
  if (!estimate || typeof estimate !== 'object') return null

  const hasContent = Boolean(
    estimate.id
      || estimate.number
      || estimate.estimateNumber
      || estimate.title
      || estimate.projectTitle
      || estimate.summary
      || estimate.scopeOfWork
      || estimate.updatedAt
      || estimate.updated_at
      || (Array.isArray(estimate.lineItems) && estimate.lineItems.length > 0)
      || estimate.total !== undefined
      || estimate.totalAmount !== undefined
  )

  if (!hasContent) return null

  return {
    ...estimate,
    id: estimate.id || null,
    projectId: estimate.projectId || estimate.project_id || null,
    clientId: estimate.clientId || estimate.client_id || null,
    title: estimate.title || estimate.projectTitle || 'Estimate',
    number: estimate.number || estimate.estimateNumber || '',
    total: toSafeNumber(estimate.total ?? estimate.totalAmount ?? estimate.amount),
    status: estimate.status || 'Draft',
    summary: estimate.summary || estimate.scopeOfWork || '',
    lineItems: Array.isArray(estimate.lineItems) ? estimate.lineItems : [],
  }
}

function normalizeProjectContract(contract) {
  if (!contract || typeof contract !== 'object') return null

  const hasContent = Boolean(
    contract.id
      || contract.number
      || contract.contractNumber
      || contract.total !== undefined
      || contract.totalAmount !== undefined
      || contract.contractAmount !== undefined
      || contract.status
      || contract.signedDate
      || contract.signed_at
  )

  if (!hasContent) return null

  return {
    ...contract,
    id: contract.id || null,
    number: contract.number || contract.contractNumber || '',
    total: toSafeNumber(contract.total ?? contract.totalAmount ?? contract.contractAmount),
    status: contract.status || '',
    signedDate: contract.signedDate || contract.signed_at || '',
  }
}

function formatProjectDetailDate(value, fallback = '') {
  if (!value) return fallback

  const parsedDate = new Date(value)

  if (Number.isNaN(parsedDate.getTime())) {
    return fallback || String(value)
  }

  return parsedDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function resolvePersistedProjectId(project = {}) {
  return project?.projectId || project?.project_id || null
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function isUuid(value) {
  return uuidPattern.test(String(value || '').trim())
}

function getPaymentTypeLabelKey(payment = {}) {
  const paymentTypeKey = payment?.paymentTypeKey || normalizePaymentRecord(payment).paymentTypeKey

  if (paymentTypeKey === 'deposit') return 'deposit'
  if (paymentTypeKey === 'progress') return 'progressPayment'
  if (paymentTypeKey === 'final') return 'finalPayment'
  return 'other'
}

function createSafeProject(project, fallbackId = '') {
  if (!project) return null

  const value = toSafeNumber(project.value ?? project.estimatedValue ?? project.contractValue)
  const estimatedValue = toSafeNumber(project.estimatedValue ?? value)
  const contractValue = toSafeNumber(project.contractValue ?? value)
  const paid = toSafeNumber(project.amountPaid ?? project.paid)
  const remaining = toSafeNumber(project.remainingBalance ?? project.remaining ?? Math.max(value - paid, 0))
  const clientName = project.client || project.clientName || project.customerName || ''
  const address = project.address || project.location || ''
  const projectType = project.projectType || project.jobType || project.projectTitle || ''
  const notes = project.notes || ''
  const description = project.description || ''
  const portal = buildSafePortal({
    ...project,
    value,
    estimatedValue,
    contractValue,
    amountPaid: paid,
    remainingBalance: remaining,
  })

  return {
    ...project,
    id: project.id || fallbackId,
    client: clientName,
    clientName,
    customerName: clientName,
    phone: project.phone || '',
    email: project.email || '',
    address,
    location: address,
    value,
    estimatedValue,
    contractValue,
    paid,
    amountPaid: paid,
    remaining,
    remainingBalance: remaining,
    nextStep: project.nextStep || notes || description || '',
    description,
    notes,
    status: project.status || 'scheduled',
    projectStatus: project.projectStatus || project.status || 'scheduled',
    projectTitle: project.projectTitle || project.title || projectType,
    projectType,
    jobType: project.jobType || projectType,
    priority: project.priority || 'Medium',
    source: project.source || '',
    events: Array.isArray(project.events) ? project.events : [],
    schedule: Array.isArray(project.schedule) ? project.schedule : [],
    scheduleEvents: Array.isArray(project.scheduleEvents) ? project.scheduleEvents : [],
    photos: Array.isArray(project.photos) ? project.photos : [],
    estimates: Array.isArray(project.estimates) ? project.estimates : [],
    contracts: Array.isArray(project.contracts) ? project.contracts : [],
    invoices: Array.isArray(project.invoices) ? project.invoices : [],
    payments: Array.isArray(project.payments) ? project.payments : [],
    portal,
  }
}

function normalizeProjectWorkspacePhoto(photo = {}, fallbackProjectId = '') {
  const previewUrl = photo.previewUrl || photo.url || ''
  const filePath = photo.filePath || photo.file_path || ''
  const fileName = photo.fileName || photo.file_name || filePath.split('/').pop() || ''
  const label = photo.caption || photo.description || ''

  return {
    ...photo,
    id: photo.id || filePath || previewUrl || label,
    contractorId: photo.contractorId || photo.contractor_id || '',
    contractor_id: photo.contractorId || photo.contractor_id || '',
    clientId: photo.clientId || photo.client_id || null,
    client_id: photo.clientId || photo.client_id || null,
    projectId: photo.projectId || photo.project_id || fallbackProjectId,
    project_id: photo.projectId || photo.project_id || fallbackProjectId,
    filePath,
    file_path: filePath,
    fileName,
    file_name: fileName,
    fileSize: Number(photo.fileSize || photo.file_size || 0) || 0,
    file_size: Number(photo.fileSize || photo.file_size || 0) || 0,
    mimeType: photo.mimeType || photo.mime_type || '',
    mime_type: photo.mimeType || photo.mime_type || '',
    caption: photo.caption || photo.description || '',
    description: photo.caption || photo.description || '',
    label,
    previewUrl,
    url: previewUrl,
    source: photo.source || 'seed',
    createdAt: photo.createdAt || photo.created_at || '',
    created_at: photo.createdAt || photo.created_at || '',
  }
}

function dedupeProjectPhotos(photos = [], fallbackProjectId = '') {
  return dedupeById(
    photos.map((photo) => normalizeProjectWorkspacePhoto(photo, fallbackProjectId)),
    ['filePath', 'url', 'label']
  )
}

function formatProjectPhotoFileSize(bytes = 0) {
  const numericBytes = Number(bytes || 0)

  if (!numericBytes) return ''
  if (numericBytes >= 1024 * 1024) return `${(numericBytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(numericBytes / 1024))} KB`
}

function getProjectPhotoDisplayTitle(photo = {}, index = 0, t = (key) => key) {
  const caption = typeof photo?.caption === 'string' ? photo.caption.trim() : ''
  if (caption) return caption
  if (index <= 0) return t('projectPhoto')
  return t('projectPhotoNumber', { number: index + 1 })
}

function ProjectDetailFallbackState({ onBack, t }) {
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

class ProjectDetailErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    logProjectDetailDevError('[dev] ProjectDetailPage crashed while rendering.', error, {
      componentStack: errorInfo?.componentStack || '',
    })
  }

  render() {
    if (this.state.hasError) {
      return <ProjectDetailFallbackState onBack={this.props.onBack} t={this.props.t} />
    }

    return this.props.children
  }
}

function ProjectDetailPageContent({ lead, companySettings, clients = [], estimates = [], invoices = [], scheduleEvents = [], archivedScheduleEventIds = [], isArchived = false, onBack, onOpenPortal, onOpenContract, onConvertEstimate, onCreateInvoice, onMarkProjectComplete, onUpdateLead, onRecordPayment, onUpdatePayment, onDeletePayment, onUploadPhotos, onScheduleEvent, onEditScheduleEvent, onExportEvent, onArchiveScheduleEvent, onRestoreScheduleEvent, onDeleteScheduleEvent, onArchiveProject, onRestoreProject, onDeleteProject, onCreateEstimateOption, onDuplicateEstimateOption, onSelectEstimate, onClearEstimateSelection, language = 'en', t }) {
  const { id, leadId } = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { contractor, company, session } = useAuth()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorId = getProjectsContractorId({ contractor, company, session })
  const routeProjectId = id || leadId || ''
  const fallbackLinkedProjectId = lead?.projectId || lead?.project_id || ''
  const projectId = routeProjectId || lead?.id || ''
  const [project, setProject] = useState(USE_SUPABASE_PROJECTS ? null : lead)
  const [isLoadingProject, setIsLoadingProject] = useState(Boolean(USE_SUPABASE_PROJECTS))
  const [hasLoadedProject, setHasLoadedProject] = useState(!USE_SUPABASE_PROJECTS)
  const [projectLoadError, setProjectLoadError] = useState(null)
  const [estimateRecord, setEstimateRecord] = useState(() => readLinkedEstimateDraft(lead || projectId, projectId || lead?.id || ''))
  const [estimateRecords, setEstimateRecords] = useState(() => getEstimatesForProject({ ...(lead || {}), id: lead?.projectId || lead?.project_id || projectId }, estimates))
  const [contractRecord, setContractRecord] = useState(() => readLinkedContractDraft(lead || projectId, projectId || lead?.id || ''))
  const [paymentRecords, setPaymentRecords] = useState([])
  const [projectEventRecords, setProjectEventRecords] = useState([])
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [showPaymentModal, setShowPaymentModal] = useState(false)
  const [editingPayment, setEditingPayment] = useState(null)
  const [paymentConfirmAction, setPaymentConfirmAction] = useState(null)
  const [showPhotoModal, setShowPhotoModal] = useState(false)
  const [projectPhotos, setProjectPhotos] = useState([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)
  const [isUploadingPhotos, setIsUploadingPhotos] = useState(false)
  const [deletingPhotoId, setDeletingPhotoId] = useState('')
  const [selectedPhotoId, setSelectedPhotoId] = useState('')
  const [photoConfirmAction, setPhotoConfirmAction] = useState(null)
  const [failedPhotoIds, setFailedPhotoIds] = useState([])
  const [hiddenFallbackPhotoIds, setHiddenFallbackPhotoIds] = useState([])
  const [showPortalLinkModal, setShowPortalLinkModal] = useState(false)
  const [showContractSourceModal, setShowContractSourceModal] = useState(false)
  const [contractSourceSelectionId, setContractSourceSelectionId] = useState('')
  const [scheduleConfirmAction, setScheduleConfirmAction] = useState(null)
  const baseProject = useMemo(() => (
    USE_SUPABASE_PROJECTS
      ? { ...(lead || {}), ...(project || {}) }
      : (project || lead)
  ), [lead, project])
  const linkedProjectId = useMemo(() => (
    resolveLinkedProjectId(project)
    || resolveLinkedProjectId(baseProject)
    || fallbackLinkedProjectId
    || (!USE_SUPABASE_PROJECTS ? projectId : '')
  ), [baseProject, fallbackLinkedProjectId, project, projectId])
  const relatedLeadId = useMemo(() => (
    baseProject?.leadId
    || baseProject?.lead_id
    || ((lead?.projectId === projectId || lead?.project_id === projectId) ? lead?.id : null)
    || null
  ), [baseProject, lead, projectId])
  const relatedClient = useMemo(() => (
    clients.find((client) => client.id === (baseProject?.clientId || baseProject?.client_id || lead?.clientId || lead?.client_id))
    || null
  ), [baseProject?.clientId, baseProject?.client_id, clients, lead?.clientId, lead?.client_id])
  const resolvedEstimate = useMemo(() => normalizeProjectEstimate(
    estimateRecord
    || baseProject?.portal?.estimate
    || lead?.portal?.estimate
    || readLinkedEstimateDraft(baseProject || projectId, [projectId, relatedLeadId, lead?.id])
  ), [baseProject, estimateRecord, lead, projectId, relatedLeadId])
  const projectEstimateRecords = useMemo(() => {
    const candidates = [...estimateRecords, ...(resolvedEstimate ? [resolvedEstimate] : [])]
    const scopedProject = { ...(baseProject || {}), id: linkedProjectId || baseProject?.projectId || baseProject?.project_id || projectId }
    const linkedEstimates = getEstimatesForProject(scopedProject, candidates)
    return linkedEstimates.length > 0 || !resolvedEstimate?.id || resolvedEstimate?.projectId || resolvedEstimate?.project_id
      ? linkedEstimates
      : [resolvedEstimate]
  }, [baseProject, estimateRecords, linkedProjectId, projectId, resolvedEstimate])
  const selectedEstimateId = baseProject?.selectedEstimateId || baseProject?.selected_estimate_id || ''
  const selectedProjectEstimate = useMemo(() => (
    selectedEstimateId
      ? projectEstimateRecords.find((estimate) => estimate.id === selectedEstimateId) || null
      : projectEstimateRecords.length === 1 ? projectEstimateRecords[0] : null
  ), [projectEstimateRecords, selectedEstimateId])
  const hasAmbiguousEstimateSelection = projectEstimateRecords.length > 1 && !selectedProjectEstimate
  const contractSourceEstimates = useMemo(() => projectEstimateRecords.filter((estimate) => canCreateContractFromEstimate(estimate?.status)), [projectEstimateRecords])
  const selectedContractSourceEstimate = selectedProjectEstimate && contractSourceEstimates.some((estimate) => estimate.id === selectedProjectEstimate.id)
    ? selectedProjectEstimate
    : contractSourceEstimates.length === 1 ? contractSourceEstimates[0] : null
  const resolvedContract = useMemo(() => normalizeProjectContract(
    contractRecord
    || baseProject?.portal?.contract
    || lead?.portal?.contract
    || readLinkedContractDraft(baseProject || projectId, [projectId, relatedLeadId, lead?.id, resolvedEstimate?.id])
  ), [baseProject, contractRecord, lead, projectId, relatedLeadId, resolvedEstimate?.id])
  const relatedInvoiceIds = useMemo(() => collectProjectInvoiceIds({
    ...(baseProject || {}),
    portal: {
      ...(baseProject?.portal || {}),
      ...(lead?.portal || {}),
    },
    invoices: [
      ...(Array.isArray(baseProject?.invoices) ? baseProject.invoices : []),
      ...(Array.isArray(lead?.invoices) ? lead.invoices : []),
    ],
  }), [baseProject, lead])
  const localPaymentRecords = useMemo(() => dedupePayments([
    ...(Array.isArray(baseProject?.payments) ? baseProject.payments : []),
    ...(Array.isArray(baseProject?.portal?.payments) ? baseProject.portal.payments : []),
    ...(Array.isArray(baseProject?.portal?.paymentHistory) ? baseProject.portal.paymentHistory : []),
    ...(Array.isArray(lead?.payments) ? lead.payments : []),
    ...(Array.isArray(lead?.portal?.payments) ? lead.portal.payments : []),
    ...(Array.isArray(lead?.portal?.paymentHistory) ? lead.portal.paymentHistory : []),
  ]), [baseProject, lead])
  const legacyPaymentSummary = useMemo(() => calculateProjectPaymentSummary({
    ...(baseProject || {}),
    id: linkedProjectId || projectId,
    projectId: linkedProjectId || baseProject?.projectId || baseProject?.project_id || null,
    clientId: baseProject?.clientId || baseProject?.client_id || lead?.clientId || lead?.client_id || null,
    leadId: relatedLeadId || baseProject?.leadId || baseProject?.lead_id || null,
    portal: {
      ...(baseProject?.portal || {}),
      ...(lead?.portal || {}),
      contract: resolvedContract || baseProject?.portal?.contract || lead?.portal?.contract || {},
    },
  }, [...paymentRecords, ...localPaymentRecords], { relatedInvoiceIds }), [baseProject, lead, linkedProjectId, localPaymentRecords, paymentRecords, projectId, relatedInvoiceIds, relatedLeadId, resolvedContract])
  const relatedProjectInvoices = useMemo(() => selectProjectWorkspaceInvoices(invoices, {
    projectIds: [
      linkedProjectId,
      projectId,
      baseProject?.id,
      baseProject?.projectId,
      baseProject?.project_id,
    ],
    leadIds: [relatedLeadId, baseProject?.leadId, baseProject?.lead_id, lead?.id],
    invoiceIds: relatedInvoiceIds,
  }), [baseProject, invoices, lead?.id, linkedProjectId, projectId, relatedInvoiceIds, relatedLeadId])
  const projectFinancialSummary = useMemo(() => calculateProjectFinancialSummary({
    project: {
      ...(baseProject || {}),
      id: linkedProjectId || projectId,
      projectId: linkedProjectId || baseProject?.projectId || baseProject?.project_id || null,
      selectedEstimateId: baseProject?.selectedEstimateId || baseProject?.selected_estimate_id || null,
      portal: {
        ...(baseProject?.portal || {}),
        ...(lead?.portal || {}),
      },
    },
    estimates: projectEstimateRecords,
    contracts: resolvedContract ? [resolvedContract] : [],
    invoices: relatedProjectInvoices,
    payments: [...paymentRecords, ...localPaymentRecords],
  }), [baseProject, lead?.portal, linkedProjectId, localPaymentRecords, paymentRecords, projectEstimateRecords, projectId, relatedProjectInvoices, resolvedContract])
  const paymentSummary = useMemo(() => ({
    ...legacyPaymentSummary,
    projectValue: projectFinancialSummary.agreedValue,
    totalPaid: projectFinancialSummary.totalProjectPaid,
    amountPaid: projectFinancialSummary.totalProjectPaid,
    outstandingBalance: projectFinancialSummary.projectBalance ?? legacyPaymentSummary.outstandingBalance,
    totalProjectPaid: projectFinancialSummary.totalProjectPaid,
    projectBalance: projectFinancialSummary.projectBalance,
    totalInvoiced: projectFinancialSummary.totalInvoiced,
    totalInvoicePaid: projectFinancialSummary.totalInvoicePaid,
    unappliedProjectPayments: projectFinancialSummary.unappliedProjectPayments,
    invoiceAssociatedPayments: projectFinancialSummary.invoiceAssociatedPayments,
    unassociatedProjectPayments: projectFinancialSummary.unassociatedProjectPayments,
    outstandingInvoiced: projectFinancialSummary.outstandingInvoiced,
    remainingToBill: projectFinancialSummary.remainingToBill,
    overbilledAmount: projectFinancialSummary.overbilledAmount,
    isOverbilled: projectFinancialSummary.isOverbilled,
    agreedValueSource: projectFinancialSummary.agreedValueSource,
    agreedValueSourceId: projectFinancialSummary.agreedValueSourceId,
  }), [legacyPaymentSummary, projectFinancialSummary])
  const portalTimeline = useMemo(() => mergeProjectTimeline(
    baseProject?.portal?.timeline || lead?.portal?.timeline || [],
    paymentSummary.payments
  ), [baseProject?.portal?.timeline, lead?.portal?.timeline, paymentSummary.payments])
  const currentLead = useMemo(() => createSafeProject({
    ...(baseProject || {}),
    client: baseProject?.client || baseProject?.clientName || lead?.client || lead?.clientName || relatedClient?.displayName || relatedClient?.name || '',
    clientName: baseProject?.clientName || baseProject?.client || lead?.clientName || lead?.client || relatedClient?.displayName || relatedClient?.name || '',
    customerName: baseProject?.customerName || baseProject?.clientName || baseProject?.client || lead?.customerName || lead?.client || relatedClient?.displayName || relatedClient?.name || '',
    phone: baseProject?.phone || lead?.phone || relatedClient?.phone || '',
    email: baseProject?.email || lead?.email || relatedClient?.email || '',
    address: baseProject?.address || baseProject?.location || lead?.address || lead?.location || relatedClient?.address || '',
    projectTitle: baseProject?.projectTitle || baseProject?.title || lead?.projectTitle || lead?.projectType || '',
    projectType: baseProject?.projectType || lead?.projectType || lead?.projectTitle || '',
    source: baseProject?.source || lead?.source || '',
    priority: baseProject?.priority || lead?.priority || 'Medium',
    estimateId: baseProject?.estimateId || lead?.estimateId || resolvedEstimate?.id || null,
    value: paymentSummary.projectValue,
    estimatedValue: paymentSummary.projectValue,
    paid: paymentSummary.totalPaid,
    amountPaid: paymentSummary.totalPaid,
    remaining: paymentSummary.outstandingBalance,
    remainingBalance: paymentSummary.outstandingBalance,
    payments: paymentSummary.payments,
    portal: {
      ...(baseProject?.portal || {}),
      ...(lead?.portal || {}),
      contractAmount: paymentSummary.projectValue,
      depositRequired: paymentSummary.depositRequired,
      depositPaid: paymentSummary.depositPaidTotal,
      otherPaymentsTotal: paymentSummary.otherPaymentsTotal,
      totalPaid: paymentSummary.totalPaid,
      amountPaid: paymentSummary.totalPaid,
      outstandingBalance: paymentSummary.outstandingBalance,
      paymentStatus: paymentSummary.paymentStatus,
      timeline: portalTimeline,
      payments: paymentSummary.payments,
      paymentHistory: paymentSummary.payments,
      estimate: resolvedEstimate || {},
      contract: resolvedContract || {},
    },
  }, projectId), [baseProject, lead, paymentSummary, portalTimeline, projectId, relatedClient, resolvedContract, resolvedEstimate])
  const portal = useMemo(() => {
    if (!currentLead) {
      return buildSafePortal({})
    }

    try {
      return buildSafePortal({
        ...currentLead,
        portal: getPortalData(currentLead),
      })
    } catch (error) {
      logProjectDetailDevError('[dev] ProjectDetailPage failed to build portal data.', error, {
        projectId,
      })
      return buildSafePortal(currentLead)
    }
  }, [currentLead, projectId])
  const requiresPersistedProjectLink = USE_SUPABASE || USE_SUPABASE_PROJECTS || USE_SUPABASE_PAYMENTS
  const persistedProjectId = useMemo(() => {
    const projectCandidates = [
      project?.id,
      resolvePersistedProjectId(project),
      baseProject?.id,
      resolvePersistedProjectId(baseProject),
      currentLead?.id,
      resolvePersistedProjectId(currentLead),
      linkedProjectId,
      fallbackLinkedProjectId,
    ].filter(Boolean)

    if (!requiresPersistedProjectLink) {
      return projectCandidates[0] || ''
    }

    return projectCandidates.find((candidateId) => isUuid(candidateId)) || ''
  }, [baseProject, currentLead, fallbackLinkedProjectId, linkedProjectId, project, requiresPersistedProjectLink])
  const canRecordPayment = Boolean(persistedProjectId)
  const fallbackProjectPhotos = useMemo(() => {
    const hiddenIds = new Set(hiddenFallbackPhotoIds)
    const scopedProjectId = linkedProjectId || resolvePersistedProjectId(currentLead) || currentLead?.id || projectId

    return dedupeProjectPhotos([
      ...(Array.isArray(baseProject?.photos) ? baseProject.photos : []),
      ...(Array.isArray(baseProject?.portal?.photos) ? baseProject.portal.photos : []),
      ...(Array.isArray(lead?.photos) ? lead.photos : []),
      ...(Array.isArray(lead?.portal?.photos) ? lead.portal.photos : []),
    ], scopedProjectId).filter((photo) => !hiddenIds.has(photo.id))
  }, [baseProject?.photos, baseProject?.portal?.photos, currentLead, hiddenFallbackPhotoIds, lead?.photos, lead?.portal?.photos, linkedProjectId, projectId])
  const galleryPhotos = useMemo(() => (
    projectPhotos.map((photo, index) => ({
      ...photo,
      displayTitle: getProjectPhotoDisplayTitle(photo, index, t),
    }))
  ), [projectPhotos, t])
  const selectedPhotoIndex = useMemo(() => (
    galleryPhotos.findIndex((photo) => photo.id === selectedPhotoId)
  ), [galleryPhotos, selectedPhotoId])
  const selectedPhoto = selectedPhotoIndex >= 0 ? galleryPhotos[selectedPhotoIndex] : null
  const projectIsArchived = Boolean(currentLead?.isArchived || currentLead?.archivedAt || isArchived)
  const recordDetailsTitle = t(getRecordDetailsTitleKey(currentLead, { isProjectWorkspace: true }))
  const hasEstimate = hasProjectEstimate(currentLead)
  const hasContract = hasProjectContract(currentLead)
  const hasLeadLink = Boolean(currentLead?.leadId)
  const hasClientLink = Boolean(currentLead?.clientId)
  const relatedInvoiceById = useMemo(() => new Map(
    relatedProjectInvoices.map((invoice) => [invoice.id, invoice])
  ), [relatedProjectInvoices])
  useEffect(() => {
    if (!import.meta.env.DEV) return

    if (!routeProjectId && !fallbackLinkedProjectId) {
      // eslint-disable-next-line no-console
      console.warn('[dev] Project Workspace opened without a projectId.', {
        routeState: location.state,
        leadId: lead?.id || null,
      })
      return
    }

    if (location.state && !location.state.projectId && fallbackLinkedProjectId) {
      // eslint-disable-next-line no-console
      console.warn('[dev] Project Workspace received incomplete route state; hydrating from resolved project id instead.', {
        routeProjectId,
        fallbackLinkedProjectId,
        routeState: location.state,
      })
    }
  }, [fallbackLinkedProjectId, lead?.id, location.state, routeProjectId])

  useEffect(() => {
    if (!USE_SUPABASE_PROJECTS) {
      setProject(lead || null)
      setIsLoadingProject(false)
      setHasLoadedProject(true)
      setProjectLoadError(null)
      return undefined
    }

    const lookupProjectId = routeProjectId || fallbackLinkedProjectId

    if (!lookupProjectId) {
      setProject(null)
      setIsLoadingProject(false)
      setHasLoadedProject(true)
      setProjectLoadError(null)
      return undefined
    }

    let isCancelled = false

    async function loadProject() {
      setIsLoadingProject(true)
      setProjectLoadError(null)

      try {
        let response = await dataProvider.projects.getById(lookupProjectId, { contractorId })

        if ((response?.error || !response?.data) && fallbackLinkedProjectId && fallbackLinkedProjectId !== lookupProjectId) {
          response = await dataProvider.projects.getById(fallbackLinkedProjectId, { contractorId })
        }

        if (isCancelled) return

        if (response?.error) {
          setProject(null)
          setProjectLoadError(response.error)
          logProjectDetailDevError('[dev] ProjectDetailPage failed to load project.', response.error, {
            projectId: lookupProjectId,
            fallbackLinkedProjectId,
          })
          return
        }

        setProject(response?.data || null)
      } catch (error) {
        if (isCancelled) return

        setProject(null)
        setProjectLoadError(error)
        logProjectDetailDevError('[dev] ProjectDetailPage threw while loading project.', error, {
          projectId: lookupProjectId,
          fallbackLinkedProjectId,
        })
      } finally {
        if (!isCancelled) {
          setHasLoadedProject(true)
          setIsLoadingProject(false)
        }
      }
    }

    loadProject()

    return () => {
      isCancelled = true
    }
  }, [contractorId, fallbackLinkedProjectId, lead, routeProjectId])

  useEffect(() => {
    let isCancelled = false

    async function loadEstimate() {
      const draftEstimate = readLinkedEstimateDraft(baseProject || projectId, [projectId, relatedLeadId, lead?.id])
      const knownEstimateId = baseProject?.selectedEstimateId
        || baseProject?.selected_estimate_id
        || baseProject?.estimateId
        || baseProject?.estimate_id
        || lead?.estimateId
        || draftEstimate?.id
        || null

      if (!linkedProjectId) {
        if (!isCancelled) {
          setEstimateRecord(draftEstimate)
          setEstimateRecords(draftEstimate ? [draftEstimate] : [])
        }
        return
      }

      try {
        let resolvedEstimateRecord = null
        let estimateList = Array.isArray(estimates) ? estimates : []

        if (!knownEstimateId && estimateList.length > 0) {
          resolvedEstimateRecord = getSelectedEstimateForProject({ ...(baseProject || {}), id: linkedProjectId }, estimateList)
        }

        if (knownEstimateId) {
          const estimateByIdResponse = await dataProvider.estimates.getById?.(knownEstimateId, { contractorId })

          if (estimateByIdResponse?.data && !estimateByIdResponse?.error) {
            resolvedEstimateRecord = estimateByIdResponse.data
          }
        }

        if (!resolvedEstimateRecord && (USE_SUPABASE || USE_SUPABASE_ESTIMATES)) {
          const response = await dataProvider.estimates.list({
            contractorId,
            projectId: linkedProjectId,
            includeArchived: true,
          })

          if (isCancelled) return

          if (!response?.error) {
            estimateList = response?.data || []
            resolvedEstimateRecord = getSelectedEstimateForProject({ ...(baseProject || {}), id: linkedProjectId }, estimateList)
          }
        }

        const responseHasAmbiguousEstimates = !resolvedEstimateRecord && !knownEstimateId
          ? (() => {
              const activeEstimates = estimateList.filter((estimate) => !estimate?.archivedAt && !estimate?.archived_at)
              return activeEstimates.length > 1
            })()
          : false
        const nextEstimate = resolvedEstimateRecord || (responseHasAmbiguousEstimates ? null : draftEstimate || lead?.portal?.estimate || null)

        if (!isCancelled) {
          setEstimateRecord(nextEstimate)
          setEstimateRecords(estimateList)

          if (nextEstimate) {
            writeLinkedEstimateDrafts([linkedProjectId, projectId, relatedLeadId, knownEstimateId], nextEstimate)
          }
        }
      } catch (error) {
        if (!isCancelled) {
          setEstimateRecord(draftEstimate)
          setEstimateRecords(draftEstimate ? [draftEstimate] : [])
        }
      }
    }

    loadEstimate()

    return () => {
      isCancelled = true
    }
  }, [baseProject, contractorId, estimates, lead, linkedProjectId, projectId, relatedLeadId])

  useEffect(() => {
    let isCancelled = false

    async function loadContract() {
      const draftContract = readLinkedContractDraft(baseProject || projectId, [projectId, relatedLeadId, lead?.id, resolvedEstimate?.id])
      const knownContractId = baseProject?.contractId || baseProject?.contract_id || lead?.contractId || draftContract?.id || null

      if (!linkedProjectId && !resolvedEstimate?.id) {
        if (!isCancelled) {
          setContractRecord(draftContract)
        }
        return
      }

      try {
        let resolvedContractRecord = null

        if (knownContractId) {
          const contractByIdResponse = await dataProvider.contracts.getById?.(knownContractId, { contractorId })

          if (contractByIdResponse?.data && !contractByIdResponse?.error) {
            resolvedContractRecord = contractByIdResponse.data
          }
        }

        if (!resolvedContractRecord && resolvedEstimate?.id) {
          const response = await dataProvider.contracts.list({
            contractorId,
            estimateId: resolvedEstimate.id,
            includeArchived: true,
          })

          if (!response?.error) {
            resolvedContractRecord = response?.data?.[0] || null
          }
        }

        if (!resolvedContractRecord && projectId) {
          const response = await dataProvider.contracts.list({
            contractorId,
            projectId: linkedProjectId,
            includeArchived: true,
          })

          if (!response?.error) {
            resolvedContractRecord = response?.data?.[0] || null
          }
        }

        if (!isCancelled) {
          setContractRecord(resolvedContractRecord || draftContract || lead?.portal?.contract || null)
        }
      } catch (error) {
        if (!isCancelled) {
          setContractRecord(draftContract)
        }
      }
    }

    loadContract()

    return () => {
      isCancelled = true
    }
  }, [baseProject, contractorId, lead, linkedProjectId, projectId, relatedLeadId, resolvedEstimate?.id])

  useEffect(() => {
    let isCancelled = false

    async function loadPayments() {
      const fallbackPayments = localPaymentRecords
      const clientId = baseProject?.clientId || baseProject?.client_id || lead?.clientId || lead?.client_id || null
      const paymentLeadId = relatedLeadId || baseProject?.leadId || baseProject?.lead_id || lead?.id || null

      if (!linkedProjectId && !paymentLeadId && !clientId) {
        setPaymentRecords(fallbackPayments)
        return
      }

      if (USE_SUPABASE_PAYMENTS && !contractorId) {
        setPaymentRecords(fallbackPayments)
        return
      }

      try {
        const response = await dataProvider.payments.list({
          contractorId,
          includeArchived: true,
          ...(linkedProjectId ? { projectId: linkedProjectId } : paymentLeadId ? { leadId: paymentLeadId } : clientId ? { clientId } : {}),
        })

        if (isCancelled) return

        if (response?.error) {
          setPaymentRecords(fallbackPayments)
          return
        }

        const persistedPayments = Array.isArray(response?.data) ? response.data : []

        setPaymentRecords(
          USE_SUPABASE_PAYMENTS
            ? dedupePayments(persistedPayments)
            : dedupePayments([
                ...persistedPayments,
                ...fallbackPayments,
              ])
        )
      } catch (error) {
        if (!isCancelled) {
          setPaymentRecords(fallbackPayments)
        }
      }
    }

    loadPayments()

    return () => {
      isCancelled = true
    }
  }, [baseProject?.clientId, baseProject?.client_id, baseProject?.leadId, baseProject?.lead_id, contractorId, lead?.clientId, lead?.client_id, lead?.id, linkedProjectId, localPaymentRecords, relatedLeadId])

  useEffect(() => {
    let isCancelled = false

    async function loadProjectEvents() {
      const clientId = baseProject?.clientId || baseProject?.client_id || lead?.clientId || lead?.client_id || ''
      const fallbackEvents = scheduleEvents.filter((event) => matchesProjectScheduleEvent(event, {
        projectId: linkedProjectId || projectId,
        relatedLeadId,
        clientId,
        projectTitle: baseProject?.projectTitle || lead?.projectTitle || '',
        projectType: baseProject?.projectType || lead?.projectType || '',
      }))

      if (USE_SUPABASE_EVENTS && !contractorId) {
        setProjectEventRecords(fallbackEvents)
        return
      }

      try {
        const response = await dataProvider.events.list({
          contractorId,
          includeArchived: true,
          ...(linkedProjectId ? { projectId: linkedProjectId } : relatedLeadId ? { leadId: relatedLeadId } : clientId ? { clientId } : {}),
        })

        if (isCancelled) return

        if (response?.error) {
          setProjectEventRecords(fallbackEvents)
          return
        }

        const persistedEvents = Array.isArray(response?.data) ? response.data : []
        const nextEvents = (
          USE_SUPABASE_EVENTS
            ? persistedEvents
            : [
                ...persistedEvents,
                ...fallbackEvents,
              ]
        )
          .filter((event, index, collection) => {
            const key = event?.id || `${event?.title || 'event'}:${event?.date || ''}:${event?.startTime || ''}:${event?.projectId || event?.leadId || index}`
            return collection.findIndex((candidate, candidateIndex) => (
              (candidate?.id || `${candidate?.title || 'event'}:${candidate?.date || ''}:${candidate?.startTime || ''}:${candidate?.projectId || candidate?.leadId || candidateIndex}`) === key
            )) === index
          })
          .filter((event) => matchesProjectScheduleEvent(event, {
            projectId: linkedProjectId || projectId,
            relatedLeadId,
            clientId,
            projectTitle: baseProject?.projectTitle || lead?.projectTitle || '',
            projectType: baseProject?.projectType || lead?.projectType || '',
          }))

        setProjectEventRecords(sortScheduleEvents(nextEvents))
      } catch (error) {
        if (!isCancelled) {
          setProjectEventRecords(fallbackEvents)
        }
      }
    }

    loadProjectEvents()

    return () => {
      isCancelled = true
    }
  }, [baseProject?.clientId, baseProject?.client_id, baseProject?.projectTitle, baseProject?.projectType, contractorId, lead?.clientId, lead?.client_id, lead?.projectTitle, lead?.projectType, linkedProjectId, projectId, relatedLeadId, scheduleEvents])

  useEffect(() => {
    let isCancelled = false

    async function loadProjectPhotos() {
      const scopedProjectId = linkedProjectId || resolvePersistedProjectId(currentLead) || currentLead?.id || projectId
      const clientId = currentLead?.clientId || currentLead?.client_id || null

      if (!scopedProjectId || !contractorId) {
        setProjectPhotos(fallbackProjectPhotos)
        setIsLoadingPhotos(false)
        return
      }

      setIsLoadingPhotos(true)

      try {
        const response = await dataProvider.photos.listProjectPhotos({
          contractorId,
          projectId: scopedProjectId,
          clientId,
        })

        if (isCancelled) return

        if (response?.error) {
          setProjectPhotos(fallbackProjectPhotos)
          return
        }

        const persistedPhotos = Array.isArray(response?.data) ? response.data : []
        const nextPhotos = response?.skipped
          ? [...persistedPhotos, ...fallbackProjectPhotos]
          : persistedPhotos

        setProjectPhotos(dedupeProjectPhotos(nextPhotos, scopedProjectId))
      } catch (error) {
        if (!isCancelled) {
          setProjectPhotos(fallbackProjectPhotos)
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPhotos(false)
        }
      }
    }

    loadProjectPhotos()

    return () => {
      isCancelled = true
    }
  }, [contractorId, currentLead, fallbackProjectPhotos, linkedProjectId, projectId])

  useEffect(() => {
    setHiddenFallbackPhotoIds([])
    setSelectedPhotoId('')
    setPhotoConfirmAction(null)
    setFailedPhotoIds([])
  }, [linkedProjectId, projectId])

  useEffect(() => {
    if (!selectedPhoto) return undefined

    function handlePhotoPreviewKeydown(event) {
      if (event.key === 'Escape') {
        setSelectedPhotoId('')
      }

      if (event.key === 'ArrowLeft' && selectedPhotoIndex > 0) {
        setSelectedPhotoId(galleryPhotos[selectedPhotoIndex - 1]?.id || '')
      }

      if (event.key === 'ArrowRight' && selectedPhotoIndex < galleryPhotos.length - 1) {
        setSelectedPhotoId(galleryPhotos[selectedPhotoIndex + 1]?.id || '')
      }
    }

    window.addEventListener('keydown', handlePhotoPreviewKeydown)

    return () => {
      window.removeEventListener('keydown', handlePhotoPreviewKeydown)
    }
  }, [galleryPhotos, selectedPhoto, selectedPhotoIndex])

  const activeScheduleEvents = useMemo(() => (
    projectEventRecords.filter((event) => (
      !archivedScheduleEventIds.includes(event.id)
      && !event.archivedAt
      && !event.archived_at
      && !event.isArchived
    ))
  ), [archivedScheduleEventIds, projectEventRecords])
  const archivedScheduleEvents = useMemo(() => (
    projectEventRecords.filter((event) => (
      archivedScheduleEventIds.includes(event.id)
      || event.archivedAt
      || event.archived_at
      || event.isArchived
    ))
  ), [archivedScheduleEventIds, projectEventRecords])
  const workspaceViewModel = useMemo(() => buildProjectWorkspaceViewModel({
    project: currentLead || {},
    contract: resolvedContract,
    paymentSummary,
    events: activeScheduleEvents,
    invoices: relatedProjectInvoices,
    photoCount: galleryPhotos.length,
    isArchived: projectIsArchived,
  }), [activeScheduleEvents, currentLead, galleryPhotos.length, paymentSummary, projectIsArchived, relatedProjectInvoices, resolvedContract])
  const hasScheduleRecords = workspaceViewModel.upcomingEvents.length > 0
    || workspaceViewModel.historyEvents.length > 0
    || archivedScheduleEvents.length > 0
  const showScheduleWorkspace = !projectIsArchived || hasScheduleRecords
  const showDocumentWorkspace = !projectIsArchived
    || hasEstimate
    || hasContract
    || relatedProjectInvoices.length > 0
  const showPaymentWorkspace = paymentSummary.payments.length > 0 || canRecordPayment
  const showPhotoWorkspace = !projectIsArchived || galleryPhotos.length > 0
  const showClientWorkspace = Boolean(currentLead.phone || currentLead.email || hasClientLink)

  useEffect(() => {
    if (new URLSearchParams(location.search).get('sampleGuide') !== 'event' || activeScheduleEvents.length === 0) return

    const frame = window.requestAnimationFrame(() => {
      document.getElementById('project-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [activeScheduleEvents.length, location.search])

  if (USE_SUPABASE_PROJECTS && isLoadingProject) {
    return (
      <AymeroLoader
        variant="section"
        title={t('loadingProject')}
        message={t('projectLoadingHelp')}
        accessibleLabel={t('loadingProject')}
        className="rounded-3xl border border-slate-200 bg-white shadow-sm"
      />
    )
  }

  if (projectLoadError) {
    return <ProjectDetailFallbackState onBack={onBack} t={t} />
  }

  if (!currentLead && hasLoadedProject) {
    return <ProjectDetailFallbackState onBack={onBack} t={t} />
  }

  const projectIsCompleted = workspaceViewModel.projectStatus === 'Completed'
  const paymentIsPaidInFull = Number(paymentSummary.projectValue) > 0
    && Number(paymentSummary.totalPaid) > 0
    && Number(paymentSummary.outstandingBalance) <= 0
  const heroActionHandlers = {
    'record-payment': { label: t('recordPayment'), icon: DollarSign, action: () => { setEditingPayment(null); setShowPaymentModal(true) }, disabled: !canRecordPayment },
    'schedule-job': { label: t('scheduleJob'), icon: CalendarDays, action: onScheduleEvent },
    'upload-photos': { label: t('uploadPhotos'), icon: Camera, action: () => setShowPhotoModal(true) },
    'edit': { label: t('edit'), icon: Edit3, action: () => setIsEditOpen(true) },
    'review-contract': { label: t('openContract'), icon: FileText, action: () => onOpenContract?.(currentLead.id) },
    'view-invoice': { label: t('viewInvoice'), icon: FileText, action: () => workspaceViewModel.nextAction?.invoiceId && navigate(`/invoices/${workspaceViewModel.nextAction.invoiceId}`, { state: withNavigationContext({}, `/projects/${currentLead.id}`, 'backToProjectWorkspace') }) },
    'view-schedule': { label: t('viewSchedule'), icon: CalendarDays, action: () => document.getElementById('project-schedule')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) },
  }
  const actionButtons = resolveProjectHeroActionIds({
    nextActionId: workspaceViewModel.nextAction?.id,
    projectIsArchived,
    projectIsCompleted,
    isPaidInFull: paymentIsPaidInFull,
  }).map(({ id, primary }) => ({ id, primary, ...heroActionHandlers[id] }))
  const secondaryHeroActionCount = actionButtons.filter((button) => !button.primary).length
  const moreActionSpansMobileRow = secondaryHeroActionCount % 2 === 0
  const moreMenuItems = [
    hasEstimate
      ? {
          id: 'view-estimate',
          label: t('viewEstimate'),
          icon: <FileText className="mr-2 h-4 w-4" />,
          onClick: () => navigate(`/projects/${currentLead.id}/estimate`, { state: withNavigationContext({ source: 'project', projectId: currentLead.id }, `/projects/${currentLead.id}`, 'backToProjectWorkspace') }),
        }
      : null,
    hasContract
      ? {
          id: 'view-contract',
          label: t('openContract'),
          icon: <FileText className="mr-2 h-4 w-4" />,
          onClick: () => onOpenContract?.(currentLead.id),
        }
      : {
          id: 'create-contract',
          label: t('createContract'),
          icon: <FileText className="mr-2 h-4 w-4" />,
          onClick: openContractCreation,
        },
    hasClientLink
      ? {
          id: 'view-client',
          label: t('viewClient'),
          icon: <ExternalLink className="mr-2 h-4 w-4" />,
          onClick: () => navigate(`/clients/${currentLead.clientId}`),
        }
      : null,
    !projectIsArchived && !projectIsCompleted
      ? {
          id: 'mark-project-complete',
          label: t('markJobComplete'),
          icon: <CheckCircle2 className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'complete' }),
        }
      : null,
    projectIsArchived
      ? {
          id: 'restore-project',
          label: t('restore'),
          icon: <Undo2 className="mr-2 h-4 w-4" />,
          onClick: async () => {
            try {
              await dataProvider?.projects?.restore?.(currentLead.id, { contractorId })
              setProject((current) => (current ? { ...current, archivedAt: null, archived_at: null, isArchived: false } : current))
            } catch (err) {
              // ignore in local mode
            }
            onRestoreProject?.()
          },
        }
      : {
          id: 'archive-project',
          label: t('archive'),
          icon: <Archive className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'archive' }),
          className: archiveMenuItemClasses,
        },
  ].filter(Boolean)
  const linkedLeadId = currentLead?.leadId || relatedLeadId || null
  const paymentConfirmTarget = paymentConfirmAction?.payment || null
  const projectTitle = currentLead.projectTitle || currentLead.projectType || t('unknownProject')
  const projectClientName = currentLead.client || ''
  const projectAddress = currentLead.address || currentLead.location || ''
  const projectCreatedDate = formatProjectDetailDate(currentLead.createdAt || currentLead.created_at)
  const projectSignedDate = resolvedContract?.signedDate
    ? formatProjectDetailDate(resolvedContract.signedDate, resolvedContract.signedDate)
    : ''
  const projectStatus = workspaceViewModel.projectStatus
  const completionConfirmationMessage = [
    t('markJobCompleteHelp'),
    workspaceViewModel.upcomingEvents.length > 0 ? t('projectCompletionUpcomingEventsWarning') : '',
    isAnalyticsMode && workspaceViewModel.outstandingInvoiceBalance > 0
      ? t('projectCompletionOutstandingBalanceWarning', { amount: currency.format(workspaceViewModel.outstandingInvoiceBalance) })
      : '',
  ].filter(Boolean).join(' ')
  const projectValue = Number(paymentSummary.projectValue)
  const portalShareUrl = normalizePortalShareUrl(portal.shareUrl)
  const hasFinancialSummary = Number.isFinite(projectValue)
    && [projectValue, Number(paymentSummary.totalPaid), Number(paymentSummary.outstandingBalance)].some((value) => value > 0)

  function closePaymentModal() {
    setShowPaymentModal(false)
    setEditingPayment(null)
  }

  async function saveProjectEdits(updatedProject) {
    try {
      const projectUpdates = {
        ...currentLead,
        ...updatedProject,
        estimatedValue: updatedProject.value,
        clientId: updatedProject.clientId || currentLead.clientId || currentLead.client_id || null,
        leadId: currentLead.leadId || currentLead.lead_id || null,
        status: currentLead.status,
        projectStatus: currentLead.projectStatus,
        completedAt: currentLead.completedAt || currentLead.completed_at || null,
      }
      const response = await dataProvider.projects.update(currentLead.id, projectUpdates, { contractorId })

      if (response?.error) {
        showToast(response.error.message || t('projectUpdateFailed'), 'error')
        return
      }

      setProject((existingProject) => ({
        ...(existingProject || currentLead),
        ...(response?.data || {}),
        ...updatedProject,
        estimatedValue: updatedProject.value,
        client: updatedProject.client || existingProject?.client || currentLead.client,
        clientName: updatedProject.client || existingProject?.clientName || currentLead.clientName,
        clientId: updatedProject.clientId || existingProject?.clientId || currentLead.clientId || currentLead.client_id || null,
      }))
      setIsEditOpen(false)
      showToast(t('projectUpdated'), 'success')
    } catch (error) {
      showToast(error?.message || t('projectUpdateFailed'), 'error')
      logProjectDetailDevError('[dev] ProjectDetailPage failed to update project.', error, {
        projectId: currentLead.id,
      })
    }
  }

  async function saveProjectPayment(payment) {
    try {
      const { normalized: normalizedAmount, value: parsedAmount } = parsePaymentAmount(payment?.amount)

      if (!normalizedAmount) {
        showToast(t('enterPaymentAmount'), 'error')
        return
      }

      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        showToast(t('paymentAmountMustBeGreaterThanZero'), 'error')
        return
      }

      if (!persistedProjectId) {
        showToast(t('projectRequiredBeforePayment'), 'error')
        return
      }

      if (!contractorId && USE_SUPABASE_PAYMENTS) {
        showToast(t('paymentSaveFailed'), 'error')
        return
      }

      logProjectPaymentDev('before-persistence', {
        candidateAmount: parsedAmount,
        agreedValue: projectFinancialSummary.agreedValue,
        totalProjectPaidBefore: projectFinancialSummary.totalProjectPaid,
        projectBalanceBefore: projectFinancialSummary.projectBalance,
      })

      const eligiblePaymentInvoices = getEligiblePaymentInvoices(relatedProjectInvoices, {
        projectId: persistedProjectId,
        payments: paymentSummary.payments,
      })
      const selectedInvoice = eligiblePaymentInvoices.find((invoice) => String(invoice.id) === String(payment?.invoiceId || '')) || null

      if (payment?.invoiceId && !selectedInvoice) {
        showToast(t('selectInvoice'), 'error')
        return
      }

      if (selectedInvoice) {
        const paymentValidation = validateInvoicePayment({
          invoice: selectedInvoice,
          amount: parsedAmount,
          projectId: persistedProjectId,
          payments: paymentSummary.payments,
        })
        if (paymentValidation) {
          const messageKey = paymentValidation.code === 'amountExceedsRemaining'
            ? 'paymentExceedsInvoiceBalance'
            : paymentValidation.code === 'amountPrecision'
              ? 'paymentAmountPrecision'
              : paymentValidation.code === 'invoiceNotEligible'
                ? 'invoiceNotEligible'
                : 'paymentSaveFailed'
          showToast(t(messageKey, { amount: currency.format(paymentValidation.overage || 0) }), 'error')
          return
        }
      } else {
        const projectPaymentValidation = validateProjectPaymentAmount({
          projectValue: paymentSummary.projectValue,
          projectBalance: editingPayment?.id ? undefined : projectFinancialSummary.projectBalance,
          amount: parsedAmount,
          payments: paymentSummary.payments,
          projectId: persistedProjectId,
          invoiceIds: relatedProjectInvoices.map((invoice) => invoice.id || invoice.invoiceId || invoice.invoice_id),
          currentPaymentId: editingPayment?.id,
        })
        if (projectPaymentValidation) {
          logProjectPaymentDev('over-balance-rejected', {
            candidateAmount: parsedAmount,
            balanceUsedForValidation: projectPaymentValidation.remaining,
            excessAmount: projectPaymentValidation.overage,
          })
          showToast(t('paymentExceedsProjectBalance', { amount: currency.format(projectPaymentValidation.overage) }), 'error')
          return
        }
      }

      const paymentContext = selectedInvoice
        ? buildInvoicePaymentContext({ invoice: selectedInvoice, project: currentLead, lead })
        : {
            projectId: persistedProjectId,
            // A general project payment only needs the persisted project link.
            // Leave secondary UUID relationships null so a stale local draft
            // cannot turn an otherwise valid first payment into an FK conflict.
            clientId: null,
            contractId: null,
            estimateId: null,
            leadId: null,
            invoiceId: null,
          }

      const paymentEntry = normalizePaymentRecord({
        ...(editingPayment || {}),
        ...payment,
        id: editingPayment?.id || `payment-${Date.now()}`,
        clientId: paymentContext.clientId,
        projectId: paymentContext.projectId,
        contractId: paymentContext.contractId,
        estimateId: paymentContext.estimateId,
        invoiceId: paymentContext.invoiceId || null,
        leadId: paymentContext.leadId,
      }, {
        createdAt: editingPayment?.createdAt,
        status: editingPayment?.status || 'Recorded',
      })
      const response = editingPayment?.id
        ? await dataProvider.payments.update(editingPayment.id, paymentEntry, { contractorId })
        : await dataProvider.payments.create(paymentEntry, { contractorId })

      if (response?.error) {
        logPaymentPersistenceError(response.error, { operation: editingPayment?.id ? 'update' : 'create' })
        showToast(getPaymentPersistenceErrorMessage(t, response.error), 'error')
        return
      }

      const savedPayment = normalizePaymentRecord(response?.data || paymentEntry, paymentEntry)

      setPaymentRecords((current) => dedupePayments([
        savedPayment,
        ...current.filter((entry) => entry.id !== savedPayment.id),
      ]))
      const nextPaymentRecords = dedupePayments([
        savedPayment,
        ...paymentSummary.payments.filter((entry) => entry.id !== savedPayment.id),
      ])
      const postPersistenceSummary = calculateProjectFinancialSummary({
        project: {
          ...(baseProject || {}),
          id: linkedProjectId || projectId,
          projectId: linkedProjectId || baseProject?.projectId || baseProject?.project_id || null,
          selectedEstimateId: baseProject?.selectedEstimateId || baseProject?.selected_estimate_id || null,
          portal: {
            ...(baseProject?.portal || {}),
            ...(lead?.portal || {}),
          },
        },
        estimates: projectEstimateRecords,
        contracts: resolvedContract ? [resolvedContract] : [],
        invoices: relatedProjectInvoices,
        payments: nextPaymentRecords,
      })
      logProjectPaymentDev('after-persistence', {
        candidateAmount: parsedAmount,
        totalProjectPaidAfter: postPersistenceSummary.totalProjectPaid,
        projectBalanceAfter: postPersistenceSummary.projectBalance,
      })
      if (editingPayment?.id) {
        onUpdatePayment?.(savedPayment)
        if (!onUpdatePayment) {
          showToast(t('paymentUpdated'), 'success')
        }
      } else {
        onRecordPayment?.(savedPayment)
        if (!onRecordPayment) {
          showToast(t('paymentRecorded'), 'success')
        }
      }
      closePaymentModal()
    } catch (error) {
      logPaymentPersistenceError(error, { operation: editingPayment?.id ? 'update' : 'create' })
      showToast(getPaymentPersistenceErrorMessage(t, error), 'error')
      logProjectDetailDevError('[dev] ProjectDetailPage failed to save payment.', error, {
        projectId: baseProject?.id || resolvePersistedProjectId(currentLead) || currentLead.id,
        paymentId: editingPayment?.id || null,
      })
    }
  }

  async function archiveProjectPayment() {
    if (!paymentConfirmTarget?.id) {
      setPaymentConfirmAction(null)
      return
    }

    try {
      const response = await dataProvider.payments.archive(paymentConfirmTarget.id, { contractorId })

      if (response?.error) {
        showToast(response.error.message || t('paymentDeleteFailed'), 'error')
        return
      }

      const archivedPayment = normalizePaymentRecord(response?.data || {
        ...paymentConfirmTarget,
        archivedAt: new Date().toISOString(),
      }, paymentConfirmTarget)

      setPaymentRecords((current) => current.filter((payment) => payment.id !== paymentConfirmTarget.id))
      onDeletePayment?.(archivedPayment)
      if (!onDeletePayment) {
        showToast(t('paymentDeleted'), 'success')
      }
      setPaymentConfirmAction(null)
    } catch (error) {
      showToast(error?.message || t('paymentDeleteFailed'), 'error')
      logProjectDetailDevError('[dev] ProjectDetailPage failed to delete payment.', error, {
        projectId: currentLead.id,
        paymentId: paymentConfirmTarget.id,
      })
    }
  }

  async function uploadProjectPhotos({ files = [], description = '' } = {}) {
    const scopedProjectId = linkedProjectId || resolvePersistedProjectId(currentLead) || currentLead?.id || projectId
    const clientId = currentLead?.clientId || currentLead?.client_id || null
    if (!scopedProjectId || !contractorId) {
      showToast(t('photoUploadFailed'), 'error')
      return false
    }

    if (!files.length) {
      return false
    }

    for (const file of files) {
      const validation = validateProjectPhotoFile(file)

      if (!validation.valid) {
        showToast(t(validation.code === 'PROJECT_PHOTO_TOO_LARGE' ? 'photoTooLarge' : 'unsupportedFileType'), 'error')
        return false
      }
    }

    setIsUploadingPhotos(true)

    try {
      const uploadedPhotos = []

      for (const file of files) {
        const response = await dataProvider.photos.uploadProjectPhoto({
          contractorId,
          projectId: scopedProjectId,
          clientId,
          file,
          caption: description,
        })

        if (response?.error) {
          throw response.error
        }

        if (response?.data) {
          uploadedPhotos.push(response.data)
        }
      }

      if (uploadedPhotos.length > 0) {
        setProjectPhotos((current) => dedupeProjectPhotos([
          ...uploadedPhotos,
          ...current,
        ], scopedProjectId))
        showToast(t(uploadedPhotos.length > 1 ? 'photosUploaded' : 'photoUploaded'))
      }

      onUploadPhotos?.(uploadedPhotos, { notify: false })
      return true
    } catch (error) {
      showToast(
        error?.code === 'PROJECT_PHOTO_STORAGE_NOT_CONFIGURED'
          ? t('projectPhotoStorageNotConfigured')
          : error?.code === 'PROJECT_PHOTO_PERMISSION_DENIED'
            ? t('projectPhotoUploadPermissionDenied')
          : error?.message || t('photoUploadFailed'),
        'error'
      )
      logProjectDetailDevError('[dev] ProjectDetailPage failed to upload project photos.', error, {
        contractorId,
        projectId: scopedProjectId,
      })
      return false
    } finally {
      setIsUploadingPhotos(false)
    }
  }

  async function deleteProjectPhoto(photo) {
    const scopedProjectId = linkedProjectId || resolvePersistedProjectId(currentLead) || currentLead?.id || projectId

    if (!photo?.id) {
      showToast(t('photoDeleteFailed'), 'error')
      return
    }

    if (photo.source === 'seed') {
      setHiddenFallbackPhotoIds((current) => [...new Set([...current, photo.id])])
      setProjectPhotos((current) => current.filter((entry) => entry.id !== photo.id))
      if (selectedPhotoId === photo.id) {
        setSelectedPhotoId('')
      }
      setPhotoConfirmAction(null)
      showToast(t('photoDeleted'))
      return
    }

    if (!scopedProjectId || !contractorId) {
      showToast(t('photoDeleteFailed'), 'error')
      return
    }

    setDeletingPhotoId(photo.id)

    try {
      const response = await dataProvider.photos.deleteProjectPhoto({
        id: photo.id,
        contractorId,
        projectId: scopedProjectId,
      })

      if (response?.error) {
        throw response.error
      }

      revokeProjectPhotoPreviewUrl(photo.previewUrl || photo.url || '')
      setHiddenFallbackPhotoIds((current) => [...new Set([...current, photo.id])])
      setProjectPhotos((current) => current.filter((entry) => entry.id !== photo.id))
      if (selectedPhotoId === photo.id) {
        setSelectedPhotoId('')
      }
      setPhotoConfirmAction(null)
      showToast(t('photoDeleted'))
    } catch (error) {
      showToast(error?.message || t('photoDeleteFailed'), 'error')
      logProjectDetailDevError('[dev] ProjectDetailPage failed to delete project photo.', error, {
        contractorId,
        projectId: scopedProjectId,
        photoId: photo.id,
      })
    } finally {
      setDeletingPhotoId('')
    }
  }

  function openPhotoPreview(photoId) {
    setSelectedPhotoId(photoId || '')
  }

  function showPreviousPhoto() {
    if (selectedPhotoIndex <= 0) return
    setSelectedPhotoId(galleryPhotos[selectedPhotoIndex - 1]?.id || '')
  }

  function showNextPhoto() {
    if (selectedPhotoIndex >= galleryPhotos.length - 1) return
    setSelectedPhotoId(galleryPhotos[selectedPhotoIndex + 1]?.id || '')
  }

  function markPhotoLoadFailed(photoId) {
    if (!photoId) return
    setFailedPhotoIds((current) => (current.includes(photoId) ? current : [...current, photoId]))
  }

  async function copyPortalLink() {
    try {
      await copyTextToClipboard(portalShareUrl)
      showToast(t('portalLinkCopied'))
    } catch {
      showToast(t('portalLinkCopyFailed'), 'error')
    }
  }

  async function restoreArchivedProjectEvent(event) {
    try {
      const response = await dataProvider.events.restore?.(event.id, { contractorId })
      if (response?.error) throw response.error
    } catch (error) {
      if (USE_SUPABASE_EVENTS) {
        logProjectDetailDevError('[dev] ProjectDetailPage failed to restore event.', error, { eventId: event.id })
        return
      }
    }

    setProjectEventRecords((current) => sortScheduleEvents(current.map((entry) => (
      entry.id === event.id ? { ...entry, archivedAt: null, archived_at: null } : entry
    ))))
    onRestoreScheduleEvent?.(event.id)
  }

  const RecommendedActionIcon = hasAmbiguousEstimateSelection
    ? FileText
    : workspaceViewModel.nextAction?.id === 'upload-photos'
    ? Camera
    : workspaceViewModel.nextAction?.id === 'review-contract' || workspaceViewModel.nextAction?.id === 'view-invoice'
      ? FileText
      : CalendarDays
  const handleSelectProjectEstimate = async (estimate) => {
    const updatedProject = await onSelectEstimate?.(currentLead, estimate)
    if (updatedProject) setProject((current) => ({ ...(current || currentLead), ...updatedProject }))
  }
  const handleClearProjectEstimate = async () => {
    const updatedProject = await onClearEstimateSelection?.(currentLead)
    if (updatedProject) setProject((current) => ({ ...(current || currentLead), ...updatedProject }))
  }
  const recommendedActionMessage = workspaceViewModel.nextAction
    ? t(hasAmbiguousEstimateSelection ? 'reviewEstimateOptions' : workspaceViewModel.nextAction.messageKey, {
        date: workspaceViewModel.nextAction.event?.displayDate || workspaceViewModel.nextAction.event?.date || '',
      })
    : ''

  const hasRecommendedAction = Boolean(workspaceViewModel.nextAction || hasAmbiguousEstimateSelection)

  const documentCountSummary = [
    `${projectEstimateRecords.length} ${t(projectEstimateRecords.length === 1 ? 'estimate' : 'estimates').toLowerCase()}`,
    `${resolvedContract ? 1 : 0} ${t(resolvedContract ? 'contract' : 'contracts').toLowerCase()}`,
    `${relatedProjectInvoices.length} ${t(relatedProjectInvoices.length === 1 ? 'invoice' : 'invoices').toLowerCase()}`,
  ].join(' · ')

  const newDocumentMenuItems = [
    !projectIsArchived
      ? {
          id: 'new-estimate',
          label: t('newEstimate'),
          icon: <FileText className="h-4 w-4" aria-hidden="true" />,
          onClick: () => onCreateEstimateOption?.(currentLead),
        }
      : null,
    !projectIsArchived && !resolvedContract && !projectIsCompleted
      ? {
          id: 'create-contract',
          label: t('createContract'),
          icon: <FileText className="h-4 w-4" aria-hidden="true" />,
          onClick: openContractCreation,
        }
      : null,
    !projectIsArchived
      ? {
          id: 'create-invoice',
          label: t('createInvoice'),
          icon: <FileText className="h-4 w-4" aria-hidden="true" />,
          onClick: onCreateInvoice,
        }
      : null,
  ]

  function openContractCreation() {
    if (contractSourceEstimates.length > 1) {
      setContractSourceSelectionId(selectedContractSourceEstimate?.id || '')
      setShowContractSourceModal(true)
      return
    }

    onConvertEstimate?.(currentLead.id, selectedContractSourceEstimate || null, { directProject: !selectedContractSourceEstimate })
  }

  function confirmContractCreation() {
    const sourceEstimate = contractSourceSelectionId
      ? contractSourceEstimates.find((estimate) => estimate.id === contractSourceSelectionId) || null
      : null
    setShowContractSourceModal(false)
    onConvertEstimate?.(currentLead.id, sourceEstimate, { directProject: !sourceEstimate })
  }

  return (
    <div className="space-y-6">
      <nav aria-label={t('projectWorkspace')} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <RecordBackButton label={t('back')} onClick={onBack} />
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="min-w-0 truncate text-slate-950" aria-current="page">{projectTitle}</span>
      </nav>

      <section data-project-workspace-hero="true" className="relative z-10 overflow-visible rounded-3xl border border-slate-800 bg-slate-950 p-5 text-white shadow-xl shadow-slate-950/15 sm:p-7 lg:p-8">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
          <img src={projectWorkspaceHeroBackground} alt="" className="h-full w-full object-cover object-center opacity-70" />
          <div className="absolute inset-0 bg-[linear-gradient(105deg,rgba(2,6,23,0.98)_0%,rgba(15,23,42,0.92)_54%,rgba(15,23,42,0.55)_100%)]" />
        </div>

        <div className="relative grid min-w-0 gap-7 lg:grid-cols-[minmax(0,1.15fr)_minmax(300px,0.85fr)] lg:items-end lg:gap-10">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200 sm:text-sm">{t('projectWorkspace')}</p>
            <h1 className="mt-3 break-words text-3xl font-bold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{projectTitle}</h1>

            <div className="mt-4 min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('client')}</p>
              <p className="mt-1.5 break-words text-lg font-bold text-white sm:text-xl">{projectClientName || t('noClientLinked')}</p>
            </div>

            {projectAddress ? (
              <p className="mt-3 flex min-w-0 items-start gap-2 text-sm leading-6 text-slate-300 sm:text-base">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" aria-hidden="true" />
                <span className="break-words">{projectAddress}</span>
              </p>
            ) : null}

            {(!hasLeadLink || (!hasClientLink && !projectClientName)) ? (
              <div className="mt-4 flex flex-wrap gap-2">
                {!hasLeadLink ? <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{t('noLeadLinked')}</span> : null}
                {!hasClientLink && !projectClientName ? <span className="rounded-full border border-white/10 bg-white/10 px-3 py-1 text-xs font-bold text-slate-200">{t('noClientLinked')}</span> : null}
              </div>
            ) : null}
          </div>

          <div className="min-w-0 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/35 backdrop-blur-sm">
            <dl className="grid min-w-0 gap-px bg-white/10">
              <div className="min-w-0 bg-slate-950/45 p-4">
                <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('status')}</dt>
                <dd className="mt-2 flex flex-wrap items-center gap-2">
                  <StatusBadge status={projectStatus} t={t} />
                  {projectIsArchived ? <StatusBadge status="Archived" t={t} /> : null}
                </dd>
              </div>
            </dl>

            {hasFinancialSummary ? (
              <dl className="grid min-w-0 grid-cols-1 gap-px border-t border-white/10 bg-white/10 min-[380px]:grid-cols-3">
                <div className="min-w-0 bg-slate-950/45 p-4">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">{t('projectValue')}</dt>
                  <dd className="mt-2 break-words text-lg font-bold tracking-tight text-white">{currency.format(paymentSummary.projectValue)}</dd>
                </div>
                <div className="min-w-0 bg-slate-950/45 p-4">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">{t('amountPaid')}</dt>
                  <dd className="mt-2 break-words text-lg font-bold tracking-tight text-emerald-300">{currency.format(paymentSummary.totalPaid)}</dd>
                </div>
                <div className="min-w-0 bg-slate-950/45 p-4">
                  <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">{t('remainingBalance')}</dt>
                  <dd className="mt-2 break-words text-lg font-bold tracking-tight text-white">{paymentIsPaidInFull ? t('paidInFull') : currency.format(paymentSummary.outstandingBalance)}</dd>
                </div>
              </dl>
            ) : null}

            {(projectCreatedDate || projectSignedDate) ? (
              <dl className="grid min-w-0 grid-cols-2 gap-px border-t border-white/10 bg-white/10">
                {projectCreatedDate ? (
                  <div className={`min-w-0 bg-slate-950/45 p-4 ${!projectSignedDate ? 'col-span-2' : ''}`}>
                    <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">{t('dateCreated')}</dt>
                    <dd className="mt-1.5 break-words text-sm font-semibold leading-5 text-white">{projectCreatedDate}</dd>
                  </div>
                ) : null}
                {projectSignedDate ? (
                  <div className={`min-w-0 bg-slate-950/45 p-4 ${!projectCreatedDate ? 'col-span-2' : ''}`}>
                    <dt className="text-[0.68rem] font-bold uppercase tracking-[0.14em] text-slate-400">{t('signedDate')}</dt>
                    <dd className="mt-1.5 break-words text-sm font-semibold leading-5 text-white">{projectSignedDate}</dd>
                  </div>
                ) : null}
              </dl>
            ) : null}
          </div>
        </div>

        <div data-project-workspace-hero-actions="true" className="relative mt-7 grid min-w-0 grid-cols-2 gap-2 border-t border-white/10 pt-5 lg:flex lg:flex-nowrap lg:items-center">
          {actionButtons.map((button) => {
            const Icon = button.icon
            return (
              <button
                key={button.id}
                type="button"
                onClick={button.action}
                disabled={button.disabled}
                className={`inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 lg:w-auto ${button.primary ? 'col-span-2 lg:col-span-1 bg-blue-500 text-white shadow-lg shadow-blue-950/25 hover:bg-blue-400 disabled:bg-blue-400' : 'border border-white/15 bg-white/10 text-white hover:bg-white/15'}`}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> <span className="break-words">{button.label}</span>
              </button>
            )
          })}
          {moreMenuItems.length > 0 ? (
            <ActionMenu
              label={<><MoreVertical className="h-4 w-4" aria-hidden="true" /> {t('more')}</>}
              ariaLabel={t('more')}
              containerClassName={`min-w-0 w-full lg:w-auto ${moreActionSpansMobileRow ? 'col-span-2' : ''}`}
              buttonClassName="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 lg:w-auto"
              menuClassName="max-w-[calc(100vw-3rem)]"
              items={moreMenuItems}
            />
          ) : null}
          {projectIsArchived ? (
            <button type="button" onClick={() => setConfirmAction({ mode: 'delete' })} className="inline-flex min-h-12 min-w-0 w-full items-center justify-center gap-2 rounded-2xl border border-red-300/30 bg-red-400/10 px-4 py-3 text-sm font-bold text-red-100 transition hover:bg-red-400/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 lg:w-auto">
              <Trash2 className="h-4 w-4" aria-hidden="true" /> {t('deletePermanently')}
            </button>
          ) : null}
        </div>
        {!projectIsArchived && !canRecordPayment ? (
          <p className="relative mt-3 text-sm text-amber-200">{t('recordPaymentRequiresRealProject')}</p>
        ) : null}
      </section>

      {hasRecommendedAction ? (
        <section aria-labelledby="project-next-action-title" className="flex flex-col gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-sm" aria-hidden="true">
              {RecommendedActionIcon ? <RecommendedActionIcon className="h-5 w-5" /> : null}
            </span>
            <div className="min-w-0">
              <h2 id="project-next-action-title" className="text-sm font-bold uppercase tracking-[0.16em] text-blue-800">{t('nextRecommendedAction')}</h2>
              <p className="mt-1 break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">{recommendedActionMessage}</p>
            </div>
          </div>
          {hasAmbiguousEstimateSelection ? (
            <button type="button" onClick={() => document.getElementById('project-documents')?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="text-left text-sm font-bold text-blue-700 underline-offset-4 hover:underline sm:text-right">{t('selectEstimateOption')}</button>
          ) : (
            <span className="text-sm font-bold text-blue-700 sm:text-right">{t(workspaceViewModel.nextAction.actionLabelKey)}</span>
          )}
        </section>
      ) : null}

      <div data-project-workspace-layout="true" className="grid min-w-0 grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-2">
      {showScheduleWorkspace ? <div className="min-w-0 md:col-span-2 xl:col-span-2">
        <ProjectScheduleCard
          upcomingEvents={workspaceViewModel.upcomingEvents}
          historyEvents={workspaceViewModel.historyEvents}
          archivedEvents={archivedScheduleEvents}
          fallbackLocation={currentLead.address || currentLead.location}
          onScheduleEvent={projectIsArchived ? undefined : onScheduleEvent}
          onExportEvent={onExportEvent}
          onEditEvent={onEditScheduleEvent}
          onArchiveEvent={(event) => setScheduleConfirmAction({ mode: 'archive', event })}
          onRestoreEvent={restoreArchivedProjectEvent}
          onDeleteEvent={(event) => setScheduleConfirmAction({ mode: 'delete', event })}
          t={t}
        />
      </div> : null}
      <section className="contents">
        {showDocumentWorkspace ? <div id="project-documents" aria-label={t('projectDocuments')} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-1">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-xl font-bold text-slate-950">{t('projectDocuments')}</h2>
              <p className="break-words text-sm text-slate-500">{documentCountSummary}</p>
            </div>
            <ActionMenu
              label={t('newDocumentAction')}
              ariaLabel={t('newDocument')}
              containerClassName="w-full shrink-0 sm:w-auto"
              buttonClassName="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto"
              menuClassName="max-w-[calc(100vw-2rem)]"
              items={newDocumentMenuItems}
            />
          </div>
          <div className="space-y-2.5">
            {projectEstimateRecords.length > 0 ? (
              <div className="space-y-3">
                {projectEstimateRecords.map((estimate) => {
                  const isSelected = Boolean(selectedEstimateId && selectedProjectEstimate?.id === estimate.id)
                  return (
                    <div key={estimate.id} className={`flex min-w-0 flex-col gap-3 rounded-2xl border p-3.5 sm:flex-row sm:items-center sm:justify-between ${isSelected ? 'border-blue-300 bg-blue-50/60' : 'border-slate-200 bg-slate-50'}`}>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('estimate')}</p>
                          {estimate.optionName || estimate.option_name ? <span className="rounded-full bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">{estimate.optionName || estimate.option_name}</span> : null}
                          {isSelected ? <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-700">{t('selectedEstimateOption')}</span> : null}
                        </div>
                        <p className="mt-1 break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{formatEstimateDisplayNumber(estimate.number || estimate.estimateNumber || '', currentLead)}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                          <span>{currency.format(Number(estimate.total || 0))}</span>
                          <span>{estimate.title || t('estimate')}</span>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <StatusBadge status={estimate.status || 'Draft'} t={t} />
                        {!projectIsArchived && projectEstimateRecords.length > 1 ? (
                          isSelected ? (
                            <button type="button" onClick={handleClearProjectEstimate} className="inline-flex min-h-11 items-center rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('clearEstimateSelection')}</button>
                          ) : (
                            <button type="button" onClick={() => handleSelectProjectEstimate(estimate)} className="inline-flex min-h-11 items-center rounded-2xl border border-blue-200 bg-white px-4 py-2.5 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('selectEstimateOption')}</button>
                          )
                          ) : null}
                        <button type="button" onClick={() => navigate(`/estimates/${estimate.id}`, { state: withNavigationContext({ source: 'project', projectId: currentLead.id, estimateId: estimate.id }, `/projects/${currentLead.id}`, 'backToProjectWorkspace') })} className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                          {t('view')}
                        </button>
                        {!projectIsArchived ? (
                          <button type="button" onClick={() => onDuplicateEstimateOption?.(currentLead, estimate)} className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('duplicateEstimate')}</button>
                          ) : null}
                        </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between">
                <span>{t('noEstimates')}</span>
                {!projectIsArchived ? (
                  <button type="button" onClick={() => onCreateEstimateOption?.(currentLead)} className="inline-flex min-h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto">
                    {t('newEstimate')}
                  </button>
                ) : null}
              </div>
            )}

            {resolvedContract ? (
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('contract')}</p>
                  <p className="mt-1 break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{formatContractDisplayNumber(resolvedContract.number || resolvedContract.contractNumber || '', currentLead)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span>{currency.format(Number(resolvedContract.total || 0))}</span>
                    {(resolvedContract.signed || resolvedContract.signedDate) && (
                      <span>
                        {t('signed')}
                        {resolvedContract.signedDate ? ` · ${formatProjectDetailDate(resolvedContract.signedDate, resolvedContract.signedDate)}` : ''}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge status={resolvedContract.status || (resolvedContract.signed ? 'Signed' : 'Draft')} t={t} />
                  <button type="button" onClick={() => onOpenContract?.(currentLead.id)} className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    {t('view')}
                  </button>
                </div>
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{t('noContracts')}</div>
            )}

            {relatedProjectInvoices.length > 0 ? relatedProjectInvoices.map((invoice) => (
              <div key={invoice.id} className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">{t('invoice')}</p>
                  <p className="mt-1 break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{invoice.number || invoice.invoiceNumber || t('invoice')}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                    <span>{currency.format(Number(invoice.amount || invoice.total || 0))}</span>
                    <span>{t('remaining')}: {currency.format(getInvoiceRemainingBalance(invoice))}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 sm:justify-end">
                  <StatusBadge status={invoice.status || 'Draft'} t={t} />
                  <button type="button" onClick={() => navigate(`/invoices/${invoice.id}`, { state: withNavigationContext({}, `/projects/${currentLead.id}`, 'backToProjectWorkspace') })} className="inline-flex min-h-11 items-center rounded-2xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    {t('view')}
                  </button>
                </div>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">{t('noInvoices')}</div>
            )}
          </div>
        </div> : null}

        {showPaymentWorkspace ? <div className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-1">
          <div className="mb-4">
            <h2 className="text-xl font-bold text-slate-950">{t('paymentHistory')}</h2>
            <p className="text-sm text-slate-500">{t('paymentsRecorded')}</p>
          </div>

          <div className="space-y-2.5">
            {paymentSummary.payments.length > 0 ? paymentSummary.payments.map((payment) => (
              <article key={payment.id || `${payment.paymentDate || payment.createdAt}-${payment.amount}`} className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-bold text-slate-950">{t(getPaymentTypeLabelKey(payment))}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-600">
                      <span>{formatProjectDetailDate(payment.paymentDate, payment.date || '')}</span>
                      {payment.paymentMethod && <span>{t('paymentMethod')}: {payment.paymentMethod}</span>}
                      {payment.invoiceId ? <span>{t('invoice')}: {relatedInvoiceById.get(payment.invoiceId)?.number || relatedInvoiceById.get(payment.invoiceId)?.invoiceNumber || t('invoice')}</span> : null}
                    </div>
                    {payment.invoiceId && relatedInvoiceById.has(payment.invoiceId) ? (
                      <button type="button" onClick={() => navigate(`/invoices/${payment.invoiceId}`, { state: withNavigationContext({}, `/projects/${currentLead.id}`, 'backToProjectWorkspace') })} className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-xl px-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                        <FileText className="h-4 w-4" aria-hidden="true" /> {t('viewInvoice')} {relatedInvoiceById.get(payment.invoiceId)?.number || ''}
                      </button>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
                    <p className="text-right text-base font-bold text-slate-950">{currency.format(Number(payment.amount || 0))}</p>
                    <ActionMenu
                      label={<MoreVertical className="h-4 w-4" aria-hidden="true" />}
                      ariaLabel={t('paymentActions')}
                      showChevron={false}
                      buttonClassName="inline-flex min-h-11 min-w-11 items-center justify-center rounded-2xl border border-slate-200 bg-white p-2 text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                      items={[
                        {
                          id: `edit-payment-${payment.id}`,
                          label: t('editPayment'),
                          icon: <Edit3 className="h-4 w-4" aria-hidden="true" />,
                          onClick: () => {
                            setEditingPayment(payment)
                            setShowPaymentModal(true)
                          },
                        },
                        {
                          id: `delete-payment-${payment.id}`,
                          label: t('deletePayment'),
                          icon: <Trash2 className="h-4 w-4" aria-hidden="true" />,
                          tone: 'destructive',
                          onClick: () => {
                            setPaymentConfirmAction({ payment })
                          },
                          className: 'text-red-700 hover:bg-red-50 focus-visible:bg-red-50',
                        },
                      ]}
                    />
                  </div>
                </div>
                {payment.notes && (
                  <p className="mt-2 break-words text-sm leading-6 text-slate-500 [overflow-wrap:anywhere]">{t('paymentNotes')}: {payment.notes}</p>
                )}
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                <p className="text-sm text-slate-500">{t('noPaymentsRecordedYet')}</p>
                {!projectIsArchived && canRecordPayment ? (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingPayment(null)
                      setShowPaymentModal(true)
                    }}
                    className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  >
                    <DollarSign className="h-4 w-4" /> {t('recordPayment')}
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div> : null}
      </section>

      {showPhotoWorkspace ? <section className="min-w-0 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:col-span-2 xl:col-span-2 sm:p-6">
        <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('projectPhotos')}</h2>
            <p className="text-sm text-slate-500">{t('uploadProjectPhotosHelp')}</p>
          </div>
          {!projectIsArchived ? (
            <button
              type="button"
              onClick={() => setShowPhotoModal(true)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <Camera className="h-4 w-4" aria-hidden="true" /> {t('uploadPhoto')}
            </button>
          ) : null}
        </div>

        <div className="mb-4 rounded-2xl bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500">
          {t('projectPhotoFileHelp', { size: Math.round(PROJECT_PHOTO_MAX_FILE_SIZE_BYTES / (1024 * 1024)) })}
        </div>

        {isLoadingPhotos ? (
          <AymeroLoader
            variant="section"
            title={t('loading')}
            accessibleLabel={t('loading')}
            className="rounded-2xl border border-dashed border-slate-300 bg-slate-50"
          />
        ) : galleryPhotos.length > 0 ? (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(min(100%,9rem),1fr))]">
            {galleryPhotos.map((photo) => {
              const photoLoadFailed = failedPhotoIds.includes(photo.id)

              return (
                <article key={photo.id} className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <button
                    type="button"
                    onClick={() => openPhotoPreview(photo.id)}
                    className="block min-h-11 w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500"
                    aria-label={t('previewPhoto')}
                  >
                    {photo.previewUrl && !photoLoadFailed ? (
                      <div className="relative aspect-square overflow-hidden bg-slate-100">
                        <img
                          src={photo.previewUrl}
                          alt={photo.displayTitle}
                          className="h-full w-full object-cover transition duration-200 group-hover:scale-[1.02]"
                          onError={() => markPhotoLoadFailed(photo.id)}
                        />
                        {photo.caption ? (
                          <span className="absolute bottom-2 left-2 inline-flex max-w-[calc(100%-1rem)] truncate rounded-full bg-slate-950/70 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                            {photo.caption}
                          </span>
                        ) : null}
                      </div>
                    ) : (
                      <div className="flex aspect-square items-center justify-center bg-slate-100 px-4 text-center">
                        <div>
                          <Camera className="mx-auto h-6 w-6 text-slate-400" />
                          <p className="mt-2 text-xs font-semibold text-slate-500">{photo.displayTitle}</p>
                        </div>
                      </div>
                    )}
                    <div className="space-y-1 p-2.5">
                      <p className="break-words text-sm font-bold text-slate-950 [overflow-wrap:anywhere]">{photo.displayTitle}</p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        {photo.createdAt && <span>{formatDisplayDate(photo.createdAt, photo.createdAt)}</span>}
                        {photo.fileSize > 0 && <span>{formatProjectPhotoFileSize(photo.fileSize)}</span>}
                      </div>
                    </div>
                  </button>
                </article>
              )
            })}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <p className="font-bold text-slate-900">{t('projectPhotos')}</p>
            <p className="mt-1 text-sm text-slate-500">{t('noPhotosUploadedYet')}</p>
          </div>
        )}
      </section> : null}

      <section className="contents">
        {showClientWorkspace ? <div className="min-w-0 [&>article]:h-full md:col-span-2 xl:col-span-1">
          <InfoCard title={t('clientInformation')}>
            {currentLead.phone ? <DetailRow label={t('phone')} value={<a href={`tel:${currentLead.phone}`} className="rounded text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{currentLead.phone}</a>} /> : null}
            {currentLead.email ? <DetailRow label={t('email')} value={<a href={`mailto:${currentLead.email}`} className="break-all rounded text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500">{currentLead.email}</a>} /> : null}
            {!currentLead.phone && !currentLead.email ? <p className="text-sm leading-6 text-slate-500">{t('noClientContactInformation')}</p> : null}
            {hasClientLink ? (
              <button type="button" onClick={() => navigate(`/clients/${currentLead.clientId}`)} className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 sm:w-auto">
                {t('viewClient')}
              </button>
            ) : null}
          </InfoCard>
        </div> : null}

        <div className="min-w-0 [&>article]:h-full md:col-span-2 xl:col-span-1">
          <InfoCard title={t('customerPortal')} bodyClassName="space-y-3">
            <div className={`rounded-2xl border px-4 py-3 ${portalShareUrl ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
              <p className="text-sm font-bold">{t(portalShareUrl ? 'clientLinkReady' : 'clientLinkUnavailable')}</p>
              <p className="mt-1 text-sm leading-6">{t(portalShareUrl ? 'clientPortalCardHelp' : 'projectPortalUnavailableHelp')}</p>
            </div>
            {portalShareUrl ? (
              <div className="grid gap-2">
                <a href={portalShareUrl} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                  {t('openCustomerPortal')} <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
                <div className="grid gap-2 min-[380px]:grid-cols-2">
                  <button type="button" onClick={copyPortalLink} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    <Copy className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('copyLink')}
                  </button>
                  <button type="button" onClick={() => setShowPortalLinkModal(true)} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
                    <Share2 className="h-4 w-4 shrink-0" aria-hidden="true" /> {t('sendLinkToClient')}
                  </button>
                </div>
              </div>
            ) : null}
          </InfoCard>
        </div>

        {(currentLead.priority || currentLead.source || currentLead.projectType || currentLead.notes || currentLead.description) ? (
          <div className="min-w-0 md:col-span-2 [&>article]:h-full xl:col-span-2">
            <InfoCard title={recordDetailsTitle}>
              {currentLead.priority ? <DetailRow label={t('priority')} value={currentLead.priority} /> : null}
              {currentLead.source ? <DetailRow label={t('source')} value={currentLead.source} /> : null}
              {currentLead.projectType ? <DetailRow label={t('projectType')} value={currentLead.projectType} /> : null}
              {currentLead.notes || currentLead.description ? (
                <div className="border-t border-slate-100 pt-3">
                  <p className="text-sm font-medium text-slate-500">{t('notes')}</p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm font-semibold leading-6 text-slate-900 [overflow-wrap:anywhere]">{currentLead.notes || currentLead.description}</p>
                </div>
              ) : null}
            </InfoCard>
          </div>
        ) : null}
      </section>

      </div>

      <JobFormModal
        isOpen={isEditOpen}
        mode="edit"
        project={currentLead}
        clients={clients}
        initialClientId={currentLead.clientId || currentLead.client_id || ''}
        onClose={() => setIsEditOpen(false)}
        onSave={saveProjectEdits}
        t={t}
      />
      <ModalShell
        isOpen={showContractSourceModal}
        onBackdropClick={() => setShowContractSourceModal(false)}
        panelClassName="sm:max-w-xl"
        ariaLabelledBy="contract-source-title"
        ariaDescribedBy="contract-source-help"
      >
        <div className="space-y-5">
          <div>
            <h2 id="contract-source-title" className="text-xl font-bold text-slate-950">{t('contractSource')}</h2>
            <p id="contract-source-help" className="mt-2 text-sm leading-6 text-slate-600">{t('contractSourceHelp')}</p>
          </div>
          <div className="space-y-3">
            {contractSourceEstimates.map((estimate) => {
              const estimateId = estimate.id || ''
              const isSelected = contractSourceSelectionId === estimateId
              return (
                <button
                  key={estimateId}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => setContractSourceSelectionId(estimateId)}
                  className={`flex min-h-16 w-full min-w-0 items-start justify-between gap-4 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${isSelected ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
                >
                  <span className="min-w-0">
                    <span className="block break-words font-bold text-slate-950">{estimate.optionName || estimate.option_name || estimate.title || t('estimate')}</span>
                    <span className="mt-1 block break-words text-sm text-slate-600">{formatEstimateDisplayNumber(estimate.number || estimate.estimateNumber || '', currentLead)} · {currency.format(Number(estimate.total || 0))}</span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1 pt-0.5"><StatusBadge status={estimate.status || 'Draft'} t={t} />{isSelected ? <span className="text-xs font-bold text-blue-700">{t('selectedEstimateOption')}</span> : null}</span>
                </button>
              )
            })}
            <button
              type="button"
              aria-pressed={!contractSourceSelectionId}
              onClick={() => setContractSourceSelectionId('')}
              className={`flex min-h-16 w-full min-w-0 items-start gap-3 rounded-2xl border p-4 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${!contractSourceSelectionId ? 'border-blue-500 bg-blue-50' : 'border-slate-200 bg-slate-50 hover:border-blue-300 hover:bg-blue-50/50'}`}
            >
              <span className="min-w-0 break-words font-bold text-slate-950">{t('createFromProjectDetails')}{!contractSourceSelectionId ? <span className="mt-1 block text-xs font-semibold text-blue-700">{t('selectedContractSource')}</span> : null}</span>
            </button>
          </div>
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => setShowContractSourceModal(false)} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">{t('cancel')}</button>
            <button type="button" onClick={confirmContractCreation} className="min-h-11 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">{t('createContract')}</button>
          </div>
        </div>
      </ModalShell>
      <RecordPaymentModal
        isOpen={showPaymentModal}
        projectBalance={paymentSummary.projectBalance}
        projectValue={paymentSummary.projectValue}
        projectId={persistedProjectId}
        invoices={relatedProjectInvoices}
        payments={paymentSummary.payments}
        initialPayment={editingPayment}
        onClose={closePaymentModal}
        onSave={saveProjectPayment}
        t={t}
      />
      <PhotoUploadModal
        isOpen={showPhotoModal}
        onClose={() => setShowPhotoModal(false)}
        isSaving={isUploadingPhotos}
        onSave={uploadProjectPhotos}
        t={t}
      />
      <ModalShell isOpen={Boolean(selectedPhoto)} onBackdropClick={() => setSelectedPhotoId('')} panelClassName="sm:max-w-5xl">
        {selectedPhoto && (
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.22em] text-slate-500">{t('projectPhotos')}</p>
                <h2 className="mt-1 text-xl font-bold text-slate-950">{selectedPhoto.displayTitle}</h2>
                {selectedPhoto.createdAt ? (
                  <p className="mt-1 text-sm text-slate-500">{formatDisplayDate(selectedPhoto.createdAt, selectedPhoto.createdAt)}</p>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                {!projectIsArchived ? (
                  <button
                    type="button"
                    onClick={() => setPhotoConfirmAction({ photo: selectedPhoto })}
                    disabled={deletingPhotoId === selectedPhoto.id}
                    className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-red-200 bg-white text-red-600 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                    aria-label={t('deletePhoto')}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => setSelectedPhotoId('')}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-slate-200 text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
                  aria-label={t('close')}
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>
              </div>
            </div>
            {selectedPhoto.previewUrl && !failedPhotoIds.includes(selectedPhoto.id) ? (
              <div className="relative overflow-hidden rounded-3xl bg-slate-100">
                <img
                  src={selectedPhoto.previewUrl}
                  alt={selectedPhoto.displayTitle}
                  className="max-h-[70vh] w-full object-contain"
                  onError={() => markPhotoLoadFailed(selectedPhoto.id)}
                />
                <button
                  type="button"
                  onClick={showPreviousPhoto}
                  disabled={selectedPhotoIndex <= 0}
                  aria-label={t('previousPhoto')}
                  className={`absolute left-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-slate-950/55 text-white backdrop-blur-sm transition ${selectedPhotoIndex > 0 ? 'hover:bg-slate-950/75' : 'cursor-not-allowed opacity-35'}`}
                >
                  <ChevronLeft className="h-5 w-5" />
                </button>
                <button
                  type="button"
                  onClick={showNextPhoto}
                  disabled={selectedPhotoIndex >= galleryPhotos.length - 1}
                  aria-label={t('nextPhoto')}
                  className={`absolute right-3 top-1/2 inline-flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-slate-950/55 text-white backdrop-blur-sm transition ${selectedPhotoIndex < galleryPhotos.length - 1 ? 'hover:bg-slate-950/75' : 'cursor-not-allowed opacity-35'}`}
                >
                  <ChevronRight className="h-5 w-5" />
                </button>
              </div>
            ) : (
              <div className="flex min-h-80 items-center justify-center rounded-3xl bg-slate-100 p-6 text-center text-sm font-semibold text-slate-500">
                <div>
                  <Camera className="mx-auto h-8 w-8 text-slate-400" />
                  <p className="mt-3">{selectedPhoto.displayTitle}</p>
                </div>
              </div>
            )}
            {selectedPhoto.caption && (
              <p className="mt-4 text-sm text-slate-600">{selectedPhoto.caption}</p>
            )}
          </div>
        )}
      </ModalShell>
      <SendToCustomerModal
        isOpen={showPortalLinkModal}
        documentType="portalLink"
        customer={{ name: currentLead.client, phone: currentLead.phone, email: currentLead.email }}
        projectTitle={currentLead.projectTitle || currentLead.projectType}
        portalUrl={portalShareUrl}
        onClose={() => setShowPortalLinkModal(false)}
        onSent={() => setShowPortalLinkModal(false)}
        t={t}
      />
      <ConfirmRecordModal
        isOpen={Boolean(confirmAction)}
        mode={confirmAction?.mode}
        title={confirmAction?.mode === 'complete' ? t('markJobCompleteTitle') : confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')}
        message={confirmAction?.mode === 'complete' ? completionConfirmationMessage : confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')}
        confirmLabel={confirmAction?.mode === 'complete' ? t('markComplete') : confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          try {
            if (confirmAction?.mode === 'complete') {
              const completedProject = await onMarkProjectComplete?.(currentLead)
              if (!completedProject?.id) throw new Error(t('projectCompletionFailed'))
              setProject((current) => ({ ...(current || currentLead), ...completedProject }))
              showToast(t('projectMarkedComplete'), 'success')
            }
            if (confirmAction?.mode === 'archive') {
              const response = await dataProvider?.projects?.archive?.(currentLead.id, { contractorId })
              if (response?.error) throw response.error
              setProject((current) => (current ? { ...current, archivedAt: new Date().toISOString(), archived_at: new Date().toISOString(), isArchived: true } : current))
              onArchiveProject?.()
            }
            if (confirmAction?.mode === 'delete') {
              const response = await dataProvider?.projects?.deletePermanently?.(currentLead.id, { contractorId })
              if (response?.error) throw response.error
              onDeleteProject?.()
              showToast(t('itemDeletedPermanently'))
              onBack?.()
            }
          } catch (err) {
            logProjectDetailDevError('[dev] Project action failed.', err, {
              action: confirmAction?.mode,
              projectId: currentLead.id,
              contractorId,
            })
            showToast(t(confirmAction?.mode === 'complete' ? 'projectCompletionFailed' : confirmAction?.mode === 'delete' ? 'projectDeleteFailed' : 'archiveFailed'), 'error')
          }
          setConfirmAction(null)
        }}
        t={t}
      />
      <ConfirmRecordModal
        isOpen={Boolean(paymentConfirmAction)}
        mode="delete"
        title={t('confirmDeletePayment')}
        message={t('deletePaymentHelp')}
        confirmLabel={t('deletePayment')}
        onCancel={() => setPaymentConfirmAction(null)}
        onConfirm={archiveProjectPayment}
        t={t}
      />
      <ConfirmRecordModal
        isOpen={Boolean(photoConfirmAction)}
        mode="delete"
        title={t('deleteThisPhoto')}
        message={t('cannotUndoThisAction')}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onCancel={() => setPhotoConfirmAction(null)}
        onConfirm={() => {
          const targetPhoto = photoConfirmAction?.photo
          setPhotoConfirmAction(null)
          if (targetPhoto) {
            deleteProjectPhoto(targetPhoto)
          }
        }}
        t={t}
      />
      <ConfirmRecordModal
        isOpen={Boolean(scheduleConfirmAction)}
        mode={scheduleConfirmAction?.mode}
        title={scheduleConfirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')}
        message={scheduleConfirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')}
        confirmLabel={scheduleConfirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')}
        onCancel={() => setScheduleConfirmAction(null)}
        onConfirm={async () => {
          try {
            if (scheduleConfirmAction?.mode === 'archive') {
              const response = await dataProvider.events.archive?.(scheduleConfirmAction.event.id, { contractorId })
              if (response?.error) {
                throw response.error
              }
              const archivedAt = new Date().toISOString()
              setProjectEventRecords((current) => sortScheduleEvents(current.map((event) => (
                event.id === scheduleConfirmAction.event.id ? { ...event, archivedAt, archived_at: archivedAt } : event
              ))))
              onArchiveScheduleEvent?.(scheduleConfirmAction.event.id)
            }
            if (scheduleConfirmAction?.mode === 'delete') {
              const response = await dataProvider.events.deletePermanently?.(scheduleConfirmAction.event.id, { contractorId })
              if (response?.error) {
                throw response.error
              }
              setProjectEventRecords((current) => current.filter((event) => event.id !== scheduleConfirmAction.event.id))
              onDeleteScheduleEvent?.(scheduleConfirmAction.event.id)
            }
          } catch (err) {
            // ignore local-mode persistence errors
          }
          setScheduleConfirmAction(null)
        }}
        t={t}
      />
    </div>
  )
}

export function ProjectDetailPage(props) {
  return (
    <ProjectDetailErrorBoundary onBack={props.onBack} t={props.t}>
      <ProjectDetailPageContent {...props} />
    </ProjectDetailErrorBoundary>
  )
}
