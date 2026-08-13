import { en } from './en'
import { es } from './es'

export const translations = { en, es }

export function createTranslator(language) {
  return (key, params = {}) => {
    const dictionary = translations[language] || translations.en
    let value = dictionary?.[key] ?? translations.en?.[key]

    if (value === undefined && key?.includes('.')) {
      value = key.split('.').reduce((current, part) => current?.[part], dictionary)
        ?? key.split('.').reduce((current, part) => current?.[part], translations.en)
    }

    if (value === undefined || value === null || value === '') value = key

    return Object.entries(params).reduce(
      (text, [paramKey, paramValue]) => String(text).replaceAll(`{{${paramKey}}}`, paramValue),
      String(value),
    )
  }
}

export const statusKeyMap = {
  'New Lead': 'newLead', Lead: 'lead', Contacted: 'contacted', 'Estimate Sent': 'estimateSent', 'Contract Sent': 'contractSent', 'Invoice Sent': 'invoiceSent', Won: 'won', Scheduled: 'scheduled', 'In Progress': 'inProgress', 'Waiting on Client': 'waitingOnClient', 'Waiting on Materials': 'waitingOnMaterials', 'Ready for Final Walkthrough': 'readyForFinalWalkthrough', Completed: 'completed', Paid: 'paidStatus', Signed: 'signed', 'Contract Draft': 'contractDraft', High: 'priorityHigh', Medium: 'priorityMedium', Low: 'priorityLow', Complete: 'completed', Upcoming: 'upcoming', Pending: 'pending', Draft: 'draft', Available: 'available', Due: 'due', 'Needs Review': 'needsReview', 'Final Balance Due': 'finalBalanceDue', 'Paid in Full': 'paidInFull', 'Progress Payment Paid': 'progressPaymentPaid', 'Deposit Paid': 'depositPaidStatus', 'Not Paid': 'notPaid', 'Not Signed': 'notSigned', 'Not generated': 'notGenerated', Approved: 'approved', Rejected: 'rejected', Sent: 'sent', 'Converted to Contract': 'convertedToContract', Overdue: 'overdue', Canceled: 'canceled', 'Site Visit': 'siteVisit', 'Project Start': 'projectStart', 'Payment Due': 'paymentDue', 'Material Delivery': 'materialDelivery', Inspection: 'inspection', 'Final Walkthrough': 'finalWalkthrough', Other: 'other', Archived: 'archived', 'Partially Paid': 'partiallyPaid'
}

export function tStatus(t, status) {
  return t(statusKeyMap[status] || status)
}

export function auditTranslations() {
  const englishKeys = Object.keys(en)
  const spanishKeys = Object.keys(es)
  const missingSpanish = englishKeys.filter((key) => !(key in es))
  const missingEnglish = spanishKeys.filter((key) => !(key in en))
  const untranslatedSpanish = spanishKeys.filter((key) => es[key] === en[key] && !['brandInitials', 'brandName', 'appName', 'userInitials'].includes(key))
  const emptyValues = [...new Set([...englishKeys, ...spanishKeys])].filter((key) => !en[key] || !es[key])
  const total = new Set([...englishKeys, ...spanishKeys]).size || 1
  return {
    englishCount: englishKeys.length,
    spanishCount: spanishKeys.length,
    missingSpanish,
    missingEnglish,
    untranslatedSpanish,
    emptyValues,
    fallbackUsage: missingSpanish,
    duplicateKeys: [],
    englishCoverage: Math.round((englishKeys.length / total) * 100),
    spanishCoverage: Math.round(((englishKeys.length - missingSpanish.length) / englishKeys.length) * 100),
  }
}
