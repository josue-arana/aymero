import { useMemo } from 'react'
import { BriefcaseBusiness, DollarSign } from 'lucide-react'
import { ModalShell } from '../common/ModalShell'
import { currency } from '../../utils/formatters'
import { buildProjectPaymentSelectionSummary } from '../../utils/projectPaymentSelection'

const CLOSED_PROJECT_STATUSES = new Set(['completed', 'paid', 'archived', 'cancelled', 'canceled'])

function readProjectId(record = {}) {
  return record?.projectId || record?.project_id || record?.id || ''
}

function isArchived(record = {}, archivedIds = [], deletedIds = []) {
  const id = String(readProjectId(record) || '')
  return Boolean(
    record?.archivedAt
    || record?.archived_at
    || record?.isArchived
    || archivedIds.some((archivedId) => String(archivedId) === id)
    || deletedIds.some((deletedId) => String(deletedId) === id),
  )
}

function normalizeStatus(record = {}) {
  return String(record?.projectStatus || record?.status || '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function mergeProjectRecords(projects = [], leads = []) {
  const records = [...(Array.isArray(projects) ? projects : []), ...(Array.isArray(leads) ? leads : [])]
  const recordMap = new Map()

  records.forEach((record) => {
    const id = readProjectId(record)
    if (!id) return

    const existing = recordMap.get(String(id))
    recordMap.set(String(id), existing ? { ...record, ...existing } : record)
  })

  return [...recordMap.values()]
}

function getProjectTitle(record = {}, t) {
  return record?.projectTitle || record?.title || record?.projectType || record?.name || t('unknownProject')
}

function getClientName(record = {}, leads = [], clients = []) {
  const clientId = record?.clientId || record?.client_id
  const relatedLead = leads.find((lead) => lead?.id === record?.leadId || lead?.id === record?.lead_id)
  const client = clients.find((item) => item?.id === clientId)
  return record?.clientName
    || record?.client
    || relatedLead?.clientName
    || relatedLead?.client
    || client?.displayName
    || client?.name
    || ''
}

export function ProjectPaymentSelectionModal({
  isOpen,
  projects = [],
  leads = [],
  clients = [],
  estimates = [],
  contracts = [],
  invoices = [],
  payments = [],
  archivedIds = [],
  deletedIds = [],
  onClose,
  onSelectProject,
  onCreateJob,
  onViewJobs,
  t,
}) {
  const paymentProjects = useMemo(() => mergeProjectRecords(projects, leads)
    .filter((record) => !isArchived(record, archivedIds, deletedIds))
    .map((record) => {
      const projectId = String(readProjectId(record))
      const relatedLead = leads.find((lead) => (
        String(lead?.id || '') === projectId
        || String(lead?.projectId || lead?.project_id || '') === projectId
        || String(record?.leadId || record?.lead_id || '') === String(lead?.id || '')
      ))
      const project = { ...(relatedLead || {}), ...record, id: projectId, projectId }
      const summary = buildProjectPaymentSelectionSummary({ project: record, lead: relatedLead, estimates, contracts, invoices, payments })

      return {
        id: projectId,
        title: getProjectTitle(project, t),
        clientName: getClientName(project, leads, clients),
        status: record?.projectStatus || record?.status || relatedLead?.projectStatus || relatedLead?.status || '',
        projectValue: summary.projectValue,
        amountPaid: summary.amountPaid,
        remainingBalance: summary.remainingBalance,
        hasFinancialSummary: summary.hasFinancialSummary,
      }
    })
    .filter((project) => !CLOSED_PROJECT_STATUSES.has(normalizeStatus(project)))
    .filter((project) => project.remainingBalance === null || project.remainingBalance > 0)
    .sort((first, second) => `${first.title} ${first.clientName}`.localeCompare(`${second.title} ${second.clientName}`)),
  [archivedIds, clients, contracts, deletedIds, estimates, invoices, leads, payments, projects, t])

  if (!isOpen) return null

  return (
    <ModalShell isOpen onBackdropClick={onClose} panelClassName="sm:max-w-2xl">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
          <DollarSign className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="text-xl font-bold text-slate-950">{t('recordPayment')}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-500">{t('chooseProjectForPayment')}</p>
        </div>
      </div>

      {paymentProjects.length > 0 ? (
        <div className="mt-5 grid gap-3">
          {paymentProjects.map((project) => (
            <button
              key={project.id}
              type="button"
              onClick={() => onSelectProject?.(project.id)}
              className="flex min-h-20 w-full min-w-0 items-start justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              <span className="flex min-w-0 items-start gap-3">
                <BriefcaseBusiness className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                <span className="min-w-0">
                  <span className="block break-words font-bold text-slate-950">{project.title}</span>
                  {project.clientName ? <span className="mt-1 block break-words text-sm text-slate-600">{project.clientName}</span> : null}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="block text-xs font-semibold uppercase tracking-wide text-slate-500">{t('remaining')}</span>
                <span className="mt-1 block font-bold text-slate-950">{project.remainingBalance === null ? t('notAvailable') : currency.format(project.remainingBalance)}</span>
              </span>
            </button>
          ))}
        </div>
      ) : (
        <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5">
          <h3 className="font-bold text-slate-950">{t('noProjectsForPayment')}</h3>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t('noProjectsForPaymentHelp')}</p>
          <div className="mt-4 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={onViewJobs} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-white">{t('viewProjects')}</button>
            <button type="button" onClick={onCreateJob} className="min-h-11 rounded-2xl bg-blue-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-blue-700">{t('createJob')}</button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end">
        <button type="button" onClick={onClose} className="min-h-11 rounded-2xl border border-slate-200 px-4 py-2.5 text-sm font-bold text-slate-700 hover:bg-slate-50">{t('cancel')}</button>
      </div>
    </ModalShell>
  )
}
