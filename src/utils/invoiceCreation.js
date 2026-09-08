import { calculateInvoiceTotal, normalizeInvoiceLineItems, roundMoney } from './invoiceRecords.js'

function normalizeId(value) {
  return String(value || '').trim()
}

function displayClientName(client) {
  if (!client || typeof client !== 'object') return ''

  return String(client.displayName || client.name || client.clientName || '').trim()
}

function recordsShareProject(left, right) {
  if (!left || typeof left !== 'object' || !right || typeof right !== 'object') return false

  const leftIds = new Set([
    left.id,
    left.projectId,
    left.project_id,
  ].map(normalizeId).filter(Boolean))

  return [right.id, right.projectId, right.project_id]
    .map(normalizeId)
    .filter(Boolean)
    .some((id) => leftIds.has(id))
}

export function buildInvoiceProjectOptions(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const projects = Array.isArray(source.projects) ? source.projects.filter(Boolean) : []
  const leads = Array.isArray(source.leads) ? source.leads.filter(Boolean) : []
  const clients = Array.isArray(source.clients) ? source.clients.filter(Boolean) : []
  const contracts = Array.isArray(source.contracts) ? source.contracts.filter(Boolean) : []
  const projectRecords = [
    ...projects,
    ...leads
      .filter((lead) => normalizeId(lead?.projectId || lead?.project_id))
      .map((lead) => ({
        ...lead,
        id: lead.projectId || lead.project_id,
        projectId: lead.projectId || lead.project_id,
        project_id: lead.projectId || lead.project_id,
        leadId: lead.id,
        lead_id: lead.id,
      })),
  ]
  const optionsByProjectId = new Map()

  projectRecords.forEach((project) => {
    const projectId = normalizeId(project?.id || project?.projectId || project?.project_id)
    if (!projectId || optionsByProjectId.has(projectId)) return

    const linkedLead = leads.find((lead) => recordsShareProject(lead, project)) || null
    const leadId = normalizeId(project?.leadId || project?.lead_id || linkedLead?.id)
    const clientId = normalizeId(project?.clientId || project?.client_id || linkedLead?.clientId || linkedLead?.client_id)
    const client = clients.find((record) => normalizeId(record?.id) === clientId) || null

    // Invoice creation requires a real Client relationship. A missing or stale
    // client_id cannot be repaired safely from a display name, because that
    // could attach the Invoice to another Client with a similar name.
    if (!clientId || !client) return

    const linkedContract = contracts.find((contract) => recordsShareProject(contract, project))
      || project?.portal?.contract
      || linkedLead?.portal?.contract
      || null
    const value = roundMoney(Number(project?.value ?? project?.estimatedValue ?? project?.contractValue ?? linkedLead?.value ?? 0) || 0)
    const amountPaid = roundMoney(Number(project?.amountPaid ?? project?.paid ?? project?.portal?.amountPaid ?? linkedLead?.amountPaid ?? linkedLead?.paid ?? 0) || 0)
    const explicitRemaining = project?.remainingBalance
      ?? project?.remaining
      ?? project?.portal?.outstandingBalance
      ?? linkedLead?.remainingBalance
      ?? linkedLead?.remaining
      ?? linkedLead?.portal?.outstandingBalance
    const remainingBalance = explicitRemaining === null || explicitRemaining === undefined || explicitRemaining === ''
      ? roundMoney(Math.max(value - amountPaid, 0))
      : roundMoney(Math.max(Number(explicitRemaining) || 0, 0))

    optionsByProjectId.set(projectId, {
      id: projectId,
      projectId,
      clientId,
      leadId: leadId || null,
      contractId: normalizeId(linkedContract?.id) || null,
      title: String(project?.projectTitle || project?.title || project?.projectType || linkedLead?.projectTitle || linkedLead?.projectType || '').trim(),
      clientName: displayClientName(client),
      value,
      amountPaid,
      remainingBalance,
      isArchived: Boolean(project?.archivedAt || project?.archived_at || project?.isArchived),
    })
  })

  return [...optionsByProjectId.values()]
    .filter((project) => !project.isArchived)
    .sort((left, right) => left.title.localeCompare(right.title) || left.clientName.localeCompare(right.clientName))
}

export function buildInvoiceCreationPayload(input = {}) {
  const source = input && typeof input === 'object' ? input : {}
  const {
    project,
    client,
    title,
    issueDate,
    dueDate,
    lineItems,
    paymentTerms = '',
    customerNotes = '',
    invoiceLanguage = '',
  } = source
  const normalizedLineItems = normalizeInvoiceLineItems(lineItems)
    .map((item) => ({ ...item, description: String(item.description || '').trim() }))
    .filter((item) => item.description || item.amount > 0)
  const total = calculateInvoiceTotal(normalizedLineItems)

  return {
    clientId: normalizeId(client?.id || project?.clientId) || null,
    projectId: normalizeId(project?.projectId || project?.id) || null,
    contractId: normalizeId(project?.contractId) || null,
    leadId: normalizeId(project?.leadId) || null,
    client: displayClientName(client) || project?.clientName || '',
    clientName: displayClientName(client) || project?.clientName || '',
    title: String(title || project?.title || '').trim() || 'Invoice',
    projectTitle: project?.title || String(title || '').trim() || 'Invoice',
    issueDate: issueDate || '',
    dueDate: dueDate || '',
    lineItems: normalizedLineItems,
    subtotal: total,
    taxAmount: 0,
    amount: total,
    total,
    totalAmount: total,
    amountPaid: 0,
    status: 'Draft',
    paymentTerms: String(paymentTerms || '').trim(),
    customerNotes: String(customerNotes || '').trim(),
    invoiceLanguage: String(invoiceLanguage || '').trim(),
    paymentHistory: [],
  }
}

export function validateInvoiceCreationDraft({
  selectedProject,
  selectedClient,
  title,
  issueDate,
  dueDate,
  lineItems,
} = {}) {
  const errors = {}

  if (!selectedClient) errors.client = 'required'
  if (!selectedProject) errors.project = 'required'
  if (!String(title || '').trim()) errors.title = 'required'
  if (!issueDate) errors.issueDate = 'required'
  if (!dueDate) errors.dueDate = 'required'
  if (issueDate && dueDate && dueDate < issueDate) errors.dueDate = 'beforeIssueDate'

  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    errors.lineItems = 'required'
    return errors
  }

  lineItems.forEach((item, index) => {
    const descriptionKey = `lineItems.${index}.description`
    const amountKey = `lineItems.${index}.amount`
    if (!String(item?.description || '').trim()) {
      errors[descriptionKey] = 'required'
    }

    const rawAmount = String(item?.amount ?? '').trim()
    if (!rawAmount) {
      errors[amountKey] = 'required'
      return
    }

    if (!/^\d+(?:\.\d+)?$/.test(rawAmount)) {
      errors[amountKey] = 'invalid'
      return
    }

    const amount = Number(rawAmount)
    if (!Number.isFinite(amount) || amount <= 0) {
      errors[amountKey] = 'positive'
      return
    }

    if (Math.round(amount * 100) !== amount * 100) {
      errors[amountKey] = 'precision'
    }
  })

  return errors
}
