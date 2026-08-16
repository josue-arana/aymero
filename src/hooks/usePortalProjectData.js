import { useEffect, useMemo, useState } from 'react'
import { USE_SUPABASE_EVENTS, USE_SUPABASE_PAYMENTS, USE_SUPABASE_PROJECTS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import publicPortalService from '../services/publicPortalService'
import { getClientsContractorId } from '../services/system/clientsRuntimeService'
import { getProjectsContractorId } from '../services/system/projectsRuntimeService'
import { hasContractData, readLinkedContractDraft, writeLinkedContractDrafts } from '../utils/contractLinks'
import { hasEstimateData, readLinkedEstimateDraft, resolveEstimateTotal, toSafeNumber, writeLinkedEstimateDrafts } from '../utils/estimateLinks'
import { findPortalProject } from '../utils/portal'
import { resolveLinkedProjectId } from '../utils/projectIdentity'
import { calculateProjectPaymentSummary, collectProjectInvoiceIds, dedupePayments } from '../utils/projectPayments'
import { isClientVisibleScheduleEvent, isUpcomingClientScheduleEvent, sortScheduleEvents } from '../utils/scheduleEvents'

function normalizeEstimateRecord(estimate) {
  if (!hasEstimateData(estimate)) return null

  return {
    ...estimate,
    id: estimate?.id || null,
    projectId: estimate?.projectId || estimate?.project_id || null,
    clientId: estimate?.clientId || estimate?.client_id || null,
    number: estimate?.number || estimate?.estimateNumber || '',
    title: estimate?.title || estimate?.projectTitle || '',
    projectTitle: estimate?.projectTitle || estimate?.title || '',
    total: toSafeNumber(estimate?.total ?? estimate?.totalAmount ?? estimate?.amount),
    status: estimate?.status || '',
    summary: estimate?.summary || estimate?.scopeOfWork || estimate?.scope_of_work || '',
  }
}

function normalizeContractRecord(contract) {
  if (!hasContractData(contract)) return null

  const storedTotal = contract?.total ?? contract?.totalAmount ?? contract?.contractAmount
  const hasValidStoredTotal = storedTotal !== null
    && storedTotal !== undefined
    && storedTotal !== ''
    && Number.isFinite(Number(storedTotal))
  const hasStoredContractAmount = hasValidStoredTotal && contract?.hasStoredContractAmount !== false

  return {
    ...contract,
    id: contract?.id || null,
    projectId: contract?.projectId || contract?.project_id || null,
    clientId: contract?.clientId || contract?.client_id || null,
    estimateId: contract?.estimateId || contract?.estimate_id || null,
    number: contract?.number || contract?.contractNumber || '',
    contractNumber: contract?.contractNumber || contract?.number || '',
    total: toSafeNumber(storedTotal),
    hasStoredContractAmount,
    status: contract?.status || '',
    signedDate: contract?.signedDate || contract?.signed_at || '',
    scope: contract?.scope || contract?.scopeOfWork || contract?.scope_of_work || '',
  }
}

function normalizeProjectRecord(project, client, estimate, contract) {
  if (!project) return null

  const sourcePortal = project?.portal && typeof project.portal === 'object' ? project.portal : {}
  const linkedProjectId = resolveLinkedProjectId(project)
  const projectValue = resolveEstimateTotal(project, estimate, toSafeNumber(project?.value ?? project?.estimatedValue ?? project?.contractValue))
  const contractAmount = toSafeNumber(
    contract?.total
      ?? contract?.totalAmount
      ?? contract?.contractAmount
      ?? sourcePortal?.contractAmount
      ?? project?.contractValue
      ?? projectValue
  )
  const totalPaid = toSafeNumber(sourcePortal?.totalPaid ?? sourcePortal?.amountPaid ?? project?.amountPaid ?? project?.paid)
  const outstandingBalance = toSafeNumber(
    sourcePortal?.outstandingBalance
      ?? project?.remainingBalance
      ?? project?.remaining
      ?? Math.max(contractAmount - totalPaid, 0)
  )
  const clientName = client?.displayName || client?.name || project?.client || project?.clientName || project?.customerName || ''
  const address = project?.address || project?.location || client?.address || ''

  return {
    ...project,
    projectId: project?.projectId || project?.project_id || linkedProjectId || null,
    client: clientName,
    clientName,
    customerName: clientName,
    phone: project?.phone || client?.phone || '',
    email: project?.email || client?.email || '',
    address,
    location: project?.location || address,
    projectTitle: project?.projectTitle || project?.title || project?.projectType || '',
    projectType: project?.projectType || project?.jobType || project?.projectTitle || '',
    value: projectValue,
    estimatedValue: toSafeNumber(project?.estimatedValue ?? projectValue),
    contractValue: toSafeNumber(project?.contractValue ?? contractAmount),
    amountPaid: totalPaid,
    paid: totalPaid,
    remainingBalance: outstandingBalance,
    remaining: outstandingBalance,
    portal: {
      ...sourcePortal,
      contractAmount,
      totalPaid,
      amountPaid: totalPaid,
      outstandingBalance,
      estimate: estimate || {},
      contract: contract || {},
    },
  }
}

function findClientRecord(clients = [], project = {}) {
  const clientId = project?.clientId || project?.client_id || ''

  if (!clientId) return null

  return clients.find((client) => client?.id === clientId) || null
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

function dedupeProjectEvents(events = []) {
  return events.filter((event, index, collection) => {
    const key = event?.id || `${event?.title || event?.eventType || event?.type || 'event'}:${event?.date || ''}:${event?.startTime || ''}:${event?.projectId || event?.leadId || index}`
    return collection.findIndex((candidate, candidateIndex) => {
      const candidateKey = candidate?.id || `${candidate?.title || candidate?.eventType || candidate?.type || 'event'}:${candidate?.date || ''}:${candidate?.startTime || ''}:${candidate?.projectId || candidate?.leadId || candidateIndex}`
      return candidateKey === key
    }) === index
  })
}

function readProjectPaymentFallbacks(project = {}) {
  return dedupePayments([
    ...(Array.isArray(project?.payments) ? project.payments : []),
    ...(Array.isArray(project?.portal?.payments) ? project.portal.payments : []),
    ...(Array.isArray(project?.portal?.paymentHistory) ? project.portal.paymentHistory : []),
  ])
}

function normalizePublicPaymentRecords(payments = [], publicProjectId = '') {
  return dedupePayments(payments.map((payment) => ({
    ...payment,
    projectId: payment?.projectId || payment?.project_id || publicProjectId,
  })))
}

function normalizePublicEventRecords(events = [], publicProjectId = '') {
  return sortScheduleEvents(events.map((event) => ({
    ...event,
    projectId: publicProjectId,
  })))
}

function readProjectEventFallbacks(project = {}) {
  return sortScheduleEvents(dedupeProjectEvents([
    ...(Array.isArray(project?.scheduleEvents) ? project.scheduleEvents : []),
    ...(Array.isArray(project?.schedule) ? project.schedule : []),
    ...(Array.isArray(project?.events) ? project.events : []),
    ...(Array.isArray(project?.portal?.events) ? project.portal.events : []),
  ]))
}

export function usePortalProjectData({ portalId = '', projects = [], clients = [] } = {}) {
  const { contractor, company, session } = useAuth()
  const projectsContractorId = getProjectsContractorId({ contractor, company, session })
  const clientsContractorId = getClientsContractorId({ contractor, company, session })
  const initialProject = useMemo(() => findPortalProject(projects, portalId), [portalId, projects])
  const [project, setProject] = useState(USE_SUPABASE_PROJECTS ? null : initialProject)
  const [estimate, setEstimate] = useState(() => normalizeEstimateRecord(
    initialProject?.portal?.estimate || readLinkedEstimateDraft(initialProject || portalId, portalId)
  ))
  const [contract, setContract] = useState(() => normalizeContractRecord(
    initialProject?.portal?.contract || readLinkedContractDraft(initialProject || portalId, portalId)
  ))
  const [client, setClient] = useState(() => findClientRecord(clients, initialProject))
  const [paymentRecords, setPaymentRecords] = useState(() => readProjectPaymentFallbacks(initialProject))
  const [eventRecords, setEventRecords] = useState(() => readProjectEventFallbacks(initialProject))
  const [publicCompanySettings, setPublicCompanySettings] = useState(null)
  const [publicPortalPhotos, setPublicPortalPhotos] = useState([])
  const [portalLoadError, setPortalLoadError] = useState(null)
  const [isLoading, setIsLoading] = useState(Boolean(USE_SUPABASE_PROJECTS && portalId))
  const [hasLoaded, setHasLoaded] = useState(!USE_SUPABASE_PROJECTS)

  useEffect(() => {
    if (!USE_SUPABASE_PROJECTS) {
      setProject(initialProject || null)
      setIsLoading(false)
      setHasLoaded(true)
      return undefined
    }

    if (!portalId) {
      setProject(null)
      setIsLoading(false)
      setHasLoaded(true)
      return undefined
    }

    let isCancelled = false
    const abortController = new AbortController()

    async function loadProject() {
      setIsLoading(true)
      setPortalLoadError(null)

      try {
        const response = await publicPortalService.getByToken(portalId, { signal: abortController.signal })
        const payload = response?.data || null
        const publicProjectId = payload?.project?.projectId || payload?.project?.id || portalId
        const publicPayments = normalizePublicPaymentRecords(
          Array.isArray(payload?.payments) ? payload.payments : payload?.project?.portal?.payments || [],
          publicProjectId,
        )
        const publicEvents = normalizePublicEventRecords(
          Array.isArray(payload?.events) ? payload.events : payload?.project?.portal?.events || [],
          publicProjectId,
        )
        const resolvedProject = payload?.project
          ? {
              ...payload.project,
              publicPortalData: true,
              portal: {
                ...(payload.project.portal || {}),
                client: payload.client || {},
                estimate: payload.estimate || {},
                contract: payload.contract || {},
                payments: publicPayments,
                events: publicEvents,
                photos: Array.isArray(payload.photos) ? payload.photos : [],
              },
            }
          : initialProject || null

        if (!isCancelled) {
          setProject(resolvedProject || null)
          setClient(payload?.client || findClientRecord(clients, resolvedProject))
          setEstimate(normalizeEstimateRecord(payload?.estimate || resolvedProject?.portal?.estimate))
          setContract(normalizeContractRecord(payload?.contract || resolvedProject?.portal?.contract))
          setPaymentRecords(publicPayments.length ? publicPayments : readProjectPaymentFallbacks(resolvedProject))
          setEventRecords(publicEvents.length ? publicEvents : readProjectEventFallbacks(resolvedProject))
          setPublicPortalPhotos(Array.isArray(payload?.photos) ? payload.photos : [])
          setPublicCompanySettings(payload?.companySettings || null)
          setPortalLoadError(response?.error || null)
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
        if (!isCancelled) {
          setProject(initialProject || null)
          setPortalLoadError(error)
        }
      } finally {
        if (!isCancelled) {
          setHasLoaded(true)
          setIsLoading(false)
        }
      }
    }

    loadProject()

    return () => {
      isCancelled = true
      abortController.abort()
    }
  }, [clients, initialProject, portalId])

  useEffect(() => {
    let isCancelled = false

    async function loadEstimate() {
      if (project?.publicPortalData) {
        setEstimate(normalizeEstimateRecord(project?.portal?.estimate))
        return
      }

      const linkedProjectId = resolveLinkedProjectId(project)
      const linkedLeadId = project?.leadId || project?.lead_id || ''
      const projectDraft = readLinkedEstimateDraft(project || portalId, [portalId, linkedProjectId, linkedLeadId])
      const knownEstimateId = project?.estimateId || project?.estimate_id || project?.portal?.estimate?.id || projectDraft?.id || null
      let nextEstimate = normalizeEstimateRecord(projectDraft || project?.portal?.estimate)

      if (!projectsContractorId) {
        if (!isCancelled) {
          setEstimate(nextEstimate)
        }
        return
      }

      try {
        if (knownEstimateId) {
          const byIdResponse = await dataProvider.estimates.getById?.(knownEstimateId, { contractorId: projectsContractorId })

          if (byIdResponse?.data && !byIdResponse?.error) {
            nextEstimate = normalizeEstimateRecord(byIdResponse.data)
          }
        }

        if (!nextEstimate && linkedProjectId) {
          const listResponse = await dataProvider.estimates.list({
            contractorId: projectsContractorId,
            projectId: linkedProjectId,
            includeArchived: true,
          })

          if (!listResponse?.error) {
            nextEstimate = normalizeEstimateRecord(listResponse?.data?.[0] || null)
          }
        }
      } catch {
        nextEstimate = normalizeEstimateRecord(projectDraft || project?.portal?.estimate)
      }

      if (isCancelled) return

      setEstimate(nextEstimate)

      if (nextEstimate) {
        writeLinkedEstimateDrafts([linkedProjectId, linkedLeadId, portalId, knownEstimateId], nextEstimate)
      }
    }

    loadEstimate()

    return () => {
      isCancelled = true
    }
  }, [portalId, project, projectsContractorId])

  useEffect(() => {
    let isCancelled = false

    async function loadContract() {
      if (project?.publicPortalData) {
        setContract(normalizeContractRecord(project?.portal?.contract))
        return
      }

      const linkedProjectId = resolveLinkedProjectId(project)
      const linkedLeadId = project?.leadId || project?.lead_id || ''
      const linkedEstimateId = estimate?.id || project?.estimateId || project?.estimate_id || ''
      const projectDraft = readLinkedContractDraft(project || portalId, [portalId, linkedProjectId, linkedLeadId, linkedEstimateId])
      const knownContractId = project?.contractId || project?.contract_id || project?.portal?.contract?.id || projectDraft?.id || null
      let nextContract = normalizeContractRecord(projectDraft || project?.portal?.contract)

      if (!projectsContractorId) {
        if (!isCancelled) {
          setContract(nextContract)
        }
        return
      }

      try {
        if (knownContractId) {
          const byIdResponse = await dataProvider.contracts.getById?.(knownContractId, { contractorId: projectsContractorId })

          if (byIdResponse?.data && !byIdResponse?.error) {
            nextContract = normalizeContractRecord(byIdResponse.data)
          }
        }

        if (!nextContract && linkedProjectId) {
          const listResponse = await dataProvider.contracts.list({
            contractorId: projectsContractorId,
            projectId: linkedProjectId,
            includeArchived: true,
          })

          if (!listResponse?.error) {
            nextContract = normalizeContractRecord(listResponse?.data?.[0] || null)
          }
        }
      } catch {
        nextContract = normalizeContractRecord(projectDraft || project?.portal?.contract)
      }

      if (isCancelled) return

      setContract(nextContract)

      if (nextContract) {
        writeLinkedContractDrafts([linkedProjectId, linkedLeadId, linkedEstimateId, portalId, knownContractId], nextContract)
      }
    }

    loadContract()

    return () => {
      isCancelled = true
    }
  }, [estimate?.id, portalId, project, projectsContractorId])

  useEffect(() => {
    let isCancelled = false

    async function loadClient() {
      if (project?.publicPortalData) {
        setClient(project?.portal?.client || null)
        return
      }

      const fallbackClient = findClientRecord(clients, project)
      const clientId = project?.clientId || project?.client_id || fallbackClient?.id || ''

      if (!clientId) {
        setClient(null)
        return
      }

      setClient(fallbackClient || null)

      if (!clientsContractorId) {
        return
      }

      try {
        const response = await dataProvider.clients.getById?.(clientId, { contractorId: clientsContractorId })

        if (!isCancelled && response?.data && !response?.error) {
          setClient(response.data)
        }
      } catch {
        if (!isCancelled) {
          setClient(fallbackClient || null)
        }
      }
    }

    loadClient()

    return () => {
      isCancelled = true
    }
  }, [clients, clientsContractorId, project])

  useEffect(() => {
    let isCancelled = false

    async function loadPayments() {
      const fallbackPayments = readProjectPaymentFallbacks(project)

      if (project?.publicPortalData) {
        setPaymentRecords(fallbackPayments)
        return
      }

      const linkedProjectId = resolveLinkedProjectId(project)
      const linkedLeadId = project?.leadId || project?.lead_id || ''
      const clientId = project?.clientId || project?.client_id || ''

      if (!linkedProjectId && !linkedLeadId && !clientId) {
        setPaymentRecords(fallbackPayments)
        return
      }

      // Public portal visits can reach this route without contractor context under the
      // existing auth/RLS rules. In that case we keep project-scoped fallback data
      // instead of wiping valid hydrated records with an empty protected query result.
      if (USE_SUPABASE_PAYMENTS && !projectsContractorId) {
        setPaymentRecords(fallbackPayments)
        return
      }

      try {
        const response = await dataProvider.payments.list({
          contractorId: projectsContractorId,
          includeArchived: true,
          ...(linkedProjectId ? { projectId: linkedProjectId } : linkedLeadId ? { leadId: linkedLeadId } : clientId ? { clientId } : {}),
        })

        if (isCancelled) return

        if (response?.error) {
          setPaymentRecords(fallbackPayments)
          return
        }

        const persistedPayments = Array.isArray(response?.data) ? response.data : []
        const nextPayments = USE_SUPABASE_PAYMENTS
          ? dedupePayments(persistedPayments)
          : dedupePayments([
              ...persistedPayments,
              ...fallbackPayments,
            ])

        setPaymentRecords(nextPayments)
      } catch {
        if (!isCancelled) {
          setPaymentRecords(fallbackPayments)
        }
      }
    }

    loadPayments()

    return () => {
      isCancelled = true
    }
  }, [project, projectsContractorId])

  useEffect(() => {
    let isCancelled = false

    async function loadEvents() {
      if (project?.publicPortalData) {
        setEventRecords(readProjectEventFallbacks(project))
        return
      }

      const linkedProjectId = resolveLinkedProjectId(project)
      const relatedLeadId = project?.leadId || project?.lead_id || ''
      const clientId = project?.clientId || project?.client_id || ''
      const fallbackEvents = readProjectEventFallbacks(project).filter((event) => matchesProjectScheduleEvent(event, {
        projectId: linkedProjectId || portalId,
        relatedLeadId,
        clientId,
        projectTitle: project?.projectTitle || '',
        projectType: project?.projectType || '',
      }))

      if (USE_SUPABASE_EVENTS && !projectsContractorId) {
        setEventRecords(fallbackEvents)
        return
      }

      try {
        const response = await dataProvider.events.list({
          contractorId: projectsContractorId,
          includeArchived: true,
          ...(linkedProjectId ? { projectId: linkedProjectId } : relatedLeadId ? { leadId: relatedLeadId } : clientId ? { clientId } : {}),
        })

        if (isCancelled) return

        if (response?.error) {
          setEventRecords(fallbackEvents)
          return
        }

        const persistedEvents = Array.isArray(response?.data) ? response.data : []
        const nextEvents = dedupeProjectEvents(
          USE_SUPABASE_EVENTS
            ? persistedEvents
            : [
                ...persistedEvents,
                ...fallbackEvents,
              ]
        ).filter((event) => matchesProjectScheduleEvent(event, {
          projectId: linkedProjectId || portalId,
          relatedLeadId,
          clientId,
          projectTitle: project?.projectTitle || '',
          projectType: project?.projectType || '',
        }))

        setEventRecords(sortScheduleEvents(nextEvents))
      } catch {
        if (!isCancelled) {
          setEventRecords(fallbackEvents)
        }
      }
    }

    loadEvents()

    return () => {
      isCancelled = true
    }
  }, [portalId, project, projectsContractorId])

  const hydratedProject = useMemo(
    () => normalizeProjectRecord(project, client, estimate, contract),
    [client, contract, estimate, project]
  )
  const paymentSummary = useMemo(() => calculateProjectPaymentSummary({
    ...(hydratedProject || {}),
    id: resolveLinkedProjectId(hydratedProject || project, portalId),
    projectId: resolveLinkedProjectId(hydratedProject || project, portalId),
    portal: {
      ...(hydratedProject?.portal || {}),
      estimate: estimate || {},
      contract: contract || {},
    },
  }, paymentRecords, {
    relatedInvoiceIds: collectProjectInvoiceIds(hydratedProject || {}),
  }), [contract, estimate, hydratedProject, paymentRecords, portalId, project])
  const scheduleEvents = useMemo(() => (
    sortScheduleEvents(eventRecords.filter((event) => isClientVisibleScheduleEvent(event)))
  ), [eventRecords])
  const upcomingEvents = useMemo(() => (
    scheduleEvents.filter((event) => isUpcomingClientScheduleEvent(event))
  ), [scheduleEvents])

  return {
    project: hydratedProject,
    client,
    estimate,
    contract,
    paymentSummary,
    scheduleEvents,
    upcomingEvents,
    publicCompanySettings,
    publicPortalPhotos,
    portalVisibility: publicCompanySettings?.portal || null,
    portalLoadError,
    contractorId: hydratedProject?.contractorId || project?.contractorId || project?.contractor_id || projectsContractorId || '',
    isLoading,
    notFound: hasLoaded && !hydratedProject,
  }
}
