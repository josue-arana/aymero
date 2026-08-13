import { useEffect, useMemo, useRef, useState } from 'react'
import { Archive, BriefcaseBusiness, CalendarDays, CheckCircle2, DollarSign, MoreVertical, Trash2, Undo2, Zap } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { SelectField } from '../components/ui/SelectField'
import { StatusBadge } from '../components/ui/StatusBadge'
import { MobileJobStat } from '../components/ui/MobileJobStat'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import ActionMenu from '../components/common/ActionMenu'
import { USE_SUPABASE_PROJECTS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { currency } from '../utils/formatters'
import { getPortalData } from '../utils/portal'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { tStatus } from '../translations'
import dataProvider from '../services/dataProvider'
import jobsHeroBackground from '../assets/page-heroes/jobs-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'
import { useToast } from '../components/common/ToastProvider'
import { deriveProjectStatus } from '../utils/projectLifecycle'

export function JobsPage({ leads, clients = [], archivedIds = [], sampleWorkspace, onViewJob, onViewLead, onCreateJob, onArchiveJob, onRestoreJob, onDeleteJob, t }) {
  const [selectedFilter, setSelectedFilter] = useState('All')
  const [confirmAction, setConfirmAction] = useState(null)
  const [projects, setProjects] = useState([])
  const [projectPayments, setProjectPayments] = useState([])
  const [projectContracts, setProjectContracts] = useState([])
  const [projectEvents, setProjectEvents] = useState([])
  const [isLoadingProjects, setIsLoadingProjects] = useState(false)
  const [activeJobActionId, setActiveJobActionId] = useState('')
  const jobActionGuardRef = useRef(false)
  const { contractor, company, session } = useAuth()
  const { showToast } = useToast()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorId = getProjectsContractorId({ contractor, company, session })
  const jobFilters = ['All', 'Archived', 'Contract Draft', 'Signed', 'In Progress', 'Completed']
  const isArchivedJob = (job) => Boolean(job?.isArchived || job?.archivedAt || archivedIds.includes(job?.id))
  const clientNameById = useMemo(() => new Map(
    clients.map((client) => [client.id, client.displayName || client.name || ''])
  ), [clients])

  useEffect(() => {
    let isCancelled = false

    if (!USE_SUPABASE_PROJECTS) {
      setProjects([])
      setProjectPayments([])
      setProjectContracts([])
      setProjectEvents([])
      return undefined
    }

    async function loadProjects() {
      setIsLoadingProjects(true)

      try {
        const [projectsResponse, paymentsResponse, contractsResponse, eventsResponse] = await Promise.all([
          dataProvider.projects.list({ contractorId, includeArchived: true }),
          dataProvider.payments.list({ contractorId, includeArchived: true }),
          dataProvider.contracts.list({ contractorId, includeArchived: true }),
          dataProvider.events.list({ contractorId, includeArchived: true }),
        ])

        if (isCancelled) return

        const nextProjects = Array.isArray(projectsResponse?.data) ? projectsResponse.data : []
        const nextPayments = Array.isArray(paymentsResponse?.data) ? paymentsResponse.data : []
        const nextContracts = Array.isArray(contractsResponse?.data) ? contractsResponse.data : []
        const nextEvents = Array.isArray(eventsResponse?.data) ? eventsResponse.data : []
        setProjects(nextProjects)
        setProjectPayments(nextPayments)
        setProjectContracts(nextContracts)
        setProjectEvents(nextEvents)
      } finally {
        if (!isCancelled) {
          setIsLoadingProjects(false)
        }
      }
    }

    loadProjects()

    return () => {
      isCancelled = true
    }
  }, [contractorId, leads.length])

  const jobs = useMemo(() => {
    const sourceRecords = USE_SUPABASE_PROJECTS ? projects : leads

    return sourceRecords
      .filter((lead) => (
        USE_SUPABASE_PROJECTS
          ? Boolean(lead?.id)
          : Boolean(lead.projectId || lead.project_id)
            || ['Won', 'Signed'].includes(lead.status)
            || ['Signed', 'Scheduled', 'In Progress', 'Waiting on Client', 'Waiting on Materials', 'Ready for Final Walkthrough', 'Completed', 'Paid'].includes(lead.projectStatus)
      ))
      .map((lead) => {
        const relatedLead = leads.find((item) => (
          item.id === lead?.leadId
          || item.id === lead?.lead_id
          || item.projectId === lead?.id
          || item.project_id === lead?.id
        ))
        const portal = getPortalData(lead)
        const resolvedProjectId = USE_SUPABASE_PROJECTS ? lead.id : (lead.projectId || lead.project_id || lead.id)
        const projectValue = Number(lead.projectValue ?? portal.contractAmount ?? lead.value ?? lead.estimatedValue ?? lead.contractValue ?? 0) || 0
        const linkedPayments = USE_SUPABASE_PROJECTS
          ? projectPayments.filter((payment) => (
              !payment.archivedAt
              && !payment.archived_at
              && (payment.projectId === resolvedProjectId || payment.project_id === resolvedProjectId)
            ))
          : [
              ...(Array.isArray(lead.payments) ? lead.payments : []),
              ...(Array.isArray(lead.portal?.payments) ? lead.portal.payments : []),
              ...(Array.isArray(lead.portal?.paymentHistory) ? lead.portal.paymentHistory : []),
            ]
        const linkedPaymentTotal = USE_SUPABASE_PROJECTS
          ? linkedPayments
            .reduce((sum, payment) => sum + Number(payment.amount || 0), 0)
          : 0
        const amountPaid = Number(linkedPaymentTotal || lead.amountPaid || lead.paid || portal.amountPaid || 0) || 0
        const remainingBalance = USE_SUPABASE_PROJECTS
          ? Math.max(projectValue - amountPaid, 0)
          : Number(lead.remainingBalance ?? lead.remaining ?? Math.max(projectValue - amountPaid, 0)) || 0
        const linkedContracts = USE_SUPABASE_PROJECTS
          ? projectContracts.filter((contract) => contract.projectId === resolvedProjectId || contract.project_id === resolvedProjectId)
          : [
              ...(Array.isArray(lead.contracts) ? lead.contracts : []),
              ...(lead.portal?.contract ? [lead.portal.contract] : []),
            ]
        const linkedEvents = USE_SUPABASE_PROJECTS
          ? projectEvents.filter((event) => (
              event.projectId === resolvedProjectId
              || event.project_id === resolvedProjectId
              || (!event.projectId && !event.project_id && relatedLead?.id && (event.leadId === relatedLead.id || event.lead_id === relatedLead.id))
            ))
          : [
              ...(Array.isArray(lead.events) ? lead.events : []),
              ...(Array.isArray(lead.schedule) ? lead.schedule : []),
              ...(Array.isArray(lead.scheduleEvents) ? lead.scheduleEvents : []),
            ]
        const derivedStatus = deriveProjectStatus({
          project: lead,
          contracts: [
            ...linkedContracts,
            ...(relatedLead?.portal?.contract ? [relatedLead.portal.contract] : []),
          ],
          payments: linkedPayments,
          events: linkedEvents,
          isArchived: isArchivedJob(lead),
        })
        const clientName = lead.client
          || lead.clientName
          || lead.customerName
          || clientNameById.get(lead.clientId)
          || clientNameById.get(lead.client_id)
          || relatedLead?.client
          || relatedLead?.clientName
          || relatedLead?.customerName
          || ''
        const projectTitle = lead.projectTitle
          || lead.title
          || lead.projectType
          || relatedLead?.projectTitle
          || relatedLead?.projectType
          || t('unknownProject')

        return {
          ...lead,
          routeProjectId: USE_SUPABASE_PROJECTS ? lead.id : (lead.projectId || lead.project_id || null),
          routeLeadId: relatedLead?.id || (!USE_SUPABASE_PROJECTS ? lead.id : (lead.leadId || lead.lead_id || null)),
          client: clientName,
          clientDisplayName: clientName || t('noClientLinked'),
          projectDisplayTitle: projectTitle,
          projectTitle,
          jobStatus: derivedStatus,
          startDate: lead.startDate || portal.startDate,
          projectValue,
          amountPaid,
          remainingBalance,
          nextStep: lead.nextStep || lead.notes || t('projectStatus'),
        }
      })
  }, [archivedIds, clientNameById, leads, projectContracts, projectEvents, projectPayments, projects, t])

  const activeJobsList = jobs.filter((job) => !isArchivedJob(job))
  const filteredJobs = selectedFilter === 'All'
    ? activeJobsList
    : selectedFilter === 'Archived'
      ? jobs.filter((job) => isArchivedJob(job))
      : activeJobsList.filter((job) => job.jobStatus === selectedFilter)

  const activeJobs = activeJobsList.filter((job) => job.jobStatus !== 'Completed').length
  const inProgressJobs = activeJobsList.filter((job) => job.jobStatus === 'In Progress').length
  const signedJobs = activeJobsList.filter((job) => job.jobStatus === 'Signed').length
  const completedThisMonth = activeJobsList.filter((job) => job.jobStatus === 'Completed').length
  const outstandingBalance = activeJobsList.reduce((sum, job) => sum + job.remainingBalance, 0)

  const summaryCards = [
    { label: t('activeJobs'), value: activeJobs, helper: t('activeJobsHelper'), icon: BriefcaseBusiness },
    { label: t('inProgress'), value: inProgressJobs, helper: t('inProgressHelper'), icon: Zap },
    { label: t('signed'), value: signedJobs, helper: t('signedProjectsHelper'), icon: CalendarDays },
    { label: t('completedThisMonth'), value: completedThisMonth, helper: t('completedThisMonthHelper'), icon: CheckCircle2 },
    { label: t('outstandingBalance'), value: currency.format(outstandingBalance), helper: t('outstandingBalanceHelper'), icon: DollarSign },
  ]


  function confirmArchive(job) {
    setConfirmAction({ mode: 'archive', job })
  }

  function confirmDelete(job) {
    setConfirmAction({ mode: 'delete', job })
  }

  function openJobRecord(job) {
    if (job?.routeProjectId) {
      onViewJob?.(job.routeProjectId, job.routeLeadId)
      return
    }

    if (job?.routeLeadId) {
      onViewLead?.(job.routeLeadId)
      return
    }

    showToast(t('projectUnavailable'), 'error')
  }

  async function inspectProjectDeletion(job) {
    const projectId = job?.routeProjectId || job?.id || ''
    const projectResponse = await dataProvider.projects.getById(projectId, { contractorId })

    if (projectResponse?.error || !projectResponse?.data) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Project deletion preflight could not load the project.', {
          projectId,
          contractorId,
          code: projectResponse?.error?.code || 'PROJECT_NOT_FOUND',
          message: projectResponse?.error?.message || null,
          details: projectResponse?.error?.details || null,
        })
      }
      return { error: projectResponse?.error || { code: 'PROJECT_NOT_FOUND' }, dependencies: null }
    }

    const project = projectResponse.data
    const ownerId = project.contractorId || project.contractor_id || ''
    if (!contractorId || ownerId !== contractorId) {
      return { error: { code: 'PROJECT_OWNERSHIP_MISMATCH' }, dependencies: null }
    }

    const dependencyResponses = await Promise.all([
      dataProvider.contracts.list({ contractorId, projectId, includeArchived: true }),
      dataProvider.estimates.list({ contractorId, projectId, includeArchived: true }),
      dataProvider.invoices.list({ contractorId, projectId, includeArchived: true }),
      dataProvider.payments.list({ contractorId, projectId, includeArchived: true }),
      dataProvider.events.list({ contractorId, projectId, includeArchived: true }),
      dataProvider.photos.listProjectPhotos({ contractorId, projectId }),
    ])
    const dependencyKeys = ['contracts', 'estimates', 'invoices', 'payments', 'events', 'photos']
    const failedIndex = dependencyResponses.findIndex((response) => response?.error)

    if (failedIndex >= 0) {
      const error = dependencyResponses[failedIndex].error
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Project deletion dependency check failed.', {
          projectId,
          contractorId,
          relationship: dependencyKeys[failedIndex],
          code: error?.code || null,
          message: error?.message || null,
          details: error?.details || null,
        })
      }
      return { error, dependencies: null }
    }

    const dependencies = Object.fromEntries(dependencyKeys.map((key, index) => [
      key,
      (dependencyResponses[index]?.data || []).map((record) => record.id).filter(Boolean),
    ]))
    dependencies.documents = (Array.isArray(project.documents) ? project.documents : [])
      .map((document) => document?.id)
      .filter(Boolean)
    const manifestProjectId = sampleWorkspace?.records?.project || null

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug('[dev] Project deletion preflight completed.', {
        project: {
          id: project.id,
          contractorId: ownerId,
          clientId: project.clientId || project.client_id || null,
          leadId: project.leadId || project.lead_id || null,
          sampleDataKey: project.sampleDataKey || project.sample_data_key || null,
          title: project.projectTitle || project.title || null,
          status: project.projectStatus || project.status || null,
        },
        manifestProjectId,
        isManifestProject: manifestProjectId === project.id,
        dependencies,
      })
    }

    return {
      data: project,
      error: null,
      dependencies,
      hasDependencies: Object.values(dependencies).some((ids) => ids.length > 0),
    }
  }

  async function runSingleFlightJobAction(jobId, task) {
    if (jobActionGuardRef.current) {
      return false
    }

    jobActionGuardRef.current = true
    setActiveJobActionId(jobId)

    try {
      const result = await task()
      return result ?? true
    } finally {
      jobActionGuardRef.current = false
      setActiveJobActionId('')
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return
    const projectId = confirmAction.job.routeProjectId || ''
    if (!projectId) {
      showToast(t('projectUnavailable'), 'error')
      setConfirmAction(null)
      return
    }

    await runSingleFlightJobAction(projectId, async () => {
      try {
        if (confirmAction.mode === 'archive') {
          const response = await dataProvider?.projects?.archive?.(projectId, { contractorId })
          if (response?.error) throw response.error
          if (USE_SUPABASE_PROJECTS) {
            setProjects((current) => current.map((project) => (
              project.id === projectId
                ? { ...project, archivedAt: new Date().toISOString(), archived_at: new Date().toISOString(), isArchived: true }
                : project
            )))
          }
          onArchiveJob?.(projectId)
        }
        if (confirmAction.mode === 'delete') {
          const inspection = await inspectProjectDeletion(confirmAction.job)
          if (inspection.error) {
            showToast(t('projectDeleteFailed'), 'error')
            return false
          }
          if (inspection.hasDependencies) {
            showToast(t('projectDeleteBlocked'), 'error')
            return false
          }

          const response = await dataProvider?.projects?.deletePermanently?.(projectId, { contractorId })
          if (response?.error) {
            if (import.meta.env.DEV) {
              // eslint-disable-next-line no-console
              console.error('[dev] Project deletion failed.', {
                projectId,
                contractorId,
                code: response.error?.code || null,
                message: response.error?.message || null,
                details: response.error?.details || null,
              })
            }
            showToast(t('projectDeleteFailed'), 'error')
            return false
          }
          if (USE_SUPABASE_PROJECTS) {
            setProjects((current) => current.filter((project) => project.id !== projectId))
          }
          onDeleteJob?.(projectId)
          const refreshResponse = await dataProvider.projects.list({ contractorId, includeArchived: true })
          if (!refreshResponse?.error && Array.isArray(refreshResponse?.data)) {
            setProjects(refreshResponse.data)
          }
          showToast(t('itemDeletedPermanently'))
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[dev] Jobs project action failed.', {
            action: confirmAction.mode,
            projectId,
            contractorId,
            code: err?.code || null,
            message: err?.message || null,
            details: err?.details || null,
          })
        }
        showToast(t(confirmAction.mode === 'delete' ? 'projectDeleteFailed' : 'archiveFailed'), 'error')
        return false
      } finally {
        setConfirmAction(null)
      }
      return true
    })
  }

  function renderJobActions(job, compact = false) {
    const isArchived = isArchivedJob(job)
    const isJobActionPending = activeJobActionId === job.id
    const moreMenuItems = isArchived
      ? [
          {
            id: 'restore-job',
            label: t('restore'),
            icon: <Undo2 className="mr-2 h-4 w-4" />,
            disabled: isJobActionPending || !job.routeProjectId,
            onClick: async (event) => {
              event.stopPropagation()
              await runSingleFlightJobAction(job.routeProjectId, async () => {
                try {
                  const response = await dataProvider?.projects?.restore?.(job.routeProjectId, { contractorId })
                  if (response?.error) throw response.error
                  if (USE_SUPABASE_PROJECTS) {
                    setProjects((current) => current.map((project) => (
                      project.id === job.routeProjectId
                        ? { ...project, archivedAt: null, archived_at: null, isArchived: false }
                        : project
                    )))
                  }
                } catch (err) {
                  showToast(t('restoreFailed'), 'error')
                  return false
                }
                onRestoreJob?.(job.routeProjectId)
                return true
              })
            },
          },
          {
            id: 'delete-job',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            disabled: isJobActionPending || !job.routeProjectId,
            onClick: () => confirmDelete(job),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
        ]
      : [
          {
            id: 'delete-job',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            disabled: isJobActionPending || !job.routeProjectId,
            onClick: () => confirmDelete(job),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
          {
            id: 'archive-job',
            label: t('archive'),
            icon: <Archive className="mr-2 h-4 w-4" />,
            disabled: isJobActionPending,
            onClick: () => confirmArchive(job),
            className: archiveMenuItemClasses,
          },
        ]
    const actionLayoutClasses = compact ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : 'flex items-center justify-end gap-2'
    const moreButtonClasses = compact
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'
      : 'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'

    if (isArchived) {
      return (
        <div className={actionLayoutClasses}>
          <button disabled={isJobActionPending || (!job.routeProjectId && !job.routeLeadId)} onClick={(event) => { event.stopPropagation(); openJobRecord(job) }} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t(job.routeProjectId ? 'viewJob' : job.routeLeadId ? 'viewLead' : 'projectUnavailable')}</button>
          <ActionMenu
            label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
            ariaLabel={t('more')}
            showChevron={!compact}
            buttonClassName={moreButtonClasses}
            items={moreMenuItems}
            buttonDisabled={isJobActionPending}
          />
        </div>
      )
    }
    return (
      <div className={actionLayoutClasses}>
        <button disabled={isJobActionPending || (!job.routeProjectId && !job.routeLeadId)} onClick={(event) => { event.stopPropagation(); openJobRecord(job) }} className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600">{t(job.routeProjectId ? 'viewJob' : job.routeLeadId ? 'viewLead' : 'projectUnavailable')}</button>
        <ActionMenu
          label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
          ariaLabel={t('more')}
          showChevron={!compact}
          buttonClassName={moreButtonClasses}
          items={moreMenuItems}
          buttonDisabled={isJobActionPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={buildHeroBackgroundStyle(jobsHeroBackground, 'rgba(2, 6, 23, 0.82)', 'rgba(15, 23, 42, 0.35)', '72% center')}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('jobs')}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('jobsPageTitle')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">
              {t('jobsHeroText')}
            </p>
          </div>
          <button onClick={() => onCreateJob?.()} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-blue-50">
            <BriefcaseBusiness className="h-4 w-4" /> {t('createJob')}
          </button>
        </div>
      </section>

      {isAnalyticsMode && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {summaryCards.map((card) => (
            <MetricCard key={card.label} {...card} />
          ))}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{t('jobList')}</h2>
            <p className="text-sm text-slate-500">{t('jobListHelp')}</p>
          </div>
          <SelectField
            value={selectedFilter}
            onChange={(event) => setSelectedFilter(event.target.value)}
            containerClassName="w-full lg:w-72"
            className="bg-slate-50"
            aria-label={t('filterJobsByStatus')}
          >
            {jobFilters.map((filter) => (
              <option key={filter} value={filter}>{filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}</option>
            ))}
          </SelectField>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {jobFilters.map((filter) => (
            <button
              key={filter}
              onClick={() => setSelectedFilter(filter)}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold transition ${selectedFilter === filter ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {filter === 'All' ? t('all') : filter === 'Archived' ? t('archived') : tStatus(t, filter)}
            </button>
          ))}
        </div>

        {USE_SUPABASE_PROJECTS && isLoadingProjects && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-600">
            {t('loadingJobs')}
          </div>
        )}

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('customerProject')}</th>
                <th className="px-4 py-3">{t('status')}</th>
                <th className="px-4 py-3">{t('startDate')}</th>
                <th className="px-4 py-3 text-right">{t('value')}</th>
                <th className="px-4 py-3 text-right">{t('paid')}</th>
                <th className="px-4 py-3 text-right">{t('remaining')}</th>
                <th className="px-4 py-3">{t('nextStep')}</th>
                <th className="px-4 py-3 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredJobs.map((job) => (
                <tr key={job.id} onClick={() => openJobRecord(job)} className="cursor-pointer bg-white transition hover:bg-blue-50/40">
                  <td className="px-4 py-4">
                    <p className="font-bold text-slate-950">{job.clientDisplayName}</p>
                    <p className="text-sm text-slate-500">{job.projectDisplayTitle}</p>
                  </td>
                  <td className="px-4 py-4"><StatusBadge status={isArchivedJob(job) ? 'Archived' : job.jobStatus} t={t} /></td>
                  <td className="px-4 py-4 font-medium text-slate-700">{job.startDate}</td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(job.projectValue)}</td>
                  <td className="px-4 py-4 text-right font-bold text-emerald-700">{currency.format(job.amountPaid)}</td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(job.remainingBalance)}</td>
                  <td className="max-w-[220px] px-4 py-4 text-slate-600">{job.nextStep}</td>
                  <td className="px-4 py-4 text-right">{renderJobActions(job)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredJobs.map((job) => (
            <article key={job.id} onClick={() => openJobRecord(job)} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="font-bold text-slate-950">{job.clientDisplayName}</h3>
                  <p className="text-sm text-slate-500">{job.projectDisplayTitle}</p>
                </div>
                <StatusBadge status={isArchivedJob(job) ? 'Archived' : job.jobStatus} t={t} />
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <MobileJobStat label={t('start')} value={job.startDate} />
                <MobileJobStat label={t('value')} value={currency.format(job.projectValue)} />
                <MobileJobStat label={t('paid')} value={currency.format(job.amountPaid)} />
                <MobileJobStat label={t('remaining')} value={currency.format(job.remainingBalance)} />
              </div>
              <div className="mt-4 rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">{t('nextStep')}</p>
                <p className="mt-1 text-sm font-medium text-slate-700">{job.nextStep}</p>
              </div>
              <div className="mt-4">{renderJobActions(job, true)}</div>
            </article>
          ))}
        </div>

        {filteredJobs.length === 0 && (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <p className="font-bold text-slate-900">{t('noJobsFound')}</p>
            <p className="mt-2 text-sm text-slate-500">{t('noJobsFoundHelp')}</p>
          </div>
        )}
      </section>
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode} title={confirmAction?.mode === 'delete' ? t('deleteProjectConfirmTitle') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('deleteProjectConfirmBody') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
    </div>
  )
}
