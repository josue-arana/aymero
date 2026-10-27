export function isSuccessfulClientUpdateResponse(response = {}, expectedClientId = '') {
  if (response?.error || !response?.data?.id) return false

  return !expectedClientId
    || String(response.data.id) === String(expectedClientId)
}
