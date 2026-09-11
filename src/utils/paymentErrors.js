function readErrorField(error, key) {
  if (error && error[key] !== undefined && error[key] !== null) return error[key]
  if (error?.raw && error.raw[key] !== undefined && error.raw[key] !== null) return error.raw[key]
  return ''
}

function errorText(error = {}) {
  return [
    readErrorField(error, 'message'),
    readErrorField(error, 'details'),
    readErrorField(error, 'hint'),
    readErrorField(error, 'constraint'),
  ].filter(Boolean).join(' ').toLowerCase()
}

export function classifyPaymentPersistenceError(error = {}) {
  const code = String(readErrorField(error, 'code') || '').toLowerCase()
  const status = Number(readErrorField(error, 'status'))
  const text = errorText(error)

  if (code === '23505' || (status === 409 && (text.includes('duplicate') || text.includes('unique')))) {
    return 'duplicate'
  }

  if (code === '23503' || text.includes('foreign key') || text.includes('_fkey') || text.includes('violates foreign')) {
    return 'relationship'
  }

  if (code === '23502' || text.includes('not-null') || text.includes('not null')) {
    return 'required'
  }

  if (code === '23514' || text.includes('check constraint') || text.includes('invalid input value') || text.includes('invalid payment')) {
    return 'invalidValue'
  }

  return 'unknown'
}

export function getPaymentPersistenceErrorMessage(t, error = {}) {
  const messageKey = {
    duplicate: 'paymentDuplicate',
    relationship: 'paymentProjectLinkFailed',
    required: 'paymentRequiredInformation',
    invalidValue: 'paymentInvalidValue',
    unknown: 'paymentSaveFailed',
  }[classifyPaymentPersistenceError(error)]

  return t(messageKey)
}

export function logPaymentPersistenceError(error, { operation = 'save' } = {}) {
  if (!import.meta.env?.DEV) return

  // Keep diagnostics useful without logging payment notes or full payloads.
  // eslint-disable-next-line no-console
  console.error(`[dev] Payment ${operation} failed.`, {
    operation,
    code: readErrorField(error, 'code') || null,
    status: readErrorField(error, 'status') || null,
    constraint: readErrorField(error, 'constraint') || null,
    message: readErrorField(error, 'message') || null,
    details: readErrorField(error, 'details') || null,
    hint: readErrorField(error, 'hint') || null,
  })
}
