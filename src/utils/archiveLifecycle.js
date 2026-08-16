function readArchiveTimestamp(record = {}) {
  return record?.archivedAt || record?.archived_at || null
}

function normalizeId(value) {
  return String(value || '').trim()
}

function normalizeStatus(value) {
  return String(value || '').trim().toLowerCase().replaceAll(/[_-]+/g, ' ')
}

export function isRecordArchived(record = {}, archivedIds = []) {
  const recordId = normalizeId(record?.id)

  return Boolean(
    record?.isArchived
      || record?.archived
      || readArchiveTimestamp(record)
      || (recordId && archivedIds.some((id) => normalizeId(id) === recordId))
  )
}

export function isEstimateConverted(estimate = {}, contract = null) {
  const status = normalizeStatus(estimate?.status)

  return Boolean(
    status === 'converted'
      || status === 'converted to contract'
      || estimate?.convertedAt
      || estimate?.converted_at
      || contract?.id
      || contract?.number
      || contract?.contractNumber
      || contract?.contract_number
  )
}

export function resolveEstimateArchiveState({
  estimate = {},
  lead = null,
  contract = null,
  archivedLeadIds = [],
} = {}) {
  const independentlyArchived = isRecordArchived(estimate)
  const leadArchived = isRecordArchived(lead || {}, archivedLeadIds)
  const estimateProjectId = normalizeId(estimate?.projectId || estimate?.project_id)
  const leadProjectId = normalizeId(lead?.projectId || lead?.project_id)
  const estimateLeadId = normalizeId(estimate?.leadId || estimate?.lead_id)
  const leadId = normalizeId(lead?.id || lead?.leadId || lead?.lead_id)
  const belongsToLead = Boolean(leadId && (!estimateLeadId || estimateLeadId === leadId))
  const converted = isEstimateConverted(estimate, contract)
  const inheritsLeadArchive = Boolean(
    !independentlyArchived
      && leadArchived
      && belongsToLead
      && !estimateProjectId
      && !leadProjectId
      && !converted
  )

  return {
    isArchived: independentlyArchived || inheritsLeadArchive,
    source: independentlyArchived ? 'estimate' : inheritsLeadArchive ? 'lead' : null,
    independentlyArchived,
    inheritsLeadArchive,
    leadArchived,
    converted,
  }
}
