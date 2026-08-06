import { useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import { Archive, ArrowLeft, BarChart3, BriefcaseBusiness, CalendarDays, CarFront, ChevronRight, Clock3, CreditCard, Edit3, FileSignature, Images, Languages, Mail, MapPin, MessageSquare, MoreVertical, Phone, Plus, Sparkles, Trash2, Undo2, UserRound, WalletCards } from 'lucide-react'
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

function isClientArchived(client, archivedClientIds = []) {
  return Boolean(
    client?.isArchived
      || client?.archivedAt
      || client?.archived_at
      || archivedClientIds.includes(client?.id)
  )
}

function normalizePhoneLink(phone = '') {
  const value = String(phone || '').trim()
  if (!value) return ''
  return value.replace(/[^\d+]/g, '')
}

function buildMapsHref(address = '') {
  const value = String(address || '').trim()
  if (!value) return ''
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(value)}`
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

function getContextualProjectStatus(project = {}, estimate = null, contract = null) {
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

function derivePreferredContact(client = {}, t = (key) => key) {
  if (client?.phone) return t('call')
  if (client?.email) return t('email')
  return ''
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

export function ClientProfilePage({ leads, customClients = [], archivedClientIds = [], onBack, onOpenProject, onOpenLead, onOpenEstimate, onOpenContract, onCreateJob, onUpdateClient, onArchiveClient, onRestoreClient, onDeleteClient, language = 'en', setLanguage, t }) {
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
  const phoneHref = normalizePhoneLink(client?.phone)
  const smsHref = phoneHref ? `sms:${phoneHref}` : ''
  const mapsHref = buildMapsHref(client?.address)
  const emailHref = client?.email ? `mailto:${client.email}` : ''
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
  const preferredContact = useMemo(() => derivePreferredContact(client || {}, t), [client, t])
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
          id: 'toggle-language',
          label: language === 'en' ? `🇪🇸 ${t('languageNameSpanish')}` : `🇺🇸 ${t('languageNameEnglish')}`,
          icon: <Languages className="mr-2 h-4 w-4" />,
          onClick: () => setLanguage?.(language === 'en' ? 'es' : 'en'),
        },
        {
          id: 'archive-client',
          label: t('archive'),
          icon: <Archive className="mr-2 h-4 w-4" />,
          onClick: () => setConfirmAction({ mode: 'archive' }),
          className: archiveMenuItemClasses,
        },
      ]
  const mobileHeroActions = [
    { id: 'drive', href: mapsHref, label: t('drive'), icon: CarFront, external: true, visible: Boolean(mapsHref) },
    { id: 'call', href: phoneHref ? `tel:${phoneHref}` : '', label: t('call'), icon: Phone, visible: Boolean(phoneHref) },
    { id: 'text', href: smsHref, label: t('text'), icon: MessageSquare, visible: Boolean(smsHref) },
    { id: 'email', href: emailHref, label: t('email'), icon: Mail, visible: Boolean(emailHref) },
  ].filter((action) => action.visible)

  function renderMobileHeroAction({ id, href = '', label, icon: Icon, external = false }) {
    const sharedClassName = 'inline-flex min-h-[72px] w-full flex-col items-center justify-center gap-2 rounded-[1.15rem] border border-slate-200 bg-white px-2 py-3 text-center shadow-sm transition hover:bg-slate-50'
    const content = (
      <>
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-600">
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-xs font-semibold leading-4 text-slate-900">{label}</span>
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

  function renderMobileContactCard() {
    return (
      <InfoCard
        title={
            <span className="flex w-full items-center justify-between gap-3">
              <span className="inline-flex min-w-0 items-center gap-3">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><UserRound className="h-[18px] w-[18px]" /></span>
              <span className="truncate">{t('contactInformation')}</span>
            </span>
            <button onClick={() => setIsEditOpen(true)} className="shrink-0 text-xs font-semibold text-teal-700 transition hover:text-teal-800">
              {t('edit')}
            </button>
          </span>
        }
        bodyClassName="space-y-0"
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3 first:pt-0">
          <div className="flex min-w-0 items-center gap-3">
            <Phone className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-950">{client.phone || t('notAdded')}</p>
            </div>
          </div>
          {phoneHref ? <a href={`tel:${phoneHref}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Phone className="h-4 w-4" /></a> : null}
        </div>
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <Mail className="h-[18px] w-[18px] shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="break-all text-sm font-semibold text-slate-950">{client.email || t('notAdded')}</p>
            </div>
          </div>
          {emailHref ? <a href={emailHref} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><Mail className="h-4 w-4" /></a> : null}
        </div>
        <div className="flex items-center justify-between gap-3 py-3">
          <div className="flex min-w-0 items-start gap-3">
            <MapPin className="mt-0.5 h-[18px] w-[18px] shrink-0 text-slate-400" />
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold leading-5 text-slate-950">{client.address || t('notAdded')}</p>
            </div>
          </div>
          {mapsHref ? <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><MapPin className="h-4 w-4" /></a> : null}
        </div>
        <div className="mt-1 flex items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">{t('preferredContact')}</span>
          <span className="rounded-full bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">{preferredContact || t('notAdded')}</span>
        </div>
      </InfoCard>
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

  function renderDesktopContactField({ label, value, actionIcon = null }) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-3">
        <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-slate-400">{label}</p>
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1 text-sm font-semibold text-slate-900">
            {value}
          </div>
          {actionIcon}
        </div>
      </div>
    )
  }

  function renderMobileProjectsList(cards = projectCards) {
    return cards.length ? cards.map(({ project, thumbnail, projectAddress, displayDate, contract, estimate, projectValue, remainingBalance, remainingBalanceAmount }) => (
      <article key={project.id} onClick={() => (project.isProjectRecord ? onOpenProject(project.id) : onOpenLead?.(project.id))} className="flex items-center gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        {thumbnail ? (
          <div className="h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
            <img src={thumbnail} alt={project.projectTitle || project.projectType} className="h-full w-full object-cover" />
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="truncate text-lg font-bold text-slate-950">{project.projectTitle || project.projectType}</h3>
            {(hasContractData(contract) || hasEstimateData(estimate) || project.latestStatus || project.projectStatus || project.status || getLatestProjectInvoice(project)?.status) ? <StatusBadge status={getContextualProjectStatus(project, estimate, contract)} t={t} /> : null}
          </div>
          {projectAddress ? <p className="mt-1 line-clamp-2 text-sm text-slate-500">{projectAddress}</p> : null}
          {displayDate ? <p className="mt-1 text-sm text-slate-600">{displayDate}</p> : null}
          <div className="mt-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-2xl font-bold tracking-tight text-slate-950">{projectValue}</p>
              <p className="text-sm font-medium text-slate-500">{Number(remainingBalanceAmount || 0) > 0 ? `${t('remaining')} ${remainingBalance}` : t('paidInFull')}</p>
            </div>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </div>
        </div>
      </article>
    )) : <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-5 text-sm text-slate-500">{t('noJobs')}</div>
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
    <div className="space-y-6">
      <div className="space-y-4 overflow-x-hidden bg-[#f5f7fb] pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:hidden">
        <section className="px-4 pt-4">
          <div className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
            <div className="relative overflow-hidden bg-slate-950 text-white">
              <img src={clientMobileHeroBackground} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full scale-[1.01] object-cover object-[56%_10%] saturate-[1.02] brightness-[1.02]" />
              <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,6,23,0.74)_0%,rgba(15,23,42,0.48)_30%,rgba(15,23,42,0.18)_56%,rgba(15,23,42,0.04)_100%)]" />
              <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.14)_0%,rgba(15,23,42,0.08)_60%,rgba(255,255,255,0.08)_100%)]" />
              <div className="relative px-5 pb-7 pt-[max(env(safe-area-inset-top),1rem)]">
                <div className="flex items-center justify-between">
                  <button onClick={onBack} className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm">
                    <ArrowLeft className="h-5 w-5" />
                  </button>
                  <ActionMenu
                    label={<MoreVertical className="h-4.5 w-4.5" />}
                    ariaLabel={t('more')}
                    showChevron={false}
                    buttonClassName="inline-flex h-11 w-11 items-center justify-center rounded-full bg-white/10 text-white backdrop-blur-sm"
                    items={moreMenuItems}
                  />
                </div>
                <div className="mt-4 max-w-[68%]">
                  <p className="text-[0.72rem] font-semibold uppercase tracking-[0.26em] text-teal-200/95">{t('clientWorkspace')}</p>
                  <div className="mt-2 flex items-start gap-2.5">
                    <h1 className="text-[1.9rem] font-bold leading-[1.02] tracking-tight text-white">{client.name}</h1>
                  </div>
                  {showAnalyticsSections && (client.repeatClient || client.projectCount > 1) ? (
                    <div className="mt-2.5">
                      <span className="inline-flex items-center gap-2 rounded-full bg-white/12 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15">
                        <Sparkles className="h-3.5 w-3.5 text-teal-200" />
                        {t('returningClient')}
                      </span>
                    </div>
                  ) : null}
                  {client.address ? (
                    <div className="mt-3.5 flex items-start gap-2.5 text-sm text-slate-100">
                      <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                      <span className="font-medium leading-5">{client.address}</span>
                    </div>
                  ) : null}
                  {showAnalyticsSections && lastActivity ? (
                    <div className="mt-2 flex items-center gap-2.5 text-sm text-slate-100">
                      <CalendarDays className="h-4 w-4 shrink-0 text-blue-200" />
                      <span className="leading-5"><span className="font-medium text-white">{t('lastActivity')}:</span> {lastActivityLabel || formatDisplayDate(new Date(lastActivity.timestamp))}</span>
                    </div>
                  ) : null}
                </div>
                {mobileHeroActions.length ? (
                  <div
                    className="mt-5 grid gap-2.5"
                    style={{ gridTemplateColumns: `repeat(${mobileHeroActions.length}, minmax(0, 1fr))` }}
                  >
                    {mobileHeroActions.map((action) => renderMobileHeroAction(action))}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="space-y-3.5 px-4 pt-0.5">
          {renderMobileContactCard()}
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
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div className="p-7 xl:p-8">
            <div
              className="relative overflow-hidden rounded-[1.7rem] bg-slate-950 text-white"
              style={{
                backgroundImage: `linear-gradient(135deg, rgba(2, 6, 23, 0.78), rgba(15, 23, 42, 0.35)), url(${clientWorkspaceHeroBackground})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-slate-950/45 via-slate-950/18 to-transparent" />
              <div className="relative p-7 xl:p-8">
                <button onClick={onBack} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-200 transition hover:text-white">
                  <ArrowLeft className="h-4 w-4" /> {t('backToClients')}
                </button>
                <div className="mt-7 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
                  <div className="max-w-3xl">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[0.9rem] font-semibold uppercase tracking-[0.24em] text-blue-200">{t('clientWorkspace')}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <h1 className="text-5xl font-bold tracking-tight text-white">{client.name}</h1>
                      {showAnalyticsSections && (client.repeatClient || client.projectCount > 1) ? (
                        <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm">
                          <Sparkles className="h-3.5 w-3.5 text-teal-200" />
                          {t('returningClient')}
                        </span>
                      ) : null}
                    </div>
                    {client.address ? (
                      <div className="mt-4 inline-flex items-start gap-3 text-lg text-slate-200">
                        <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-blue-200" />
                        <span className="font-medium">{client.address}</span>
                      </div>
                    ) : null}
                    {showAnalyticsSections && lastActivity ? (
                      <div className="mt-4 inline-flex items-center gap-3 text-lg text-slate-200">
                        <CalendarDays className="h-5 w-5 shrink-0 text-blue-200" />
                        <span><span className="font-medium text-white">{t('lastActivity')}:</span> {lastActivityLabel || formatDisplayDate(new Date(lastActivity.timestamp))}</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex justify-start xl:justify-end">
                    <ActionMenu
                      label={t('more')}
                      ariaLabel={t('more')}
                      buttonClassName="inline-flex min-h-[52px] min-w-[124px] items-center justify-center rounded-2xl border border-white/15 bg-white/10 px-5 py-3 text-base font-semibold text-white shadow-sm backdrop-blur-sm transition hover:bg-white/12"
                      items={moreMenuItems}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 bg-white px-6 py-4 xl:px-8">
          <div className="flex flex-wrap items-center gap-3">
            {mapsHref ? (
              <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50">
                <CarFront className="h-4 w-4" /> {t('drive')}
              </a>
            ) : (
              <button type="button" disabled className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-400 opacity-70">
                <CarFront className="h-4 w-4" /> {t('drive')}
              </button>
            )}
            {phoneHref ? (
              <a href={`tel:${phoneHref}`} className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50">
                <Phone className="h-4 w-4" /> {t('call')}
              </a>
            ) : (
              <button type="button" disabled className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-400 opacity-70">
                <Phone className="h-4 w-4" /> {t('call')}
              </button>
            )}
            {smsHref ? (
              <a href={smsHref} className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50">
                <MessageSquare className="h-4 w-4" /> {t('text')}
              </a>
            ) : (
              <button type="button" disabled className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-400 opacity-70">
                <MessageSquare className="h-4 w-4" /> {t('text')}
              </button>
            )}
            {emailHref ? (
              <a href={emailHref} className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-teal-700 shadow-sm transition hover:bg-slate-50">
                <Mail className="h-4 w-4" /> {t('email')}
              </a>
            ) : (
              <button type="button" disabled className="inline-flex min-h-[56px] min-w-[168px] items-center justify-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-3 text-base font-semibold text-slate-400 opacity-70">
                <Mail className="h-4 w-4" /> {t('email')}
              </button>
            )}
          </div>
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

        <section className="grid gap-5 xl:grid-cols-[0.92fr_1.28fr]">
          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><UserRound className="h-5 w-5" /></span>
                {t('contactInformation')}
              </span>
            }
            headerAction={
              <button onClick={() => setIsEditOpen(true)} className="rounded-xl border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
                {t('editClient')}
              </button>
            }
            bodyClassName="space-y-3"
          >
            {renderDesktopContactField({
              label: t('phone'),
              value: phoneHref ? (
                <a href={`tel:${phoneHref}`} className="inline-flex max-w-full items-start gap-2 break-words text-left text-sm font-bold text-slate-900 hover:text-slate-700">
                  <span>{client.phone}</span>
                </a>
              ) : (
                client.phone || t('notAdded')
              ),
              actionIcon: phoneHref ? <a href={`tel:${phoneHref}`} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm transition hover:bg-slate-100"><Phone className="h-4 w-4" /></a> : null,
            })}
            {renderDesktopContactField({
              label: t('email'),
              value: emailHref ? (
                <a href={emailHref} className="inline-flex max-w-full items-start gap-2 break-all text-left text-sm font-bold text-slate-900 hover:text-slate-700">
                  <span>{client.email}</span>
                </a>
              ) : (
                client.email || t('notAdded')
              ),
              actionIcon: emailHref ? <a href={emailHref} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm transition hover:bg-slate-100"><Mail className="h-4 w-4" /></a> : null,
            })}
            {renderDesktopContactField({
              label: t('address'),
              value: mapsHref ? (
                <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex max-w-full items-start gap-2 break-words text-left text-sm font-bold text-slate-900 hover:text-slate-700">
                  <span>{client.address}</span>
                </a>
              ) : (
                client.address || t('notAdded')
              ),
              actionIcon: mapsHref ? <a href={mapsHref} target="_blank" rel="noreferrer" className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl bg-white text-teal-700 shadow-sm transition hover:bg-slate-100"><MapPin className="h-4 w-4" /></a> : null,
            })}
          </InfoCard>

          <InfoCard
            title={
              <span className="inline-flex items-center gap-3">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-700"><BriefcaseBusiness className="h-5 w-5" /></span>
                {t('projects')}
              </span>
            }
            bodyClassName="space-y-3"
          >
            {projectCards.length ? projectCards.map(({ project, displayDate, projectValue, remainingBalance, remainingBalanceAmount, thumbnail, projectAddress, contract, estimate }) => (
              <article key={project.id} className="flex items-center gap-4 rounded-3xl border border-slate-200 p-4 transition hover:border-slate-300 hover:bg-slate-50/60">
                {thumbnail ? (
                  <div className="h-20 w-24 shrink-0 overflow-hidden rounded-2xl bg-slate-100">
                    <img src={thumbnail} alt={project.projectTitle || project.projectType} className="h-full w-full object-cover" />
                  </div>
                ) : null}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-lg font-bold text-slate-950">{project.projectTitle || project.projectType}</h3>
                    {(hasContractData(contract) || hasEstimateData(estimate) || project.latestStatus || project.projectStatus || project.status || getLatestProjectInvoice(project)?.status) ? <StatusBadge status={getContextualProjectStatus(project, estimate, contract)} t={t} /> : null}
                  </div>
                  {projectAddress ? <p className="mt-1 truncate text-sm text-slate-500">{projectAddress}</p> : null}
                  <div className="mt-3 grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('date')}</p><p className="mt-1 font-semibold text-slate-900">{displayDate || t('notAdded')}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('value')}</p><p className="mt-1 font-semibold text-slate-900">{projectValue}</p></div>
                    <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('remaining')}</p><p className="mt-1 font-semibold text-slate-900">{remainingBalance}</p></div>
                  </div>
                </div>
                <div className="min-w-[110px] shrink-0 text-right">
                  <p className="text-3xl font-bold tracking-tight text-slate-950">{projectValue}</p>
                  <p className="mt-1 text-sm font-medium text-slate-500">
                    {Number(remainingBalanceAmount || 0) > 0 ? `${t('remaining')} ${remainingBalance}` : t('paidInFull')}
                  </p>
                  <button onClick={() => (project.isProjectRecord ? onOpenProject(project.id) : onOpenLead?.(project.id))} className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-slate-500 transition hover:text-slate-900">
                    <span>{hasEstimateData(estimate) && !hasContractData(contract) ? t('openEstimate') : t('view')}</span>
                    <ChevronRight className="h-4 w-4" />
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
