export const SCOPE_ASSISTANT_STATE_VERSION = 1
export const SCOPE_ASSISTANT_TEXT_LIMIT = 12000
export const SCOPE_ASSISTANT_WARNING_LIMIT = 300

export const SCOPE_ASSISTANT_STATUS = Object.freeze({
  NONE: 'none',
  DRAFT: 'draft',
  CURRENT: 'current',
  APPROVED: 'approved',
  STALE: 'stale',
})

export const SCOPE_ASSISTANT_SEND_REASON = Object.freeze({
  MANUAL: 'manual',
  READY: 'ready',
  APPROVAL_REQUIRED: 'approval_required',
  APPROVAL_STALE: 'approval_stale',
  TRANSLATION_REQUIRED: 'translation_required',
  TRANSLATION_STALE: 'translation_stale',
  CONTRACTOR_VERSION_NOT_ACCEPTED: 'contractor_version_not_accepted',
  CLIENT_VERSION_NOT_ACCEPTED: 'client_version_not_accepted',
  CANONICAL_SCOPE_MISMATCH: 'canonical_scope_mismatch',
})

const supportedLanguages = new Set(['en', 'es'])
const validApprovalStatuses = new Set([
  SCOPE_ASSISTANT_STATUS.DRAFT,
  SCOPE_ASSISTANT_STATUS.APPROVED,
  SCOPE_ASSISTANT_STATUS.STALE,
])
const validDerivedStatuses = new Set([
  SCOPE_ASSISTANT_STATUS.NONE,
  SCOPE_ASSISTANT_STATUS.CURRENT,
  SCOPE_ASSISTANT_STATUS.STALE,
])

function readText(value) {
  return typeof value === 'string' ? value : ''
}

function readNullableText(value) {
  const normalized = readText(value).trim()
  return normalized || null
}

function requireSupportedLength(value, fieldName) {
  const normalized = readText(value)
  if (normalized.length > SCOPE_ASSISTANT_TEXT_LIMIT) {
    throw new Error(`${fieldName} exceeds the supported limit.`)
  }
  return normalized
}

function readLanguage(value) {
  const normalized = readText(value).trim().toLowerCase()
  return supportedLanguages.has(normalized) ? normalized : ''
}

function readTimestamp(value) {
  const normalized = readText(value).trim()
  return normalized && Number.isFinite(Date.parse(normalized)) ? normalized : null
}

function readStatus(value, allowed, fallback) {
  const normalized = readText(value).trim().toLowerCase()
  return allowed.has(normalized) ? normalized : fallback
}

function normalizeGenerationMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null

  const promptVersion = readText(value.promptVersion).trim().slice(0, 100)
  const sourceFingerprint = readText(value.sourceFingerprint).trim()
  const generatedAt = readTimestamp(value.generatedAt)
  if (!promptVersion || !/^[0-9a-f]{64}$/i.test(sourceFingerprint) || !generatedAt) return null

  return {
    model: readNullableText(value.model)?.slice(0, 100) || null,
    promptVersion,
    generatedAt,
    sourceFingerprint,
  }
}

function normalizeCanonicalAcceptance(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const source = value.source === 'contractor' || value.source === 'client' ? value.source : ''
  const acceptedAt = readTimestamp(value.acceptedAt)
  const scopeFingerprint = readText(value.scopeFingerprint).trim()
  if (!source || !acceptedAt || !/^[0-9a-f]{64}$/i.test(scopeFingerprint)) return null
  return { source, acceptedAt, scopeFingerprint }
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) return []
  return value
    .filter((warning) => typeof warning === 'string')
    .map((warning) => warning.trim())
    .filter(Boolean)
    .map((warning) => warning.slice(0, SCOPE_ASSISTANT_WARNING_LIMIT))
    .slice(0, 5)
}

function requireInitializedState(state) {
  const normalized = normalizeScopeAssistantState(state)
  if (isEmptyScopeAssistantState(normalized)) {
    throw new Error('Scope Assistant state has not been initialized.')
  }
  return normalized
}

function requireNonEmptyText(value, fieldName) {
  const normalized = requireSupportedLength(value, fieldName)
  if (!normalized.trim()) throw new Error(`${fieldName} is required.`)
  return normalized
}

function cloneState(state) {
  return {
    ...state,
    reviewWarnings: [...state.reviewWarnings],
    professionalization: state.professionalization ? { ...state.professionalization } : null,
    translation: state.translation ? { ...state.translation } : null,
    canonicalAcceptance: state.canonicalAcceptance ? { ...state.canonicalAcceptance } : null,
  }
}

function clearCanonicalAcceptance(state) {
  return {
    ...state,
    canonicalAcceptance: null,
  }
}

export function isEmptyScopeAssistantState(value) {
  return Boolean(value)
    && typeof value === 'object'
    && !Array.isArray(value)
    && Object.keys(value).length === 0
}

export function normalizeScopeAssistantFingerprintSource(value) {
  return readText(value).replace(/\r\n?/g, '\n').trim()
}

export async function createScopeAssistantFingerprint(value) {
  const source = normalizeScopeAssistantFingerprintSource(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(source))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function createScopeAssistantState({
  rawContractorInput = '',
  contractorDraft = '',
  contractorLanguage,
  clientLanguage = '',
} = {}) {
  const normalizedContractorLanguage = readLanguage(contractorLanguage)
  if (!normalizedContractorLanguage) throw new Error('A supported contractor language is required.')

  return {
    version: SCOPE_ASSISTANT_STATE_VERSION,
    rawContractorInput: requireSupportedLength(rawContractorInput, 'Raw contractor input'),
    contractorDraft: requireSupportedLength(contractorDraft, 'Contractor draft'),
    contractorLanguage: normalizedContractorLanguage,
    professionalizationStatus: SCOPE_ASSISTANT_STATUS.NONE,
    professionalization: null,
    reviewWarnings: [],
    approvedContractorScope: '',
    approvalStatus: SCOPE_ASSISTANT_STATUS.DRAFT,
    approvedAt: null,
    approvedByMemberId: null,
    approvalSourceFingerprint: null,
    clientScope: '',
    clientScopeManuallyEdited: false,
    clientLanguage: readLanguage(clientLanguage),
    translationStatus: SCOPE_ASSISTANT_STATUS.NONE,
    translation: null,
    canonicalAcceptance: null,
  }
}

export function normalizeScopeAssistantState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || isEmptyScopeAssistantState(value)) return {}
  if (Number(value.version) !== SCOPE_ASSISTANT_STATE_VERSION) return {}

  const contractorLanguage = readLanguage(value.contractorLanguage)
  if (!contractorLanguage) return {}

  const professionalization = normalizeGenerationMetadata(value.professionalization)
  const translation = normalizeGenerationMetadata(value.translation)
  const approvedContractorScope = readText(value.approvedContractorScope)
  const fingerprintCandidate = readNullableText(value.approvalSourceFingerprint)
  const approvalSourceFingerprint = /^[0-9a-f]{64}$/i.test(fingerprintCandidate || '')
    ? fingerprintCandidate
    : null
  const requestedApprovalStatus = readStatus(value.approvalStatus, validApprovalStatuses, SCOPE_ASSISTANT_STATUS.DRAFT)
  const approvalStatus = requestedApprovalStatus === SCOPE_ASSISTANT_STATUS.DRAFT
    || (approvedContractorScope && approvalSourceFingerprint)
    ? requestedApprovalStatus
    : SCOPE_ASSISTANT_STATUS.DRAFT
  const requestedProfessionalizationStatus = readStatus(
    value.professionalizationStatus,
    validDerivedStatuses,
    professionalization ? SCOPE_ASSISTANT_STATUS.CURRENT : SCOPE_ASSISTANT_STATUS.NONE,
  )
  const clientScope = readText(value.clientScope)
  const requestedTranslationStatus = readStatus(
    value.translationStatus,
    validDerivedStatuses,
    translation ? SCOPE_ASSISTANT_STATUS.STALE : SCOPE_ASSISTANT_STATUS.NONE,
  )

  return {
    version: SCOPE_ASSISTANT_STATE_VERSION,
    rawContractorInput: readText(value.rawContractorInput),
    contractorDraft: readText(value.contractorDraft),
    contractorLanguage,
    professionalizationStatus: professionalization
      ? requestedProfessionalizationStatus
      : SCOPE_ASSISTANT_STATUS.NONE,
    professionalization,
    reviewWarnings: normalizeWarnings(value.reviewWarnings),
    approvedContractorScope,
    approvalStatus,
    approvedAt: readTimestamp(value.approvedAt),
    approvedByMemberId: readNullableText(value.approvedByMemberId)?.slice(0, 100) || null,
    approvalSourceFingerprint,
    clientScope,
    clientScopeManuallyEdited: Boolean(value.clientScopeManuallyEdited),
    clientLanguage: readLanguage(value.clientLanguage),
    translationStatus: translation && clientScope
      ? requestedTranslationStatus
      : SCOPE_ASSISTANT_STATUS.NONE,
    translation,
    canonicalAcceptance: normalizeCanonicalAcceptance(value.canonicalAcceptance),
  }
}

export function editRawContractorInput(state, rawContractorInput) {
  const current = requireInitializedState(state)
  const nextInput = requireSupportedLength(rawContractorInput, 'Raw contractor input')
  if (nextInput === current.rawContractorInput) return cloneState(current)

  return clearCanonicalAcceptance({
    ...cloneState(current),
    rawContractorInput: nextInput,
    professionalizationStatus: current.professionalization
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.NONE,
  })
}

export async function applyProfessionalizedCandidate(state, {
  scope,
  reviewWarnings = [],
  model,
  promptVersion,
  generatedAt = new Date().toISOString(),
} = {}) {
  const current = requireInitializedState(state)
  const candidate = requireNonEmptyText(scope, 'Professionalized scope')
  const hasApprovedSnapshot = Boolean(current.approvedContractorScope)

  return clearCanonicalAcceptance({
    ...cloneState(current),
    contractorDraft: candidate,
    professionalizationStatus: SCOPE_ASSISTANT_STATUS.CURRENT,
    professionalization: {
      model: readNullableText(model),
      promptVersion: requireNonEmptyText(promptVersion, 'Prompt version').trim(),
      generatedAt: readTimestamp(generatedAt) || new Date().toISOString(),
      sourceFingerprint: await createScopeAssistantFingerprint(current.rawContractorInput),
    },
    reviewWarnings: normalizeWarnings(reviewWarnings),
    approvalStatus: hasApprovedSnapshot ? SCOPE_ASSISTANT_STATUS.STALE : SCOPE_ASSISTANT_STATUS.DRAFT,
    translationStatus: current.translation || current.clientScope
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.NONE,
  })
}

export function editContractorDraft(state, contractorDraft) {
  const current = requireInitializedState(state)
  const nextDraft = requireSupportedLength(contractorDraft, 'Contractor draft')
  if (nextDraft === current.contractorDraft) return cloneState(current)

  return clearCanonicalAcceptance({
    ...cloneState(current),
    contractorDraft: nextDraft,
    approvalStatus: current.approvedContractorScope
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.DRAFT,
    translationStatus: current.translation || current.clientScope
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.NONE,
  })
}

export async function approveContractorDraft(state, {
  memberId = null,
  approvedAt = new Date().toISOString(),
} = {}) {
  const current = requireInitializedState(state)
  const approvedScope = requireNonEmptyText(current.contractorDraft, 'Contractor draft')

  return clearCanonicalAcceptance({
    ...cloneState(current),
    approvedContractorScope: approvedScope,
    approvalStatus: SCOPE_ASSISTANT_STATUS.APPROVED,
    approvedAt: readTimestamp(approvedAt) || new Date().toISOString(),
    approvedByMemberId: readNullableText(memberId),
    approvalSourceFingerprint: await createScopeAssistantFingerprint(approvedScope),
    translationStatus: current.translation || current.clientScope
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.NONE,
  })
}

export function changeScopeAssistantClientLanguage(state, clientLanguage) {
  const current = requireInitializedState(state)
  const nextLanguage = readLanguage(clientLanguage)
  if (!nextLanguage) throw new Error('A supported client language is required.')
  if (nextLanguage === current.clientLanguage) return cloneState(current)

  return clearCanonicalAcceptance({
    ...cloneState(current),
    clientLanguage: nextLanguage,
    translationStatus: current.translation || current.clientScope
      ? SCOPE_ASSISTANT_STATUS.STALE
      : SCOPE_ASSISTANT_STATUS.NONE,
  })
}

export function scopeAssistantNeedsTranslation(state) {
  const current = normalizeScopeAssistantState(state)
  return !isEmptyScopeAssistantState(current)
    && current.approvalStatus === SCOPE_ASSISTANT_STATUS.APPROVED
    && Boolean(current.approvedContractorScope)
    && Boolean(current.clientLanguage)
    && current.contractorLanguage !== current.clientLanguage
}

export async function applyClientScope(state, {
  scope,
  model = null,
  promptVersion,
  generatedAt = new Date().toISOString(),
} = {}) {
  const current = requireInitializedState(state)
  if (current.approvalStatus !== SCOPE_ASSISTANT_STATUS.APPROVED || !current.approvedContractorScope) {
    throw new Error('A current approved contractor scope is required.')
  }
  if (!current.clientLanguage) throw new Error('A supported client language is required.')

  const clientScope = requireNonEmptyText(scope, 'Client scope')
  if (current.contractorLanguage === current.clientLanguage && clientScope !== current.approvedContractorScope) {
    throw new Error('Same-language client scope must match the approved contractor scope.')
  }

  return clearCanonicalAcceptance({
    ...cloneState(current),
    clientScope,
    clientScopeManuallyEdited: false,
    translationStatus: SCOPE_ASSISTANT_STATUS.CURRENT,
    translation: {
      model: readNullableText(model),
      promptVersion: requireNonEmptyText(promptVersion, 'Prompt version').trim(),
      generatedAt: readTimestamp(generatedAt) || new Date().toISOString(),
      sourceFingerprint: await createScopeAssistantFingerprint(current.approvedContractorScope),
    },
  })
}

export function editScopeAssistantClientScope(state, clientScope) {
  const current = requireInitializedState(state)
  if (
    current.contractorLanguage === current.clientLanguage
    || current.approvalStatus !== SCOPE_ASSISTANT_STATUS.APPROVED
    || current.translationStatus !== SCOPE_ASSISTANT_STATUS.CURRENT
    || !current.translation
  ) {
    throw new Error('A current translated client scope is required.')
  }

  const nextClientScope = requireSupportedLength(clientScope, 'Client scope')
  if (nextClientScope === current.clientScope) return cloneState(current)

  return clearCanonicalAcceptance({
    ...cloneState(current),
    clientScope: nextClientScope,
    clientScopeManuallyEdited: true,
  })
}

export async function isScopeAssistantApprovalCurrent(state) {
  const current = normalizeScopeAssistantState(state)
  if (isEmptyScopeAssistantState(current) || current.approvalStatus !== SCOPE_ASSISTANT_STATUS.APPROVED) return false
  if (!current.approvedContractorScope || !current.approvalSourceFingerprint) return false
  if (current.contractorDraft !== current.approvedContractorScope) return false
  const [draftFingerprint, approvedFingerprint] = await Promise.all([
    createScopeAssistantFingerprint(current.contractorDraft),
    createScopeAssistantFingerprint(current.approvedContractorScope),
  ])
  return current.approvalSourceFingerprint === draftFingerprint
    && current.approvalSourceFingerprint === approvedFingerprint
}

export async function isScopeAssistantProfessionalizationCurrent(state) {
  const current = normalizeScopeAssistantState(state)
  if (isEmptyScopeAssistantState(current) || current.professionalizationStatus !== SCOPE_ASSISTANT_STATUS.CURRENT) return false
  if (!current.professionalization || !current.contractorDraft) return false
  return current.professionalization.sourceFingerprint === await createScopeAssistantFingerprint(current.rawContractorInput)
}

export async function isScopeAssistantTranslationCurrent(state) {
  const current = normalizeScopeAssistantState(state)
  if (isEmptyScopeAssistantState(current) || current.translationStatus !== SCOPE_ASSISTANT_STATUS.CURRENT) return false
  if (!current.translation || !current.approvedContractorScope || !current.clientScope) return false
  if (!await isScopeAssistantApprovalCurrent(current)) return false
  return current.translation.sourceFingerprint === await createScopeAssistantFingerprint(current.approvedContractorScope)
}

export async function acceptScopeAssistantCanonicalScope(state, {
  canonicalScope,
  acceptedAt = new Date().toISOString(),
} = {}) {
  const current = requireInitializedState(state)
  if (!await isScopeAssistantApprovalCurrent(current)) {
    throw new Error('A current approved contractor scope is required.')
  }

  const translationRequired = current.contractorLanguage !== current.clientLanguage
  if (translationRequired && !await isScopeAssistantTranslationCurrent(current)) {
    throw new Error('A current client translation is required.')
  }

  const source = translationRequired ? 'client' : 'contractor'
  const expectedScope = translationRequired ? current.clientScope : current.approvedContractorScope
  const acceptedScope = requireNonEmptyText(canonicalScope, 'Canonical scope')
  if (acceptedScope !== expectedScope) {
    throw new Error('Canonical scope must exactly match the accepted assistant version.')
  }

  return {
    ...cloneState(current),
    canonicalAcceptance: {
      source,
      acceptedAt: readTimestamp(acceptedAt) || new Date().toISOString(),
      scopeFingerprint: await createScopeAssistantFingerprint(expectedScope),
    },
  }
}

export async function getScopeAssistantSendReadiness(state, canonicalScope = '') {
  const current = normalizeScopeAssistantState(state)
  if (isEmptyScopeAssistantState(current)) {
    return { ready: true, manual: true, reason: SCOPE_ASSISTANT_SEND_REASON.MANUAL }
  }

  if (!await isScopeAssistantApprovalCurrent(current)) {
    return {
      ready: false,
      manual: false,
      reason: current.approvalStatus === SCOPE_ASSISTANT_STATUS.STALE
        ? SCOPE_ASSISTANT_SEND_REASON.APPROVAL_STALE
        : SCOPE_ASSISTANT_SEND_REASON.APPROVAL_REQUIRED,
    }
  }

  const translationRequired = current.contractorLanguage !== current.clientLanguage
  if (translationRequired && !await isScopeAssistantTranslationCurrent(current)) {
    return {
      ready: false,
      manual: false,
      reason: current.translationStatus === SCOPE_ASSISTANT_STATUS.STALE
        ? SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_STALE
        : SCOPE_ASSISTANT_SEND_REASON.TRANSLATION_REQUIRED,
    }
  }

  const acceptanceSource = translationRequired ? 'client' : 'contractor'
  const expectedScope = translationRequired ? current.clientScope : current.approvedContractorScope
  const acceptance = current.canonicalAcceptance
  const expectedFingerprint = await createScopeAssistantFingerprint(expectedScope)
  if (
    !acceptance
    || acceptance.source !== acceptanceSource
    || acceptance.scopeFingerprint !== expectedFingerprint
  ) {
    return {
      ready: false,
      manual: false,
      reason: translationRequired
        ? SCOPE_ASSISTANT_SEND_REASON.CLIENT_VERSION_NOT_ACCEPTED
        : SCOPE_ASSISTANT_SEND_REASON.CONTRACTOR_VERSION_NOT_ACCEPTED,
    }
  }

  if (readText(canonicalScope) !== expectedScope) {
    return { ready: false, manual: false, reason: SCOPE_ASSISTANT_SEND_REASON.CANONICAL_SCOPE_MISMATCH }
  }

  return { ready: true, manual: false, reason: SCOPE_ASSISTANT_SEND_REASON.READY }
}

export function normalizeScopeAssistantStateForStorage(value) {
  const normalized = normalizeScopeAssistantState(value)
  if (isEmptyScopeAssistantState(normalized)) return {}

  for (const [fieldName, textValue] of [
    ['Raw contractor input', normalized.rawContractorInput],
    ['Contractor draft', normalized.contractorDraft],
    ['Approved contractor scope', normalized.approvedContractorScope],
    ['Client scope', normalized.clientScope],
  ]) {
    requireSupportedLength(textValue, fieldName)
  }
  return normalized
}
