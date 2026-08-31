const postgresUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function normalizePostgresUuid(value) {
  const normalized = String(value || '').trim()
  return postgresUuidPattern.test(normalized) ? normalized.toLowerCase() : ''
}

export function isPostgresUuid(value) {
  return Boolean(normalizePostgresUuid(value))
}

export function hasMatchingBillingTenant(metadataContractorId, persistedContractorId) {
  const metadataId = normalizePostgresUuid(metadataContractorId)
  const persistedId = normalizePostgresUuid(persistedContractorId)
  return Boolean(metadataId && persistedId && metadataId === persistedId)
}
