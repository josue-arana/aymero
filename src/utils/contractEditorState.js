import {
  buildContractWorkBreakdownFromEstimate,
  buildGeneratedContractPaymentTerms,
  normalizeContractWorkBreakdown,
  resolveContractAcceptanceLegalText,
} from './contractDocument'

function hasStoredContractField(contract = {}, fields = []) {
  return fields.some((field) => Object.prototype.hasOwnProperty.call(contract, field))
}

function readStoredContractField(contract = {}, fields = []) {
  for (const field of fields) {
    if (Object.prototype.hasOwnProperty.call(contract, field)) {
      return contract[field] || ''
    }
  }

  return ''
}

export function buildContractEditorState({ lead = {}, portal = {}, savedContract = {}, estimate = {}, contractTotal = 0, t = (key) => key } = {}) {
  const savedWorkBreakdown = normalizeContractWorkBreakdown(savedContract.workBreakdown || [])
  const estimateWorkBreakdown = buildContractWorkBreakdownFromEstimate(estimate)
  const workBreakdown = savedWorkBreakdown.length > 0
    ? savedWorkBreakdown
    : savedContract?.id
      ? []
      : estimateWorkBreakdown
  const depositAmount = savedContract.depositAmount ?? savedContract.deposit_amount ?? null
  const acceptanceLegalText = resolveContractAcceptanceLegalText({
    acceptanceLegalText: savedContract.acceptanceLegalText,
    legacyAcceptanceText: savedContract.warrantyDisclaimer,
    t,
  })
  const hasSavedScope = hasStoredContractField(savedContract, ['scope', 'scopeOfWork'])
  const hasSavedPaymentTerms = hasStoredContractField(savedContract, ['paymentTerms', 'payment_terms'])

  return {
    title: savedContract.title || savedContract.projectTitle || lead.projectTitle || lead.projectType || estimate.projectTitle || 'Contract',
    scope: hasSavedScope
      ? readStoredContractField(savedContract, ['scope', 'scopeOfWork'])
      : estimate.summary || estimate.scopeOfWork || '',
    workBreakdown,
    paymentTerms: buildGeneratedContractPaymentTerms({
      paymentTerms: hasSavedPaymentTerms
        ? readStoredContractField(savedContract, ['paymentTerms', 'payment_terms'])
        : estimate.paymentTerms || '',
      total: contractTotal,
      depositAmount,
      t,
    }),
    acceptanceLegalText,
    materials: savedContract.materials || t('materialsText'),
    timeline: savedContract.timeline || `${t('timelineTextPrefix')} ${portal.startDate}. ${t('estimatedCompletion')} ${portal.estimatedCompletion}.`,
    changeOrders: savedContract.changeOrders || t('changeOrdersText'),
    clientResponsibilities: savedContract.clientResponsibilities || t('clientResponsibilitiesText'),
    warrantyDisclaimer: savedContract.warrantyDisclaimer || t('warrantyDisclaimerText'),
    depositAmount,
  }
}
