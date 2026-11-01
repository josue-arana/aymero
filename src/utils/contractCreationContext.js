function readId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function getContractCreationLookupIds({ leadId = '', estimate = {} } = {}) {
  return Array.from(new Set([
    leadId,
    estimate?.leadId,
    estimate?.lead_id,
    estimate?.projectId,
    estimate?.project_id,
  ].map(readId).filter(Boolean)))
}
