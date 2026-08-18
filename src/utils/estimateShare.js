export const ESTIMATE_SHARE_RESOLUTION = Object.freeze({
  ESTIMATE_MISSING: 'estimate-missing',
  TOKEN_MISSING: 'token-missing',
  TOKEN_INVALID: 'token-invalid',
  TOKEN_PRESENT: 'token-present',
  URL_GENERATION_FAILED: 'url-generation-failed',
  UNEXPECTED_ERROR: 'unexpected-runtime-error',
})

const INTERNAL_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PUBLIC_ESTIMATE_TOKEN_PATTERN = /^[a-z0-9_-]+$/i

function readTokenCandidates(record = {}) {
  return [
    record?.publicShareToken,
    record?.public_share_token,
    record?.estimate?.publicShareToken,
    record?.estimate?.public_share_token,
  ]
}

export function normalizeEstimatePublicShareToken(value = '') {
  const token = String(value || '').trim()

  if (
    token.length < 20
    || token.length > 200
    || INTERNAL_UUID_PATTERN.test(token)
    || !PUBLIC_ESTIMATE_TOKEN_PATTERN.test(token)
  ) {
    return ''
  }

  return token
}

export function resolveEstimatePublicShareToken(record = {}) {
  for (const candidate of readTokenCandidates(record)) {
    const token = normalizeEstimatePublicShareToken(candidate)
    if (token) return token
  }

  return ''
}

export function resolveEstimateShareLink(record, { buildUrl } = {}) {
  if (!record || typeof record !== 'object') {
    return {
      status: ESTIMATE_SHARE_RESOLUTION.ESTIMATE_MISSING,
      token: '',
      url: '',
    }
  }

  const candidates = readTokenCandidates(record)
  const hasPersistedTokenValue = candidates.some((candidate) => String(candidate || '').trim())
  const token = resolveEstimatePublicShareToken(record)

  if (!token) {
    return {
      status: hasPersistedTokenValue
        ? ESTIMATE_SHARE_RESOLUTION.TOKEN_INVALID
        : ESTIMATE_SHARE_RESOLUTION.TOKEN_MISSING,
      token: '',
      url: '',
    }
  }

  if (typeof buildUrl !== 'function') {
    return {
      status: ESTIMATE_SHARE_RESOLUTION.URL_GENERATION_FAILED,
      token,
      url: '',
    }
  }

  try {
    const url = String(buildUrl(token) || '').trim()

    return {
      status: url
        ? ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT
        : ESTIMATE_SHARE_RESOLUTION.URL_GENERATION_FAILED,
      token,
      url,
    }
  } catch (error) {
    return {
      status: ESTIMATE_SHARE_RESOLUTION.UNEXPECTED_ERROR,
      token,
      url: '',
      error,
    }
  }
}
