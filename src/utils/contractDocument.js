import { currency } from './formatters'
import { getPaymentTermLabel } from './paymentTerms'
import {
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_MATERIALS_INCLUDED,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
  normalizeEstimateLineItemForDocument,
} from './estimateDocument'

function toSafeNumber(value, fallback = 0) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function normalizeMultilineText(value) {
  return String(value || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function normalizeMaterialsIncluded(value, fallbackValue = null) {
  if (typeof value === 'boolean') {
    return value
  }

  if (typeof fallbackValue === 'boolean') {
    return fallbackValue
  }

  return null
}

function normalizeMaterialsStatus(item = {}, materialsIncluded = null) {
  if (item?.materialsStatus === ESTIMATE_OWNER_SUPPLIED_MATERIALS) {
    return ESTIMATE_OWNER_SUPPLIED_MATERIALS
  }

  if (item?.materialsStatus === ESTIMATE_LABOR_ONLY) {
    return ESTIMATE_LABOR_ONLY
  }

  if (item?.materialsStatus === ESTIMATE_MATERIALS_INCLUDED) {
    return ESTIMATE_MATERIALS_INCLUDED
  }

  if (typeof materialsIncluded === 'boolean') {
    return materialsIncluded ? ESTIMATE_MATERIALS_INCLUDED : ESTIMATE_LABOR_ONLY
  }

  return null
}

export function stripLeadingBulletMarker(text) {
  const normalizedText = String(text || '').trim()
  if (!normalizedText) {
    return ''
  }

  return normalizedText.replace(/^[-–—•*]\s+/, '').trim()
}

export function splitContractWorkBreakdownDescription(value, fallbackTitle = '') {
  const normalizedText = normalizeMultilineText(value)

  if (!normalizedText) {
    return {
      title: fallbackTitle,
      details: [],
      rawText: '',
    }
  }

  const [firstLine, ...remainingLines] = normalizedText.split('\n')

  return {
    title: firstLine.trim() || fallbackTitle,
    details: remainingLines.filter((line) => String(line || '').trim()),
    rawText: normalizedText,
  }
}

export function normalizeContractWorkBreakdown(items = [], fallbackMaterialsIncluded = null) {
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .map((item, index) => {
      const rawText = normalizeMultilineText(
        item?.rawText
          ?? item?.name
          ?? item?.description
          ?? item?.title
          ?? ''
      )
      const amount = toSafeNumber(item?.amount)
      const materialsIncluded = normalizeMaterialsIncluded(item?.materialsIncluded, fallbackMaterialsIncluded)
      const materialsStatus = normalizeMaterialsStatus(item, materialsIncluded)
      const normalizedRichItem = normalizeEstimateLineItemForDocument({
        ...item,
        name: rawText,
      }, {
        displayOrder: index,
        fallbackMaterialsIncluded: Boolean(materialsIncluded),
      })

      return {
        id: item?.id || `contract-breakdown-${index}`,
        title: normalizedRichItem.title,
        titleSize: normalizedRichItem.titleSize,
        titleSegments: normalizedRichItem.titleSegments,
        details: normalizedRichItem.detailLines,
        description: normalizedRichItem.description,
        descriptionBlocks: normalizedRichItem.descriptionBlocks,
        contentBlocks: normalizedRichItem.contentBlocks,
        rawText,
        amount,
        materialsIncluded,
        materialsStatus,
      }
    })
    .filter((item) => item.rawText || item.amount > 0)
}

export function buildContractWorkBreakdownFromEstimate(estimate = {}) {
  return normalizeContractWorkBreakdown(
    estimate?.lineItems || estimate?.line_items || [],
    estimate?.materialsIncluded ?? estimate?.materials_included ?? null
  )
}

export function hasContractWorkBreakdown(workBreakdown = []) {
  return normalizeContractWorkBreakdown(workBreakdown).length > 0
}

export function isGeneratedContractScopeText(scope = '') {
  const normalizedScope = normalizeMultilineText(scope)

  if (!normalizedScope || normalizedScope.includes('\n')) {
    return false
  }

  return /^(Scope of Work|Alcance del trabajo)\s*-\s*.+\.?$/i.test(normalizedScope)
}

export function shouldRenderContractScopeText(scope = '', workBreakdown = []) {
  const normalizedScope = normalizeMultilineText(scope)

  if (!normalizedScope) {
    return false
  }

  if (hasContractWorkBreakdown(workBreakdown) && isGeneratedContractScopeText(normalizedScope)) {
    return false
  }

  return true
}

export function buildGeneratedContractPaymentTerms({
  paymentTerms = '',
  total = 0,
  depositAmount = null,
  t = (key) => key,
} = {}) {
  const explicitTerms = normalizeMultilineText(paymentTerms)

  if (explicitTerms) {
    return getPaymentTermLabel(explicitTerms, t)
  }

  const safeTotal = Math.max(toSafeNumber(total), 0)
  const safeDeposit = depositAmount === '' || depositAmount === null || depositAmount === undefined
    ? null
    : Math.max(toSafeNumber(depositAmount), 0)
  const remainingBalance = Math.max(safeTotal - (safeDeposit || 0), 0)

  return [
    t('contractPaymentTermsTotalCost', { total: currency.format(safeTotal) }),
    safeDeposit
      ? t('contractPaymentTermsDownPayment', { deposit: currency.format(safeDeposit) })
      : null,
    t('contractPaymentTermsProgressPayments'),
    t('contractPaymentTermsFinalPayment', { remaining: currency.format(remainingBalance) }),
  ].filter(Boolean).join('\n')
}

export function resolveContractAcceptanceLegalText({
  acceptanceLegalText = '',
  legacyAcceptanceText = '',
  t = (key) => key,
} = {}) {
  const explicitText = normalizeMultilineText(acceptanceLegalText || legacyAcceptanceText)
  return explicitText || t('contractAcceptanceLegalText')
}

export function buildContractNotesAndTermsItems({
  paymentTerms = '',
  total = 0,
  depositAmount = null,
  acceptanceLegalText = '',
  legacyAcceptanceText = '',
  t = (key) => key,
} = {}) {
  const resolvedPaymentTerms = buildGeneratedContractPaymentTerms({
    paymentTerms,
    total,
    depositAmount,
    t,
  })
  const resolvedAcceptanceLegalText = resolveContractAcceptanceLegalText({
    acceptanceLegalText,
    legacyAcceptanceText,
    t,
  })

  return [
    {
      title: t('paymentTerms'),
      content: resolvedPaymentTerms,
    },
    {
      title: t('acceptanceLegalConfirmation'),
      content: resolvedAcceptanceLegalText,
    },
  ].filter((item) => String(item.content || '').trim())
}

export default {
  buildContractNotesAndTermsItems,
  buildContractWorkBreakdownFromEstimate,
  buildGeneratedContractPaymentTerms,
  hasContractWorkBreakdown,
  isGeneratedContractScopeText,
  normalizeContractWorkBreakdown,
  resolveContractAcceptanceLegalText,
  shouldRenderContractScopeText,
  stripLeadingBulletMarker,
  splitContractWorkBreakdownDescription,
}
