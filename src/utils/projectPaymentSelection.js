import { dedupeById, getContractForProject, getEstimatesForProject } from './projectIdentity.js'
import { calculateProjectFinancialSummary } from './projectFinancials.js'

function readProjectId(record = {}) {
  return record?.projectId || record?.project_id || record?.id || ''
}

export function buildProjectPaymentSelectionSummary({
  project = {},
  lead = null,
  estimates = [],
  contracts = [],
  invoices = [],
  payments = [],
} = {}) {
  const projectId = String(readProjectId(project) || readProjectId(lead) || '')
  const mergedProject = {
    ...(lead || {}),
    ...project,
    id: projectId,
    projectId,
    portal: { ...(lead?.portal || {}), ...(project?.portal || {}) },
  }
  const inlineEstimate = mergedProject.portal?.estimate || null
  const projectEstimates = dedupeById([
    ...getEstimatesForProject(mergedProject, estimates),
    ...(inlineEstimate ? [inlineEstimate] : []),
  ])
  const inlineContract = mergedProject.portal?.contract || null
  const projectContract = inlineContract || getContractForProject(mergedProject, contracts, projectEstimates[0] || null)
  const projectPayments = dedupeById([
    ...(Array.isArray(payments) ? payments : []),
    ...(Array.isArray(lead?.payments) ? lead.payments : []),
    ...(Array.isArray(lead?.portal?.payments) ? lead.portal.payments : []),
    ...(Array.isArray(lead?.portal?.paymentHistory) ? lead.portal.paymentHistory : []),
    ...(Array.isArray(project?.payments) ? project.payments : []),
    ...(Array.isArray(project?.portal?.payments) ? project.portal.payments : []),
    ...(Array.isArray(project?.portal?.paymentHistory) ? project.portal.paymentHistory : []),
  ])
  const summary = calculateProjectFinancialSummary({
    project: mergedProject,
    estimates: projectEstimates,
    contracts: projectContract ? [projectContract] : [],
    invoices,
    payments: projectPayments,
  })

  return {
    ...summary,
    projectValue: summary.agreedValue,
    amountPaid: summary.totalProjectPaid,
    remainingBalance: summary.projectBalance,
    hasFinancialSummary: summary.agreedValue > 0 || summary.projectBalance !== null,
  }
}
