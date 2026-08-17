import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, ArrowLeft, BarChart3, BriefcaseBusiness, CalendarDays, CarFront, ChevronRight, Clock3, CreditCard, Edit3, FileSignature, Images, Mail, MessageSquare, MoreVertical, Phone, Plus, Sparkles, Trash2, Undo2, WalletCards } from 'lucide-react'
import { DetailRow } from '../components/ui/DetailRow'
import { InfoCard } from '../components/ui/InfoCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { useToast } from '../components/common/ToastProvider'
import { currency, formatDisplayDate } from '../utils/formatters'
import clientWorkspaceHeroBackground from '../assets/page-heroes/client-workspace-hero-bg1.png'
import clientMobileHeroBackground from '../assets/page-heroes/client-mobile.png'
import { buildClientProfiles } from '../utils/clients'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { getContractDisplayNumber } from '../utils/contractNumber'
import { getEstimateDisplayNumber } from '../utils/estimateNumber'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import dataProvider from '../services/dataProvider'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { getClientsContractorId } from '../services/system/clientsRuntimeService'
import { hasEstimateData } from '../utils/estimateLinks'
import { hasContractData } from '../utils/contractLinks'
import { calculateProjectPaymentSummary, dedupePayments } from '../utils/projectPayments'
import { getContractForProject, getEstimateForProject, getProjectsForClient, resolveLinkedProjectId } from '../utils/projectIdentity'
import { ActionMenu } from '../components/common/ActionMenu'
import { deriveProjectStatus } from '../utils/projectLifecycle'
import { resolveClientContactActions } from '../utils/clientContactActions'

function isClientArchived(client, archivedClientIds = []) {
  return Boolean(
    client?.isArchived
      || client?.archivedAt
      || client?.archived_at
      || archivedClientIds.includes(client?.id)
  )
}

function readProjectDisplayDate(project = {}, estimate = null, contract = null) {
  return (
    project?.startDate
    || project?.portal?.startDate
    || project?.createdAt
    || project?.created_at
    || estimate?.dateCreated
    || estimate?.createdAt
    || estimate?.created_at
    || contract?.signedDate
    || contract?.signed_at
    || contract?.createdAt
    || contract?.created_at
    || ''
  )
}

function toDisplayCurrency(value, fallback = null) {
  const numericValue = Number(value)
  if (!Number.isFinite(numericValue)) return fallback
  return currency.format(numericValue)
}

function getTimestamp(value) {
  if (!value) return 0
  const parsedValue = new Date(value).getTime()
  return Number.isFinite(parsedValue) ? parsedValue : 0
}

function getProjectAddress(project = {}) {
  return project?.address || project?.location || ''
}

function getProjectThumbnail(project = {}) {
  const photoRecords = [
    ...(Array.isArray(project?.photos) ? project.photos : []),
    ...(Array.isArray(project?.portal?.photos) ? project.portal.photos : []),
  ]

  return photoRecords.find((photo) => photo?.previewUrl || photo?.url)?.previewUrl
    || photoRecords.find((photo) => photo?.previewUrl || photo?.url)?.url
    || ''
}

function getLatestProjectInvoice(project = {}) {
  const invoices = [
    ...(Array.isArray(project?.invoices) ? project.invoices : []),
    ...(Array.isArray(project?.portal?.invoices) ? project.portal.invoices : []),
  ].filter((invoice) => invoice && typeof invoice === 'object')

  return invoices.sort((left, right) => (
    getTimestamp(right?.updatedAt || right?.updated_at || right?.createdAt || right?.created_at || right?.dateCreated)
    - getTimestamp(left?.updatedAt || left?.updated_at || left?.createdAt || left?.created_at || left?.dateCreated)
  ))[0] || null
}

function getContextualProjectStatus(project = {}, estimate = null, contract = null, payments = []) {
  if (project?.isProjectRecord) {
    return deriveProjectStatus({
      project,
      contract,
      payments,
      events: [
        ...(Array.isArray(project?.events) ? project.events : []),
        ...(Array.isArray(project?.schedule) ? project.schedule : []),
        ...(Array.isArray(project?.scheduleEvents) ? project.scheduleEvents : []),
      ],
    })
  }

  const invoice = getLatestProjectInvoice(project)
  const baseStatus = contract?.status || estimate?.status || invoice?.status || project?.latestStatus || project?.projectStatus || project?.status || ''

  if (baseStatus !== 'Sent') {
    return baseStatus
  }

  if (invoice?.status === 'Sent' || (invoice && (invoice.sentAt || invoice.sent_at || invoice.updatedAt || invoice.createdAt))) {
    return 'Invoice Sent'
  }

  if (contract?.status === 'Sent') {
    return 'Contract Sent'
  }

  if (estimate?.status === 'Sent') {
    return 'Estimate Sent'
  }

  if (invoice) return 'Invoice Sent'
  if (contract) return 'Contract Sent'
  if (estimate) return 'Estimate Sent'
  return baseStatus
}

function formatRelativeTimestamp(value, t = (key) => key) {
  const timestamp = getTimestamp(value)
  if (!timestamp) return ''

  const diffMs = Date.now() - timestamp
  const dayMs = 24 * 60 * 60 * 1000
  const weekMs = 7 * dayMs

  if (diffMs < dayMs) return t('today')
  if (diffMs < weekMs) {
    const days = Math.max(1, Math.round(diffMs / dayMs))
    return days === 1 ? `1 ${t('dayAgo')}` : `${days} ${t('daysAgo')}`
  }

  const weeks = Math.max(1, Math.round(diffMs / weekMs))
  return weeks === 1 ? `1 ${t('weekAgo')}` : `${weeks} ${t('weeksAgo')}`
}

export function ClientProfilePage({ leads, customClients = [], archivedClientIds = [], onBack, onOpenProject, onOpenLead, onOpenEstimate, onOpenContract, onCreateJob, onUpdateClient, onArchiveClient, onRestoreClient, onDeleteClient, language = 'en', t }) {
  const { clientId } = useParams()
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const { showToast } = useToast()
  const { contractor, company, session } = useAuth()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorRuntimeId = getClientsContractorId({ contractor, company, session })
  const showAnalyticsSections = isAnalyticsMode
  const showDocumentInsightSections = isAnalyticsMode
  const clients = useMemo(() => buildClientProfiles(leads, customClients), [leads, customClients])
  const client = clients.find((item) => item.id === clientId)
  const isArchived = isClientArchived(client, archivedClientIds)
  const clientContact = resolveClientContactActions(client)
  const clientPhone = clientContact.phone
  const clientEmail = clientContact.email
  const clientAddress = clientContact.address
  const phoneHref = clientContact.phoneHref
  const smsHref = clientContact.smsHref
  const mapsHref = clientContact.mapsHref
  const emailHref = clientContact.emailHref
  const clientStatus = isArchived ? 'Archived' : 'Active'
  const hasClientContactInformation = Boolean(clientPhone || clientEmail || clientAddress)
  const clientProjects = useMemo(
    () => getProjectsForClient(client || {}, client?.projects || []),
    [client]
  )

  async function runConfirmAction() {
    if (!confirmAction) return
    try {
      if (confirmAction.mode === 'archive') {
        const response = await dataProvider.clients.archive(client.id, { contractorId: contractorRuntimeId })
        if (response?.error) {
          showToast(response.error.message || t('archiveFailed'), 'error')
          return
        }
        onArchiveClient(client.id, response?.data)
      }
      if (confirmAction.mode === 'delete') {
        const response = await dataProvider.clients.deletePermanently(client.id, { contractorId: contractorRuntimeId })
        if (response?.error) {
          showToast(response.error.message || t('deleteFailed'), 'error')
          return
        }
        onDeleteClient(client.id)
        onBack()
      }
    } catch (err) {
      showToast(err?.message || (confirmAction?.mode === 'delete' ? t('deleteFailed') : t('archiveFailed')), 'error')
    }
    setConfirmAction(null)
  }

  const projectCards = useMemo(() => (
    clientProjects.map((project) => {
      const estimate = getEstimateForProject(project, [project.portal?.estimate])
      const contract = getContractForProject(project, [project.portal?.contract], estimate)
      const resolvedProjectId = resolveLinkedProjectId(project)
      const projectPayments = dedupePayments([
        ...(Array.isArray(project?.payments) ? project.payments : []),
        ...(Array.isArray(project?.portal?.payments) ? project.portal.payments : []),
        ...(Array.isArray(project?.portal?.paymentHistory) ? project.portal.paymentHistory : []),
      ]).filter((payment) => {
        const paymentProjectId = resolveLinkedProjectId(payment)
        return Boolean(resolvedProjectId && paymentProjectId === resolvedProjectId)
      })
      const sortedProjectPayments = [...projectPayments].sort((left, right) => (
        getTimestamp(right.paymentDate || right.createdAt) - getTimestamp(left.paymentDate || left.createdAt)
      ))
      const paymentSummary = calculateProjectPaymentSummary({
        id: resolvedProjectId || project.id,
        projectId: resolvedProjectId || project.projectId || project.project_id || null,
        project_id: resolvedProjectId || project.project_id || project.projectId || null,
        value: project?.value ?? project?.projectValue ?? project?.estimatedValue ?? project?.contractValue ?? project?.portal?.contractAmount,
        estimatedValue: project?.estimatedValue,
        contractValue: project?.contractValue,
        portal: {
          ...(project?.portal || {}),
          contractAmount: project?.portal?.contractAmount ?? project?.value ?? project?.projectValue ?? project?.estimatedValue ?? project?.contractValue,
        },
      }, projectPayments)
      const rawProjectValue = project?.value ?? project?.projectValue ?? project?.estimatedValue ?? project?.contractValue ?? project?.portal?.contractAmount
      const hasProjectValue = rawProjectValue !== undefined && rawProjectValue !== null && rawProjectValue !== ''
      const dateValue = readProjectDisplayDate(project, estimate, contract)

      return {
        project,
        estimate,
        contract,
        projectPayments: sortedProjectPayments,
        thumbnail: getProjectThumbnail(project),
        projectAddress: getProjectAddress(project),
        dateValue,
        displayDate: dateValue ? formatDisplayDate(dateValue, dateValue) : '',
        projectValueAmount: hasProjectValue ? paymentSummary.projectValue : null,
        remainingBalanceAmount: hasProjectValue ? paymentSummary.outstandingBalance : null,
        projectValue: hasProjectValue ? toDisplayCurrency(paymentSummary.projectValue, t('notAdded')) : t('notAdded'),
        remainingBalance: hasProjectValue ? toDisplayCurrency(paymentSummary.outstandingBalance, t('notAdded')) : t('notAdded'),
        latestPayment: sortedProjectPayments[0] || null,
      }
    })
  ), [clientProjects, t])
  const customerSinceValue = useMemo(() => {
    const timestamps = [
      client?.createdAt,
      ...projectCards.map(({ project, dateValue }) => (
        project?.createdAt || project?.created_at || dateValue
      )),
    ].map(getTimestamp).filter(Boolean)

    if (!timestamps.length) return ''
    return formatDisplayDate(new Date(Math.min(...timestamps)))
  }, [client?.createdAt, client?.updatedAt, projectCards])
  const lastPayment = useMemo(() => {
    const paymentCandidates = projectCards
      .flatMap((card) => card.projectPayments.map((payment) => ({ ...payment, projectTitle: card.project.projectTitle || card.project.projectType })))
      .sort((left, right) => getTimestamp(right.paymentDate || right.createdAt) - getTimestamp(left.paymentDate || left.createdAt))

    return paymentCandidates[0] || null
  }, [projectCards])
  const totalOutstandingBalance = useMemo(() => (
    projectCards.reduce((sum, card) => sum + (Number(card.remainingBalanceAmount) || 0), 0)
  ), [projectCards])
  const totalProjectValue = useMemo(() => (
    projectCards.reduce((sum, card) => sum + (Number(card.projectValueAmount) || 0), 0)
  ), [projectCards])
  const recentActivities = useMemo(() => {
    const activityItems = []

    projectCards.forEach((card) => {
      const projectTitle = card.project.projectTitle || card.project.projectType || t('project')
      const projectId = card.project.id

      if (card.project?.createdAt || card.project?.created_at) {
        activityItems.push({
          id: `project-created-${projectId}`,
          title: t('projectCreated'),
          detail: projectTitle,
          timestamp: getTimestamp(card.project.createdAt || card.project.created_at),
          icon: BriefcaseBusiness,
        })
      }

      if (card.estimate?.dateCreated || card.estimate?.createdAt || card.estimate?.created_at) {
        activityItems.push({
          id: `estimate-created-${projectId}`,
          title: t('estimateCreated'),
          detail: projectTitle,
          timestamp: getTimestamp(card.estimate.dateCreated || card.estimate.createdAt || card.estimate.created_at),
          icon: WalletCards,
        })
      }

      if (card.latestPayment) {
        activityItems.push({
          id: `payment-recorded-${card.latestPayment.id || projectId}`,
          title: t('paymentRecorded'),
          detail: `${projectTitle} · ${currency.format(Number(card.latestPayment.amount) || 0)}`,
          timestamp: getTimestamp(card.latestPayment.paymentDate || card.latestPayment.createdAt),
          icon: CreditCard,
        })
      }

      const latestPhoto = [
        ...(Array.isArray(card.project?.photos) ? card.project.photos : []),
        ...(Array.isArray(card.project?.portal?.photos) ? card.project.portal.photos : []),
      ]
        .filter((photo) => photo?.createdAt || photo?.created_at)
        .sort((left, right) => getTimestamp(right.createdAt || right.created_at) - getTimestamp(left.createdAt || left.created_at))[0]

      if (latestPhoto) {
        activityItems.push({
          id: `photo-uploaded-${projectId}`,
          title: t('photoUploadedActivity'),
          detail: projectTitle,
          timestamp: getTimestamp(latestPhoto.createdAt || latestPhoto.created_at),
          icon: Images,
        })
      }

      const latestScheduleEvent = [
        ...(Array.isArray(card.project?.scheduleEvents) ? card.project.scheduleEvents : []),
        ...(Array.isArray(card.project?.events) ? card.project.events : []),
      ]
        .filter((event) => event?.date)
        .sort((left, right) => getTimestamp(right.date) - getTimestamp(left.date))[0]

      if (latestScheduleEvent) {
        activityItems.push({
          id: `scheduled-visit-${projectId}-${latestScheduleEvent.id || latestScheduleEvent.date}`,
          title: t('scheduledVisit'),
          detail: projectTitle,
          timestamp: getTimestamp(latestScheduleEvent.date),
          icon: CalendarDays,
        })
      }
    })

    return activityItems
      .filter((item) => item.timestamp > 0)
      .sort((left, right) => right.timestamp - left.timestamp)
      .slice(0, 5)
  }, [projectCards, t])
  const lastActivity = recentActivities[0] || null
  const lastActivityLabel = useMemo(() => (
    lastActivity ? formatRelativeTimestamp(lastActivity.timestamp, t) : ''
  ), [lastActivity, t])
  const clientNotes = useMemo(() => (
    Array.isArray(client?.notes)
      ? client.notes.filter((note) => typeof note === 'string' && note.trim())
      : []
  ), [client?.notes])
  const mobileEstimateCards = useMemo(() => {
    const estimatesByKey = new Map()

    projectCards.forEach((card) => {
      if (!hasEstimateData(card.estimate)) return

      const estimate = card.estimate
      const uniqueKey = estimate.id || estimate.number || estimate.estimateNumber || card.project.id
      if (estimatesByKey.has(uniqueKey)) return

      const amountValue = estimate.total ?? estimate.totalAmount ?? estimate.amount ?? card.project?.estimatedValue ?? card.project?.value
      const dateValue = estimate.dateCreated || estimate.createdAt || estimate.created_at || ''

      estimatesByKey.set(uniqueKey, {
        key: uniqueKey,
        estimate,
        project: card.project,
        title: getEstimateDisplayNumber(estimate, card.project),
        projectTitle: card.project.projectTitle || card.project.projectType || t('project'),
        amount: toDisplayCurrency(amountValue, t('notAdded')),
        status: estimate.status || '',
        dateLabel: dateValue ? formatDisplayDate(dateValue, dateValue) : '',
      })
    })

    return Array.from(estimatesByKey.values())
  }, [projectCards, t])
  const mobileContractCards = useMemo(() => {
    const contractsByKey = new Map()

    projectCards.forEach((card) => {
      if (!hasContractData(card.contract)) return

      const contract = card.contract
      const uniqueKey = contract.id || contract.number || contract.contractNumber || card.project.id
      if (contractsByKey.has(uniqueKey)) return

      const amountValue = contract.total ?? contract.totalAmount ?? contract.contractAmount ?? card.project?.contractValue ?? card.project?.value
      const dateValue = contract.signedDate || contract.signed_at || contract.createdAt || contract.created_at || ''

      contractsByKey.set(uniqueKey, {
        key: uniqueKey,
        contract,
        project: card.project,
        title: getContractDisplayNumber(contract, card.project),
        projectTitle: card.project.projectTitle || card.project.projectType || t('project'),
        amount: toDisplayCurrency(amountValue, t('notAdded')),
        status: contract.status || '',
        dateLabel: dateValue ? formatDisplayDate(dateValue, dateValue) : '',
      })
    })

    return Array.from(contractsByKey.values())
  }, [projectCards, t])

  if (!client) {
    return (
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{t('clientNotFound')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t('clientNotFoundHelp')}</p>
        <button onClick={onBack} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800">{t('backToClients')}</button>
      </section>
    )
  }
  const moreMenuItems = isArchived
    ? [
        {
          id: 'restore-client',
          label: t('restore'),
          icon: <Undo2 className="mr-2 h-4 w-4" />,
          onClick: async () => {
            try {
              const response = await dataProvider.clients.restore(client.id, { contractorId: contractorRuntimeId })
              if (response?.error) {
                showToast(response.error.message || t('restoreFailed'), 'error')
                return
              }
              onRestoreClient(client.id, response?.data)
            } catch (err) {
              showToast(err?.message || t('restoreFailed'), 'error')
            }
          },
        },
        {
          id: 'delete-client',
          label: t('deletePermanently'),
          icon: <Trash2 className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'delete' }),
          className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
        },
      ]
    : [
        {
          id: 'create-project',
          label: t('createNewProject'),
          icon: <Plus className="mr-2 h-4 w-4" />,
          onClick: () => onCreateJob?.(client),
        },
        {
          id: 'edit-client',
          label: t('editClient'),
          icon: <Edit3 className="mr-2 h-4 w-4" />,
          onClick: () => setIsEditOpen(true),
        },
        {
          id: 'archive-client',
          label: t('archive'),
          icon: <Archive className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'archive' }),
          className: archiveMenuItemClasses,
        },
      ]
  const heroContactActions = [
    mapsHref ? { id: 'drive', href: mapsHref, label: t('drive'), icon: CarFront, external: true } : null,
    phoneHref ? { id: 'call', href: `tel:${phoneHref}`, label: t('call'), icon: Phone } : null,
    smsHref ? { id: 'text', href: smsHref, label: t('text'), icon: MessageSquare } : null,
    emailHref ? { id: 'email', href: emailHref, label: t('email'), icon: Mail } : null,
  ].filter(Boolean)
  const mobileHeroActionCount = heroContactActions.length + 1
  const mobileHeroActionGridClasses = mobileHeroActionCount === 1
    ? 'grid-cols-1'
    : `grid-cols-2 ${mobileHeroActionCount % 2 === 1 ? '[&>*:last-child]:col-span-2' : ''} sm:grid-cols-3 sm:[&>*:last-child]:col-span-1`
  const primaryClientActionId = phoneHref ? 'call' : emailHref ? 'email' : mapsHref ? 'drive' : ''

  function renderMobileHeroAction({ id, href = '', label, icon: Icon, external = false }) {
    const sharedClassName = 'inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950'
    const content = (
      <>
        <Icon className="h-4 w-4" aria-hidden="true" />
        <span>{label}</span>
      </>
    )

    if (href) {
      return external ? (
        <a key={id} href={href} target="_blank" rel="noreferrer" className={sharedClassName}>
          {content}
        </a>
      ) : (
        <a key={id} href={href} className={sharedClassName}>
          {content}
        </a>
      )
    }
    return null
  }

  function renderDesktopHeroAction({ id, href = '', label, icon: Icon, external = false }) {
    const isPrimary = id === primaryClientActionId
    const enabledClassName = isPrimary
      ? 'border-blue-500 bg-blue-500 text-white shadow-lg shadow-blue-950/25 hover:bg-blue-400'
      : 'border-white/15 bg-white/10 text-white hover:bg-white/15'
    const className = `inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border px-4 py-3 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ${enabledClassName}`
    const content = <><Icon className="h-4 w-4" aria-hidden="true" /> {label}</>

    return external ? (
      <a key={id} href={href} target="_blank" rel="noreferrer" className={className}>{content}</a>
    ) : (
      <a key={id} href={href} className={className}>{content}</a>
    )
  }

function renderMobileAccountSummary() {
    if (!showAnalyticsSections) return null

    return (
      <InfoCard
        title={
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><BarChart3 className="h-5 w-5" /></span>
            {t('accountSummary')}
          </span>
        }
        bodyClassName="space-y-0"
      >
        <DetailRow label={t('customerSince')} value={customerSinceValue || t('notAdded')} />
        <DetailRow label={t('projects')} value={client.projectCount} />
        <DetailRow label={t('totalProjectValue')} value={currency.format(totalProjectValue)} />
        <DetailRow label={t('outstandingBalance')} value={<span className="text-red-600">{currency.format(totalOutstandingBalance)}</span>} />
        <DetailRow label={t('lastPayment')} value={lastPayment ? `${currency.format(Number(lastPayment.amount) || 0)} · ${formatDisplayDate(lastPayment.paymentDate || lastPayment.createdAt, lastPayment.paymentDate || lastPayment.createdAt)}` : t('notAdded')} />
      </InfoCard>
    )
  }

  function renderMobileProjectsList(cards = projectCards) {
    return cards.length ? cards.map(({ project, thumbnail, projectAddress, displayDate, contract, estimate, projectPayments, projectValue, remainingBalance, remainingBalanceAmount }) => {
      const openProjectRecord = () => (project.isProjectRecord ? onOpenProject(project.id) : onOpenLead?.(project.id))

      return (
      <article key={project.id} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        {thumbnail ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            <img src={thumbnail} alt={project.projectTitle || project.projectType} className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="break-words text-lg font-bold text-slate-950">{project.projectTitle || project.projectType}</h3>
            {(project.isProjectRecord || hasContractData(contract) || hasEstimateData(estimate) || project.latestStatus || project.projectStatus || project.status || getLatestProjectInvoice(project)?.status) ? <StatusBadge status={getContextualProjectStatus(project, estimate, contract, projectPayments)} t={t} /> : null}
          </div>
          {projectAddress ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{projectAddress}</p> : null}
          {displayDate ? <p className="mt-1 text-sm text-slate-600">{displayDate}</p> : null}
          <div className="mt-3 flex flex-col items-start gap-2">
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-950">{projectValue}</p>
              <p className="text-sm font-medium text-slate-500">{Number(remainingBalanceAmount || 0) > 0 ? `${t('remaining')} ${remainingBalance}` : t('paidInFull')}</p>
            </div>
            <button type="button" onClick={openProjectRecord} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-xl border border-slate-200 px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`${t('openProject')}: ${project.projectTitle || project.projectType}`}>
              <span>{project.isProjectRecord ? t('openProject') : t('view')}</span>
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </article>
      )
    }) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noJobs')}</div>
  }

  function renderMobileActivity() {
    if (!showAnalyticsSections) return null

    return recentActivities.length ? recentActivities.map((activity) => {
      const Icon = activity.icon
      return (
        <article key={activity.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-slate-50 text-slate-700"><Icon className="h-5 w-5" /></span>
            <div className="min-w-0">
              <p className="font-semibold text-slate-950">{activity.title}</p>
              <p className="break-words text-sm text-slate-500">{activity.detail}</p>
              <p className="mt-1 text-xs font-medium text-slate-400">{formatRelativeTimestamp(activity.timestamp, t) || formatDisplayDate(new Date(activity.timestamp))}</p>
            </div>
          </div>
        </article>
      )
    }) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noRecentActivity')}</div>
  }

  function renderMobileNotes() {
    return clientNotes.length ? clientNotes.map((note) => (
      <article key={note} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-sm leading-6 text-slate-600">{note}</p>
      </article>
    )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noRecentNotes')}</div>
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <nav aria-label={t('clients')} className="flex min-w-0 items-center gap-2 text-sm font-semibold">
        <button type="button" onClick={onBack} aria-label={t('backToClients')} className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {t('backToClients')}
        </button>
        <ChevronRight className="h-4 w-4 shrink-0 text-slate-300" aria-hidden="true" />
        <span className="min-w-0 truncate text-slate-950" aria-current="page">{client.name}</span>
      </nav>

      <div className="space-y-4 overflow-x-hidden lg:hidden">
        <section>
          <div className="relative rounded-3xl border border-slate-800 bg-slate-950 text-white shadow-xl shadow-slate-950/15">
            <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
              <img src={clientMobileHeroBackground} alt="" className="h-full w-full scale-[1.01] object-cover object-[56%_10%] saturate-[1.02] brightness-[1.02]" />
              <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(2,6,23,0.92)_0%,rgba(15,23,42,0.78)_56%,rgba(15,23,42,0.42)_100%)]" />
            </div>
            <div className="relative p-5 sm:p-7">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-200">{t('client')}</p>
                <h1 className="mt-2 break-words text-[2rem] font-bold leading-tight tracking-tight text-white sm:text-4xl">{client.name}</h1>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <StatusBadge status={clientStatus} t={t} />
                  {showAnalyticsSections && (client.repeatClient || client.projectCount > 1) ? (
                    <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur-sm">
                      <Sparkles className="h-3.5 w-3.5 text-teal-200" aria-hidden="true" />
                      {t('returningClient')}
                    </span>
                  ) : null}
                </div>
              </div>

              {hasClientContactInformation ? (
                <dl className="mt-6 grid min-w-0 gap-4 border-t border-white/10 pt-5 sm:grid-cols-2">
                  {clientPhone ? (
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('phone')}</dt>
                      <dd className="mt-1.5 min-w-0"><a href={`tel:${phoneHref}`} aria-label={`${t('callClient')}: ${clientPhone}`} className="break-words text-sm font-semibold text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientPhone}</a></dd>
                    </div>
                  ) : null}
                  {clientEmail ? (
                    <div className="min-w-0">
                      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('email')}</dt>
                      <dd className="mt-1.5 min-w-0"><a href={emailHref} aria-label={`${t('email')}: ${clientEmail}`} className="break-all text-sm font-semibold text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientEmail}</a></dd>
                    </div>
                  ) : null}
                  {clientAddress ? (
                    <div className="min-w-0 sm:col-span-2">
                      <dt className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-slate-400">{t('address')}</dt>
                      <dd className="mt-1.5 min-w-0"><a href={mapsHref} target="_blank" rel="noreferrer" aria-label={`${t('drive')}: ${clientAddress}`} className="break-words text-sm font-semibold leading-5 text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientAddress}</a></dd>
                    </div>
                  ) : null}
                </dl>
              ) : null}

              <div className={`mt-6 grid gap-2.5 border-t border-white/10 pt-5 ${mobileHeroActionGridClasses}`}>
                {heroContactActions.map((action) => renderMobileHeroAction(action))}
                <ActionMenu
                  label={<><MoreVertical className="h-4 w-4" aria-hidden="true" /> {t('more')}</>}
                  ariaLabel={t('more')}
                  showChevron={false}
                  containerClassName="w-full"
                  buttonClassName="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-3 py-3 text-sm font-semibold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
                  menuClassName="max-w-[calc(100vw-3rem)]"
                  items={moreMenuItems}
                />
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3.5 pt-0.5">
          {renderMobileAccountSummary()}
          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><BriefcaseBusiness className="h-5 w-5" /></span>
                {t('projects')}
              </span>
            }
            bodyClassName="space-y-3"
          >
            {renderMobileProjectsList(projectCards)}
          </InfoCard>

          {showDocumentInsightSections ? (
            <InfoCard
              title={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><WalletCards className="h-5 w-5" /></span>
                  {t('estimates')}
                </span>
              }
              bodyClassName="space-y-3"
            >
              {mobileEstimateCards.length ? mobileEstimateCards.map((item) => (
                <article key={item.key} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-slate-950">{item.title}</h3>
                        {item.status ? <StatusBadge status={item.status} t={t} /> : null}
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-500">{item.projectTitle}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">{item.amount}</span>
                        {item.dateLabel ? <span>{item.dateLabel}</span> : null}
                      </div>
                    </div>
                    <button type="button" onClick={() => onOpenEstimate?.(item.project.id)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-slate-50">
                      {t('view')}
                    </button>
                  </div>
                </article>
              )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noEstimates')}</div>}
            </InfoCard>
          ) : null}

          {showDocumentInsightSections ? (
            <InfoCard
              title={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><FileSignature className="h-5 w-5" /></span>
                  {t('contracts')}
                </span>
              }
              bodyClassName="space-y-3"
            >
              {mobileContractCards.length ? mobileContractCards.map((item) => (
                <article key={item.key} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="truncate text-base font-bold text-slate-950">{item.title}</h3>
                        {item.status ? <StatusBadge status={item.status} t={t} /> : null}
                      </div>
                      <p className="mt-1 break-words text-sm text-slate-500">{item.projectTitle}</p>
                      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-600">
                        <span className="font-semibold text-slate-900">{item.amount}</span>
                        {item.dateLabel ? <span>{item.dateLabel}</span> : null}
                      </div>
                    </div>
                    <button type="button" onClick={() => onOpenContract?.(item.project.id)} className="shrink-0 rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-teal-700 transition hover:bg-slate-50">
                      {t('view')}
                    </button>
                  </div>
                </article>
              )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noContracts')}</div>}
            </InfoCard>
          ) : null}

          {showAnalyticsSections ? (
            <InfoCard
              title={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Clock3 className="h-5 w-5" /></span>
                  {t('recentActivity')}
                </span>
              }
              bodyClassName="space-y-3"
            >
              {renderMobileActivity()}
            </InfoCard>
          ) : null}

          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><MessageSquare className="h-5 w-5" /></span>
                {t('notes')}
              </span>
            }
            bodyClassName="space-y-3"
          >
            {renderMobileNotes()}
          </InfoCard>
        </section>
      </div>

      <div className="hidden space-y-6 lg:block">
        <section className="relative rounded-3xl border border-slate-800 bg-slate-950 p-7 text-white shadow-xl shadow-slate-950/15 xl:p-8">
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl" aria-hidden="true">
            <img src={clientWorkspaceHeroBackground} alt="" className="h-full w-full object-cover object-center" />
            <div className="absolute inset-0 bg-[linear-gradient(110deg,rgba(2,6,23,0.96)_0%,rgba(15,23,42,0.86)_55%,rgba(15,23,42,0.62)_100%)]" />
          </div>

          <div className="relative min-w-0">
            <div className="min-w-0">
              <p className="text-sm font-bold uppercase tracking-[0.24em] text-blue-200">{t('client')}</p>
              <h1 className="mt-3 break-words text-4xl font-bold tracking-tight text-white xl:text-5xl">{client.name}</h1>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <StatusBadge status={clientStatus} t={t} />
                {showAnalyticsSections && (client.repeatClient || client.projectCount > 1) ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-sm font-semibold text-white backdrop-blur-sm">
                    <Sparkles className="h-3.5 w-3.5 text-teal-200" aria-hidden="true" />
                    {t('returningClient')}
                  </span>
                ) : null}
              </div>
              {showAnalyticsSections && lastActivity ? (
                <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                  <CalendarDays className="h-4 w-4 shrink-0 text-blue-200" aria-hidden="true" />
                  <span><span className="font-semibold text-white">{t('lastActivity')}:</span> {lastActivityLabel || formatDisplayDate(new Date(lastActivity.timestamp))}</span>
                </p>
              ) : null}
            </div>

          </div>

          {hasClientContactInformation ? (
            <dl className="relative mt-7 grid min-w-0 gap-5 md:grid-cols-3">
              {clientPhone ? (
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('phone')}</dt>
                  <dd className="mt-2 min-w-0"><a href={`tel:${phoneHref}`} aria-label={`${t('callClient')}: ${clientPhone}`} className="break-words text-base font-semibold text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientPhone}</a></dd>
                </div>
              ) : null}
              {clientEmail ? (
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('email')}</dt>
                  <dd className="mt-2 min-w-0"><a href={emailHref} aria-label={`${t('email')}: ${clientEmail}`} className="break-all text-base font-semibold text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientEmail}</a></dd>
                </div>
              ) : null}
              {clientAddress ? (
                <div className="min-w-0">
                  <dt className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{t('address')}</dt>
                  <dd className="mt-2 min-w-0"><a href={mapsHref} target="_blank" rel="noreferrer" aria-label={`${t('drive')}: ${clientAddress}`} className="break-words text-base font-semibold leading-6 text-white hover:text-blue-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200">{clientAddress}</a></dd>
                </div>
              ) : null}
            </dl>
          ) : null}

          <div className="relative mt-6 flex flex-wrap gap-2 border-t border-white/10 pt-5">
            {heroContactActions.map((action) => renderDesktopHeroAction(action))}
            <ActionMenu
              label={<><MoreVertical className="h-4 w-4" aria-hidden="true" /> {t('more')}</>}
              ariaLabel={t('more')}
              showChevron={false}
              buttonClassName="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-200 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950"
              menuClassName="max-w-[calc(100vw-3rem)]"
              items={moreMenuItems}
            />
          </div>
        </section>

        <section className={`grid gap-5 ${showAnalyticsSections ? 'xl:grid-cols-[1fr_1fr]' : 'xl:grid-cols-1'}`}>
          {showAnalyticsSections ? (
            <InfoCard
              title={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-cyan-50 text-cyan-700"><BarChart3 className="h-5 w-5" /></span>
                  {t('accountSummary')}
                </span>
              }
              bodyClassName="grid gap-3 sm:grid-cols-2"
            >
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('customerSince')}</p><p className="mt-2 text-lg font-bold text-slate-950">{customerSinceValue || t('notAdded')}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('projects')}</p><p className="mt-2 text-lg font-bold text-slate-950">{client.projectCount}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('totalProjectValue')}</p><p className="mt-2 text-lg font-bold text-slate-950">{currency.format(totalProjectValue)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('outstandingBalance')}</p><p className="mt-2 text-lg font-bold text-slate-950">{currency.format(totalOutstandingBalance)}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4 sm:col-span-2"><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('lastPayment')}</p><p className="mt-2 text-lg font-bold text-slate-950">{lastPayment ? `${currency.format(Number(lastPayment.amount) || 0)} · ${formatDisplayDate(lastPayment.paymentDate || lastPayment.createdAt, lastPayment.paymentDate || lastPayment.createdAt)}` : t('notAdded')}</p></div>
            </InfoCard>
          ) : null}

          {showAnalyticsSections ? (
            <InfoCard
              title={
                <span className="inline-flex items-center gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-50 text-amber-700"><Clock3 className="h-5 w-5" /></span>
                  {t('recentActivity')}
                </span>
              }
              bodyClassName="space-y-3"
            >
              {recentActivities.length ? recentActivities.map((activity) => {
                const Icon = activity.icon
                return (
                <div key={activity.id} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                    <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-white text-slate-700 shadow-sm"><Icon className="h-4 w-4" /></span>
                    <div className="min-w-0">
                      <p className="font-semibold text-slate-950">{activity.title}</p>
                      <p className="truncate text-sm text-slate-500">{activity.detail}</p>
                      <p className="mt-1 text-xs font-medium text-slate-400">{formatRelativeTimestamp(activity.timestamp, t) || formatDisplayDate(new Date(activity.timestamp))}</p>
                    </div>
                  </div>
                )
              }) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noRecentActivity')}</div>
              )}
            </InfoCard>
          ) : null}
        </section>

        <section>
          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><BriefcaseBusiness className="h-5 w-5" /></span>
                {t('projects')}
              </span>
            }
            bodyClassName="space-y-3"
          >
            {projectCards.length ? projectCards.map(({ project, displayDate, projectValue, remainingBalance, thumbnail, projectAddress, contract, estimate, projectPayments }) => (
              <article key={project.id} className="flex items-center gap-4 rounded-3xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50/60">
                {thumbnail ? (
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                    <img src={thumbnail} alt={project.projectTitle || project.projectType} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="break-words text-lg font-bold text-slate-950">{project.projectTitle || project.projectType}</h3>
                    {(project.isProjectRecord || hasContractData(contract) || hasEstimateData(estimate) || project.latestStatus || project.projectStatus || project.status || getLatestProjectInvoice(project)?.status) ? <StatusBadge status={getContextualProjectStatus(project, estimate, contract, projectPayments)} t={t} /> : null}
                  </div>
                  {projectAddress ? <p className="mt-1 break-words text-sm text-slate-500">{projectAddress}</p> : null}
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('date')}</p><p className="mt-1 font-semibold text-slate-900">{displayDate || t('notAdded')}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('value')}</p><p className="mt-1 font-semibold text-slate-900">{projectValue}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('remaining')}</p><p className="mt-1 font-semibold text-slate-900">{remainingBalance}</p></div>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <button type="button" onClick={() => (project.isProjectRecord ? onOpenProject(project.id) : onOpenLead?.(project.id))} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500" aria-label={`${t('openProject')}: ${project.projectTitle || project.projectType}`}>
                    <span>{project.isProjectRecord ? t('openProject') : hasEstimateData(estimate) && !hasContractData(contract) ? t('openEstimate') : t('view')}</span>
                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </article>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-sm text-slate-500">{t('noJobs')}</div>
            )}
          </InfoCard>

        </section>

        <section>
          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-rose-50 text-rose-700"><MessageSquare className="h-5 w-5" /></span>
                {t('recentNotes')}
              </span>
            }
            bodyClassName="space-y-3"
          >
            {clientNotes.length ? clientNotes.map((note) => (
              <div key={note} className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm leading-6 text-slate-600">{note}</p>
              </div>
            )) : (
              <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noRecentNotes')}</div>
            )}
          </InfoCard>
        </section>
      </div>

      <ClientFormModal
        isOpen={isEditOpen}
        mode="edit"
        client={client}
        defaultPreferredLanguage={language}
        onClose={() => setIsEditOpen(false)}
        onSave={async (updatedClient) => {
          let nextClient = updatedClient

          try {
            const response = await dataProvider.clients.update(client.id, updatedClient, { contractorId: contractorRuntimeId })
            if (response?.data && !response?.error) {
              nextClient = response.data
            }
          } catch (err) {
            // local mode: ignore errors
          }

          onUpdateClient(client.id, nextClient)
          setIsEditOpen(false)
        }}
        t={t}
      />
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
    </div>
  )
}
