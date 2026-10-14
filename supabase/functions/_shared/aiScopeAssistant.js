import {
  AI_SCOPE_INSTRUCTION_VERSIONS,
  buildConstructionAnalysisInstructions,
  buildLegacyProfessionalizeInstructions,
  buildLegacyTranslateInstructions,
  buildProfessionalScopeInstructions,
  buildTranslationInstructions,
} from './aiScopeAssistantInstructions.js'

export const AI_SCOPE_ACTIONS = Object.freeze({
  PROFESSIONALIZE: 'professionalize',
  TRANSLATE: 'translate',
})

export const AI_SCOPE_PROMPT_VERSIONS = Object.freeze({
  professionalize: AI_SCOPE_INSTRUCTION_VERSIONS.legacyProfessionalize,
  translate: AI_SCOPE_INSTRUCTION_VERSIONS.legacyTranslate,
})

export const AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS = Object.freeze({
  pipeline: 'controlled-pipeline-v1',
  constructionAnalysis: AI_SCOPE_INSTRUCTION_VERSIONS.constructionAnalysis,
  professionalize: AI_SCOPE_INSTRUCTION_VERSIONS.professionalScope,
  translate: AI_SCOPE_INSTRUCTION_VERSIONS.translation,
})

export const AI_SCOPE_LIMITS = Object.freeze({
  sourceCharacters: 12000,
  outputCharacters: 12000,
  warningCount: 5,
  warningCharacters: 300,
  maxOutputTokens: 4000,
})

export const AI_SCOPE_PROVIDER_ERROR_CODES = Object.freeze({
  REQUEST_INVALID: 'AI_SCOPE_PROVIDER_REQUEST_INVALID',
  AUTH_FAILED: 'AI_SCOPE_PROVIDER_AUTH_FAILED',
  ACCESS_DENIED: 'AI_SCOPE_PROVIDER_ACCESS_DENIED',
  MODEL_UNAVAILABLE: 'AI_SCOPE_PROVIDER_MODEL_UNAVAILABLE',
  RATE_LIMITED: 'AI_SCOPE_PROVIDER_RATE_LIMITED',
  UNAVAILABLE: 'AI_SCOPE_PROVIDER_UNAVAILABLE',
  TIMEOUT: 'AI_SCOPE_PROVIDER_TIMEOUT',
  UNREACHABLE: 'AI_SCOPE_PROVIDER_UNREACHABLE',
})

const supportedLanguages = new Set(['en', 'es'])

export class AiScopeContractError extends Error {
  constructor(message, code = 'AI_SCOPE_CONTRACT_INVALID') {
    super(message)
    this.name = 'AiScopeContractError'
    this.code = code
  }
}

export function normalizeAiScopeLanguage(value) {
  const normalized = String(value || '').trim().toLowerCase()
  return supportedLanguages.has(normalized) ? normalized : ''
}

export function classifyAiScopeProviderStatus(status) {
  const normalized = Number(status)
  if (normalized === 400) return AI_SCOPE_PROVIDER_ERROR_CODES.REQUEST_INVALID
  if (normalized === 401) return AI_SCOPE_PROVIDER_ERROR_CODES.AUTH_FAILED
  if (normalized === 403) return AI_SCOPE_PROVIDER_ERROR_CODES.ACCESS_DENIED
  if (normalized === 404) return AI_SCOPE_PROVIDER_ERROR_CODES.MODEL_UNAVAILABLE
  if (normalized === 429) return AI_SCOPE_PROVIDER_ERROR_CODES.RATE_LIMITED
  return AI_SCOPE_PROVIDER_ERROR_CODES.UNAVAILABLE
}

export function normalizeAiScopeProviderUsage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const readCount = (candidate) => Number.isSafeInteger(Number(candidate)) && Number(candidate) >= 0
    ? Number(candidate)
    : 0
  const inputTokens = readCount(value.input_tokens)
  const outputTokens = readCount(value.output_tokens)
  const totalTokens = readCount(value.total_tokens) || inputTokens + outputTokens
  const cachedInputTokens = readCount(value.input_tokens_details?.cached_tokens)
  const reasoningTokens = readCount(value.output_tokens_details?.reasoning_tokens)
  return { inputTokens, cachedInputTokens, outputTokens, reasoningTokens, totalTokens }
}

// Fingerprints normalize only transport-level differences: CRLF/CR become LF and
// leading/trailing whitespace is removed. Interior wording and whitespace remain
// significant so any persisted source edit changes the SHA-256 fingerprint.
export function normalizeAiScopeFingerprintSource(value) {
  return String(value || '').replace(/\r\n?/g, '\n').trim()
}

export async function createAiScopeFingerprint(value) {
  const normalized = normalizeAiScopeFingerprintSource(value)
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(normalized))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function requireAction(action) {
  const normalized = String(action || '').trim()
  if (!Object.values(AI_SCOPE_ACTIONS).includes(normalized)) {
    throw new AiScopeContractError('Unsupported Scope Assistant action.', 'AI_SCOPE_ACTION_INVALID')
  }
  return normalized
}

function requireSource(source) {
  const normalized = String(source || '')
  if (!normalized.trim()) throw new AiScopeContractError('Persisted scope source is empty.', 'AI_SCOPE_SOURCE_EMPTY')
  if (normalized.length > AI_SCOPE_LIMITS.sourceCharacters) {
    throw new AiScopeContractError('Persisted scope source exceeds the supported limit.', 'AI_SCOPE_SOURCE_TOO_LONG')
  }
  return normalized
}

function buildStructuredFormat(action) {
  const properties = {
    scope: {
      type: 'string',
    },
  }
  const required = ['scope']

  if (action === AI_SCOPE_ACTIONS.PROFESSIONALIZE) {
    properties.reviewWarnings = {
      type: 'array',
      items: {
        type: 'string',
      },
    }
    required.push('reviewWarnings')
  }

  return {
    type: 'json_schema',
    name: `aymero_scope_${action}_v2`,
    strict: true,
    schema: {
      type: 'object',
      properties,
      required,
      additionalProperties: false,
    },
  }
}

export function buildAiScopeResponsesRequest({
  action,
  model,
  source,
  sourceLanguage,
  targetLanguage = '',
} = {}) {
  const normalizedAction = requireAction(action)
  const normalizedSource = requireSource(source)
  const normalizedSourceLanguage = normalizeAiScopeLanguage(sourceLanguage)
  const normalizedTargetLanguage = normalizeAiScopeLanguage(targetLanguage)
  if (!normalizedSourceLanguage) {
    throw new AiScopeContractError('Persisted contractor language is unsupported.', 'AI_SCOPE_LANGUAGE_INVALID')
  }
  if (normalizedAction === AI_SCOPE_ACTIONS.TRANSLATE && !normalizedTargetLanguage) {
    throw new AiScopeContractError('Persisted client language is unsupported.', 'AI_SCOPE_TARGET_LANGUAGE_INVALID')
  }

  return {
    model: String(model || '').trim(),
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: AI_SCOPE_LIMITS.maxOutputTokens,
    instructions: normalizedAction === AI_SCOPE_ACTIONS.PROFESSIONALIZE
      ? buildLegacyProfessionalizeInstructions(normalizedSourceLanguage)
      : buildLegacyTranslateInstructions(normalizedSourceLanguage, normalizedTargetLanguage),
    input: JSON.stringify({
      sourceLanguage: normalizedSourceLanguage,
      ...(normalizedAction === AI_SCOPE_ACTIONS.TRANSLATE ? { targetLanguage: normalizedTargetLanguage } : {}),
      source: normalizedSource,
    }),
    text: { format: buildStructuredFormat(normalizedAction) },
  }
}

const interpretationFactStatuses = new Set(['stated', 'interpreted', 'requires_confirmation'])
const interpretationImpactLevels = new Set(['minor', 'material', 'safety'])

const factSchema = {
  type: 'object',
  properties: {
    text: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: [...interpretationFactStatuses] },
  },
  required: ['text', 'evidence', 'status'],
  additionalProperties: false,
}

const quantitySchema = {
  type: 'object',
  properties: {
    amount: { type: 'number' },
    unit: { type: 'string' },
    appliesTo: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: [...interpretationFactStatuses] },
  },
  required: ['amount', 'unit', 'appliesTo', 'evidence', 'status'],
  additionalProperties: false,
}

const measurementSchema = {
  type: 'object',
  properties: {
    value: { type: 'string' },
    appliesTo: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: [...interpretationFactStatuses] },
  },
  required: ['value', 'appliesTo', 'evidence', 'status'],
  additionalProperties: false,
}

const moneySchema = {
  type: 'object',
  properties: {
    present: { type: 'boolean' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: ['stated', 'requires_confirmation', 'not_provided'] },
  },
  required: ['present', 'amount', 'currency', 'evidence', 'status'],
  additionalProperties: false,
}

const pricedItemSchema = {
  type: 'object',
  properties: {
    label: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string' },
    evidence: { type: 'string' },
    status: { type: 'string', enum: ['stated', 'requires_confirmation'] },
  },
  required: ['label', 'amount', 'currency', 'evidence', 'status'],
  additionalProperties: false,
}

const materialsIncludedSchema = {
  type: 'object',
  properties: {
    value: { type: 'string', enum: ['included', 'excluded', 'mixed', 'unknown'] },
    evidence: { type: 'string' },
    status: { type: 'string', enum: ['stated', 'requires_confirmation', 'not_provided'] },
  },
  required: ['value', 'evidence', 'status'],
  additionalProperties: false,
}

const constructionInterpretationSchema = {
  type: 'object',
  properties: {
    projectTitle: {
      type: 'object',
      properties: {
        present: { type: 'boolean' },
        text: { type: 'string' },
        evidence: { type: 'string' },
        status: { type: 'string', enum: ['stated', 'interpreted', 'requires_confirmation', 'not_provided'] },
      },
      required: ['present', 'text', 'evidence', 'status'],
      additionalProperties: false,
    },
    workCategories: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: factSchema,
          activities: { type: 'array', items: factSchema },
          materials: { type: 'array', items: factSchema },
          quantities: { type: 'array', items: quantitySchema },
          measurements: { type: 'array', items: measurementSchema },
          conditions: { type: 'array', items: factSchema },
        },
        required: ['name', 'activities', 'materials', 'quantities', 'measurements', 'conditions'],
        additionalProperties: false,
      },
    },
    responsibilities: {
      type: 'object',
      properties: {
        contractor: { type: 'array', items: factSchema },
        homeowner: { type: 'array', items: factSchema },
      },
      required: ['contractor', 'homeowner'],
      additionalProperties: false,
    },
    ambiguities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          sourceText: { type: 'string' },
          likelyMeaning: { type: 'string' },
          impact: { type: 'string', enum: [...interpretationImpactLevels] },
          clarificationQuestion: { type: 'string' },
          safetySensitive: { type: 'boolean' },
        },
        required: ['sourceText', 'likelyMeaning', 'impact', 'clarificationQuestion', 'safetySensitive'],
        additionalProperties: false,
      },
    },
    commercialInformation: {
      type: 'object',
      properties: {
        totalPrice: moneySchema,
        downPayment: moneySchema,
        remainingBalance: moneySchema,
        itemizedPrices: { type: 'array', items: pricedItemSchema },
        additionalCosts: { type: 'array', items: pricedItemSchema },
        unknownCosts: { type: 'array', items: factSchema },
        paymentSchedule: { type: 'array', items: factSchema },
        materialsIncluded: materialsIncludedSchema,
      },
      required: ['totalPrice', 'downPayment', 'remainingBalance', 'itemizedPrices', 'additionalCosts', 'unknownCosts', 'paymentSchedule', 'materialsIncluded'],
      additionalProperties: false,
    },
    reviewWarnings: { type: 'array', items: { type: 'string' } },
  },
  required: ['projectTitle', 'workCategories', 'responsibilities', 'ambiguities', 'commercialInformation', 'reviewWarnings'],
  additionalProperties: false,
}

function buildProviderRequest({ model, instructions, input, formatName, schema }) {
  return {
    model: String(model || '').trim(),
    store: false,
    reasoning: { effort: 'low' },
    max_output_tokens: AI_SCOPE_LIMITS.maxOutputTokens,
    instructions,
    input: JSON.stringify(input),
    text: {
      format: {
        type: 'json_schema',
        name: formatName,
        strict: true,
        schema,
      },
    },
  }
}

export function buildConstructionAnalysisRequest({ model, source, sourceLanguage } = {}) {
  const normalizedSource = requireSource(source)
  const normalizedSourceLanguage = normalizeAiScopeLanguage(sourceLanguage)
  if (!normalizedSourceLanguage) {
    throw new AiScopeContractError('Persisted contractor language is unsupported.', 'AI_SCOPE_LANGUAGE_INVALID')
  }
  return buildProviderRequest({
    model,
    instructions: buildConstructionAnalysisInstructions(normalizedSourceLanguage),
    input: { sourceLanguage: normalizedSourceLanguage, source: normalizedSource },
    formatName: 'aymero_construction_interpretation_v1',
    schema: constructionInterpretationSchema,
  })
}

export function buildProfessionalScopeRequest({ model, interpretation, sourceLanguage } = {}) {
  const normalizedSourceLanguage = normalizeAiScopeLanguage(sourceLanguage)
  if (!normalizedSourceLanguage) {
    throw new AiScopeContractError('Persisted contractor language is unsupported.', 'AI_SCOPE_LANGUAGE_INVALID')
  }
  const validatedInterpretation = validateConstructionInterpretation(interpretation, normalizedSourceLanguage)
  return buildProviderRequest({
    model,
    instructions: buildProfessionalScopeInstructions(normalizedSourceLanguage),
    input: { sourceLanguage: normalizedSourceLanguage, interpretation: validatedInterpretation },
    formatName: 'aymero_professional_scope_v1',
    schema: buildStructuredFormat(AI_SCOPE_ACTIONS.PROFESSIONALIZE).schema,
  })
}

export function buildControlledTranslationRequest({ model, source, sourceLanguage, targetLanguage } = {}) {
  const normalizedSource = requireSource(source)
  const normalizedSourceLanguage = normalizeAiScopeLanguage(sourceLanguage)
  const normalizedTargetLanguage = normalizeAiScopeLanguage(targetLanguage)
  if (!normalizedSourceLanguage) {
    throw new AiScopeContractError('Persisted contractor language is unsupported.', 'AI_SCOPE_LANGUAGE_INVALID')
  }
  if (!normalizedTargetLanguage) {
    throw new AiScopeContractError('Persisted client language is unsupported.', 'AI_SCOPE_TARGET_LANGUAGE_INVALID')
  }
  return buildProviderRequest({
    model,
    instructions: buildTranslationInstructions(normalizedSourceLanguage, normalizedTargetLanguage),
    input: {
      sourceLanguage: normalizedSourceLanguage,
      targetLanguage: normalizedTargetLanguage,
      approvedScope: normalizedSource,
    },
    formatName: 'aymero_scope_translation_v1',
    schema: buildStructuredFormat(AI_SCOPE_ACTIONS.TRANSLATE).schema,
  })
}

function requireRecord(value, code, message) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AiScopeContractError(message, code)
  return value
}

function requireExactKeys(value, expectedKeys, code, message) {
  const keys = Object.keys(value)
  if (keys.length !== expectedKeys.length || keys.some((key) => !expectedKeys.includes(key))) {
    throw new AiScopeContractError(message, code)
  }
}

function requireText(value, fieldName, { allowEmpty = false, maxLength = 1000 } = {}) {
  if (typeof value !== 'string' || value.length > maxLength || (!allowEmpty && !value.trim())) {
    throw new AiScopeContractError(`The AI provider returned an invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  return value
}

function validateFact(value, fieldName) {
  const fact = requireRecord(value, 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned an invalid ${fieldName}.`)
  requireExactKeys(fact, ['text', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned an invalid ${fieldName}.`)
  requireText(fact.text, `${fieldName} text`)
  requireText(fact.evidence, `${fieldName} evidence`)
  if (!interpretationFactStatuses.has(fact.status)) {
    throw new AiScopeContractError(`The AI provider returned an invalid ${fieldName} status.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  return fact
}

function validateFactArray(value, fieldName, maxItems = 50) {
  if (!Array.isArray(value) || value.length > maxItems) {
    throw new AiScopeContractError(`The AI provider returned invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  value.forEach((fact, index) => validateFact(fact, `${fieldName}[${index}]`))
}

function validateMoney(value, fieldName) {
  const money = requireRecord(value, 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned invalid ${fieldName}.`)
  requireExactKeys(money, ['present', 'amount', 'currency', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned invalid ${fieldName}.`)
  if (typeof money.present !== 'boolean' || !Number.isFinite(money.amount) || money.amount < 0) {
    throw new AiScopeContractError(`The AI provider returned invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  if (money.present) {
    if (!/^[A-Z]{3}$/.test(money.currency) || !String(money.evidence || '').trim() || !['stated', 'requires_confirmation'].includes(money.status)) {
      throw new AiScopeContractError(`The AI provider returned invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
    }
  } else if (money.amount !== 0 || money.currency !== '' || money.evidence !== '' || money.status !== 'not_provided') {
    throw new AiScopeContractError(`The AI provider returned invalid absent ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
}

function validatePricedItems(value, fieldName) {
  if (!Array.isArray(value) || value.length > 30) {
    throw new AiScopeContractError(`The AI provider returned invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  value.forEach((item, index) => {
    const normalized = requireRecord(item, 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned invalid ${fieldName}.`)
    requireExactKeys(normalized, ['label', 'amount', 'currency', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', `The AI provider returned invalid ${fieldName}.`)
    requireText(normalized.label, `${fieldName}[${index}] label`)
    requireText(normalized.evidence, `${fieldName}[${index}] evidence`)
    if (!Number.isFinite(normalized.amount) || normalized.amount < 0 || !/^[A-Z]{3}$/.test(normalized.currency) || !['stated', 'requires_confirmation'].includes(normalized.status)) {
      throw new AiScopeContractError(`The AI provider returned invalid ${fieldName}.`, 'AI_SCOPE_INTERPRETATION_INVALID')
    }
  })
}

function validateMaterialsIncluded(value) {
  const materials = requireRecord(value, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid materials-included information.')
  requireExactKeys(materials, ['value', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid materials-included information.')
  if (!['included', 'excluded', 'mixed', 'unknown'].includes(materials.value)) {
    throw new AiScopeContractError('The AI provider returned invalid materials-included information.', 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  if (materials.value === 'unknown') {
    if (materials.evidence !== '' || materials.status !== 'not_provided') {
      throw new AiScopeContractError('The AI provider returned invalid unknown materials-included information.', 'AI_SCOPE_INTERPRETATION_INVALID')
    }
  } else if (!String(materials.evidence || '').trim() || !['stated', 'requires_confirmation'].includes(materials.status)) {
    throw new AiScopeContractError('The AI provider returned invalid materials-included information.', 'AI_SCOPE_INTERPRETATION_INVALID')
  }
}

export function validateConstructionInterpretation(value, sourceLanguage = 'en') {
  const interpretation = requireRecord(value, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid construction interpretation.')
  requireExactKeys(
    interpretation,
    ['projectTitle', 'workCategories', 'responsibilities', 'ambiguities', 'commercialInformation', 'reviewWarnings'],
    'AI_SCOPE_INTERPRETATION_INVALID',
    'The AI provider returned an invalid construction interpretation.',
  )

  const projectTitle = requireRecord(interpretation.projectTitle, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid project title.')
  requireExactKeys(projectTitle, ['present', 'text', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid project title.')
  if (typeof projectTitle.present !== 'boolean') throw new AiScopeContractError('The AI provider returned an invalid project title.', 'AI_SCOPE_INTERPRETATION_INVALID')
  if (projectTitle.present) {
    requireText(projectTitle.text, 'project title')
    requireText(projectTitle.evidence, 'project title evidence')
    if (!interpretationFactStatuses.has(projectTitle.status)) throw new AiScopeContractError('The AI provider returned an invalid project title.', 'AI_SCOPE_INTERPRETATION_INVALID')
  } else if (projectTitle.text !== '' || projectTitle.evidence !== '' || projectTitle.status !== 'not_provided') {
    throw new AiScopeContractError('The AI provider returned an invalid absent project title.', 'AI_SCOPE_INTERPRETATION_INVALID')
  }

  if (!Array.isArray(interpretation.workCategories) || interpretation.workCategories.length > 20) {
    throw new AiScopeContractError('The AI provider returned invalid work categories.', 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  interpretation.workCategories.forEach((category, categoryIndex) => {
    const normalized = requireRecord(category, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid work category.')
    requireExactKeys(normalized, ['name', 'activities', 'materials', 'quantities', 'measurements', 'conditions'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid work category.')
    validateFact(normalized.name, `workCategories[${categoryIndex}].name`)
    validateFactArray(normalized.activities, `workCategories[${categoryIndex}].activities`)
    validateFactArray(normalized.materials, `workCategories[${categoryIndex}].materials`)
    validateFactArray(normalized.conditions, `workCategories[${categoryIndex}].conditions`)
    if (!Array.isArray(normalized.quantities) || normalized.quantities.length > 30) throw new AiScopeContractError('The AI provider returned invalid quantities.', 'AI_SCOPE_INTERPRETATION_INVALID')
    normalized.quantities.forEach((quantity, quantityIndex) => {
      const item = requireRecord(quantity, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid quantity.')
      requireExactKeys(item, ['amount', 'unit', 'appliesTo', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid quantity.')
      if (!Number.isFinite(item.amount) || item.amount < 0) throw new AiScopeContractError('The AI provider returned an invalid quantity.', 'AI_SCOPE_INTERPRETATION_INVALID')
      requireText(item.unit, `quantity[${quantityIndex}] unit`)
      requireText(item.appliesTo, `quantity[${quantityIndex}] appliesTo`)
      requireText(item.evidence, `quantity[${quantityIndex}] evidence`)
      if (!interpretationFactStatuses.has(item.status)) throw new AiScopeContractError('The AI provider returned an invalid quantity status.', 'AI_SCOPE_INTERPRETATION_INVALID')
    })
    if (!Array.isArray(normalized.measurements) || normalized.measurements.length > 30) throw new AiScopeContractError('The AI provider returned invalid measurements.', 'AI_SCOPE_INTERPRETATION_INVALID')
    normalized.measurements.forEach((measurement, measurementIndex) => {
      const item = requireRecord(measurement, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid measurement.')
      requireExactKeys(item, ['value', 'appliesTo', 'evidence', 'status'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid measurement.')
      requireText(item.value, `measurement[${measurementIndex}] value`)
      requireText(item.appliesTo, `measurement[${measurementIndex}] appliesTo`)
      requireText(item.evidence, `measurement[${measurementIndex}] evidence`)
      if (!interpretationFactStatuses.has(item.status)) throw new AiScopeContractError('The AI provider returned an invalid measurement status.', 'AI_SCOPE_INTERPRETATION_INVALID')
    })
  })

  const responsibilities = requireRecord(interpretation.responsibilities, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid responsibilities.')
  requireExactKeys(responsibilities, ['contractor', 'homeowner'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid responsibilities.')
  validateFactArray(responsibilities.contractor, 'contractor responsibilities')
  validateFactArray(responsibilities.homeowner, 'homeowner responsibilities')

  if (!Array.isArray(interpretation.ambiguities) || interpretation.ambiguities.length > 20) throw new AiScopeContractError('The AI provider returned invalid ambiguities.', 'AI_SCOPE_INTERPRETATION_INVALID')
  interpretation.ambiguities.forEach((ambiguity, index) => {
    const item = requireRecord(ambiguity, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid ambiguity.')
    requireExactKeys(item, ['sourceText', 'likelyMeaning', 'impact', 'clarificationQuestion', 'safetySensitive'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned an invalid ambiguity.')
    requireText(item.sourceText, `ambiguity[${index}] sourceText`)
    requireText(item.likelyMeaning, `ambiguity[${index}] likelyMeaning`)
    requireText(item.clarificationQuestion, `ambiguity[${index}] clarificationQuestion`)
    if (!interpretationImpactLevels.has(item.impact) || typeof item.safetySensitive !== 'boolean') throw new AiScopeContractError('The AI provider returned an invalid ambiguity.', 'AI_SCOPE_INTERPRETATION_INVALID')
  })

  const commercial = requireRecord(interpretation.commercialInformation, 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid commercial information.')
  requireExactKeys(commercial, ['totalPrice', 'downPayment', 'remainingBalance', 'itemizedPrices', 'additionalCosts', 'unknownCosts', 'paymentSchedule', 'materialsIncluded'], 'AI_SCOPE_INTERPRETATION_INVALID', 'The AI provider returned invalid commercial information.')
  validateMoney(commercial.totalPrice, 'total price')
  validateMoney(commercial.downPayment, 'down payment')
  validateMoney(commercial.remainingBalance, 'remaining balance')
  validatePricedItems(commercial.itemizedPrices, 'itemized prices')
  validatePricedItems(commercial.additionalCosts, 'additional costs')
  validateFactArray(commercial.unknownCosts, 'unknown costs')
  validateFactArray(commercial.paymentSchedule, 'payment schedule')
  validateMaterialsIncluded(commercial.materialsIncluded)

  if (!Array.isArray(interpretation.reviewWarnings) || interpretation.reviewWarnings.length > AI_SCOPE_LIMITS.warningCount) {
    throw new AiScopeContractError('The AI provider returned invalid interpretation warnings.', 'AI_SCOPE_INTERPRETATION_INVALID')
  }
  const reviewWarnings = interpretation.reviewWarnings.map((warning) => requireText(warning, 'interpretation warning', { maxLength: AI_SCOPE_LIMITS.warningCharacters }))

  if (commercial.totalPrice.present && commercial.downPayment.present && commercial.remainingBalance.present) {
    const expectedTotal = commercial.downPayment.amount + commercial.remainingBalance.amount
    if (Math.abs(commercial.totalPrice.amount - expectedTotal) > 0.01) {
      const mismatchWarning = normalizeAiScopeLanguage(sourceLanguage) === 'es'
        ? 'Los montos indicados no coinciden entre el precio total, el anticipo y el saldo restante. Verifica Precio y Términos de pago.'
        : 'The stated total, down payment, and remaining balance do not reconcile. Verify Price and Payment Terms.'
      if (!reviewWarnings.includes(mismatchWarning)) {
        if (reviewWarnings.length >= AI_SCOPE_LIMITS.warningCount) reviewWarnings[reviewWarnings.length - 1] = mismatchWarning
        else reviewWarnings.push(mismatchWarning)
      }
    }
  }

  return { ...interpretation, reviewWarnings }
}

export function parseConstructionAnalysisResponse(providerResponse, sourceLanguage = 'en') {
  const outputText = extractAiScopeOutputText(providerResponse)
  let parsed
  try {
    parsed = JSON.parse(outputText)
  } catch {
    throw new AiScopeContractError('The AI provider returned malformed structured output.', 'AI_SCOPE_PROVIDER_JSON_INVALID')
  }
  return validateConstructionInterpretation(parsed, sourceLanguage)
}

export function mergeAiScopeProviderUsage(...values) {
  const usages = values.map(normalizeAiScopeProviderUsage).filter(Boolean)
  if (!usages.length) return null
  return usages.reduce((total, usage) => ({
    inputTokens: total.inputTokens + usage.inputTokens,
    cachedInputTokens: total.cachedInputTokens + usage.cachedInputTokens,
    outputTokens: total.outputTokens + usage.outputTokens,
    reasoningTokens: total.reasoningTokens + usage.reasoningTokens,
    totalTokens: total.totalTokens + usage.totalTokens,
  }), { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0, totalTokens: 0 })
}

export function extractAiScopeOutputText(providerResponse) {
  if (typeof providerResponse?.output_text === 'string' && providerResponse.output_text.trim()) {
    return providerResponse.output_text
  }

  for (const item of Array.isArray(providerResponse?.output) ? providerResponse.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (content?.type === 'refusal') {
        throw new AiScopeContractError('The AI provider declined the request.', 'AI_SCOPE_PROVIDER_REFUSAL')
      }
      if (content?.type === 'output_text' && typeof content.text === 'string' && content.text.trim()) {
        return content.text
      }
    }
  }

  throw new AiScopeContractError('The AI provider returned no structured output.', 'AI_SCOPE_PROVIDER_OUTPUT_MISSING')
}

export function validateAiScopeStructuredOutput(action, value) {
  const normalizedAction = requireAction(action)
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new AiScopeContractError('The AI provider returned an invalid result.', 'AI_SCOPE_PROVIDER_OUTPUT_INVALID')
  }

  const allowedKeys = normalizedAction === AI_SCOPE_ACTIONS.PROFESSIONALIZE
    ? new Set(['scope', 'reviewWarnings'])
    : new Set(['scope'])
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new AiScopeContractError('The AI provider returned unexpected fields.', 'AI_SCOPE_PROVIDER_OUTPUT_INVALID')
  }

  const scope = typeof value.scope === 'string' ? value.scope : ''
  if (!scope.trim() || scope.length > AI_SCOPE_LIMITS.outputCharacters) {
    throw new AiScopeContractError('The AI provider returned an invalid scope.', 'AI_SCOPE_PROVIDER_SCOPE_INVALID')
  }

  if (normalizedAction === AI_SCOPE_ACTIONS.TRANSLATE) return { scope }

  if (!Array.isArray(value.reviewWarnings) || value.reviewWarnings.length > AI_SCOPE_LIMITS.warningCount) {
    throw new AiScopeContractError('The AI provider returned invalid review warnings.', 'AI_SCOPE_PROVIDER_WARNINGS_INVALID')
  }
  const reviewWarnings = value.reviewWarnings.map((warning) => {
    if (typeof warning !== 'string' || !warning.trim() || warning.length > AI_SCOPE_LIMITS.warningCharacters) {
      throw new AiScopeContractError('The AI provider returned invalid review warnings.', 'AI_SCOPE_PROVIDER_WARNINGS_INVALID')
    }
    return warning
  })

  return { scope, reviewWarnings }
}

export function parseAiScopeProviderResponse(action, providerResponse) {
  const outputText = extractAiScopeOutputText(providerResponse)
  let parsed
  try {
    parsed = JSON.parse(outputText)
  } catch {
    throw new AiScopeContractError('The AI provider returned malformed structured output.', 'AI_SCOPE_PROVIDER_JSON_INVALID')
  }
  return validateAiScopeStructuredOutput(action, parsed)
}
