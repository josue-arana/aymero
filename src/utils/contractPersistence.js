function readResponseRow(response = {}) {
  const data = response?.data
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

export function isSuccessfulContractPersistenceResponse(response = {}) {
  return Boolean(readResponseRow(response)?.id && response?.count !== 0)
}
