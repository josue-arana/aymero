import { USE_SUPABASE_SETTINGS } from '../../config/backendConfig'
import { normalizeBrandColor } from '../../data/brandColors'
import { createDefaultCompanySettings } from '../../data/defaultCompanySettings'
import { supabaseClient } from '../../lib/supabaseClient'
import { serializeAcceptedPaymentMethods } from '../../utils/acceptedPaymentMethods'

const TABLE_NAME = 'company_settings'
const settingsRuntimeState = {
  loadStatus: 'idle',
  saveStatus: 'idle',
  lastError: null,
}

function isDev() {
  return Boolean(import.meta.env.DEV)
}

function warnDev(message, meta) {
  if (!isDev()) return

  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.warn(message)
    return
  }

  // eslint-disable-next-line no-console
  console.warn(message, meta)
}

function createSkippedResponse(message, data = null) {
  return {
    data,
    error: null,
    skipped: true,
    message,
  }
}

function createErrorResult(message, details = null, code = null) {
  return {
    data: null,
    error: {
      message,
      code,
      details,
      status: null,
    },
    skipped: false,
  }
}

function createAnalyticsModeSetupError(error) {
  return {
    message: 'Analytics Mode is not set up in Supabase. Run the company_settings analytics_mode migration.',
    details: error?.details || error?.raw?.details || error?.raw || null,
    code: 'ANALYTICS_MODE_COLUMN_MISSING',
    status: error?.status || null,
  }
}

function normalizeError(error, fallbackMessage) {
  if (extractMissingColumnName(error) === 'analytics_mode') {
    return createAnalyticsModeSetupError(error)
  }

  if (error?.status === 403) {
    return {
      message: 'Company settings access is blocked for this contractor profile. Check contractor membership and Supabase RLS policies.',
      details: error?.details || null,
      code: error?.code || 'SETTINGS_PERMISSION_DENIED',
      status: error?.status || null,
    }
  }

  return {
    message: error?.message || fallbackMessage,
    details: error?.details || null,
    code: error?.code || null,
    status: error?.status || null,
  }
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function normalizeSettings(settings = {}) {
  return createDefaultCompanySettings(settings)
}

function extractMissingColumnName(error) {
  const message = [
    error?.message,
    error?.details,
    error?.raw?.message,
    error?.raw?.details,
    error?.raw?.hint,
  ]
    .filter(Boolean)
    .join(' ')

  const quotedColumnMatch = message.match(/'([^']+)' column/)
  if (quotedColumnMatch?.[1]) {
    return quotedColumnMatch[1]
  }

  const alternateColumnMatch = message.match(/column ['"]?([^'" ]+)['"]?/)
  if (alternateColumnMatch?.[1]) {
    return alternateColumnMatch[1]
  }

  return null
}

function setSettingsRuntimeStatus(operation, status, error = null) {
  if (operation === 'load') {
    settingsRuntimeState.loadStatus = status
  }

  if (operation === 'save') {
    settingsRuntimeState.saveStatus = status
  }

  settingsRuntimeState.lastError = error
}

function toAppSettings(row) {
  const defaults = createDefaultCompanySettings()
  const analyticsMode = typeof row?.analytics_mode === 'boolean'
    ? row.analytics_mode
    : (typeof row?.simple_mode === 'boolean' ? !row.simple_mode : defaults.analyticsMode)

  return normalizeSettings({
    id: row?.id || undefined,
    contractorId: row?.contractor_id || undefined,
    appLanguage: row?.contractor_app_language || defaults.appLanguage,
    analyticsMode,
    simpleMode: !analyticsMode,
    company: {
      name: row?.company_name || defaults.company.name,
      ownerName: row?.owner_name || defaults.company.ownerName,
      phone: row?.phone || '',
      email: row?.email || defaults.company.email,
      address: row?.business_address || '',
      website: row?.website || '',
      licenseNumber: row?.license_number || '',
      logo: row?.logo_file_path || defaults.company.logo,
      primaryColor: normalizeBrandColor(
        row?.primary_brand_color,
        defaults.company.primaryColor
      ),
      acceptedPaymentMethods: row?.accepted_payment_methods ?? defaults.company.acceptedPaymentMethods,
    },
    defaults: {
      paymentTerms: row?.default_payment_terms || defaults.defaults.paymentTerms,
      taxRate: Number(row?.default_tax_rate ?? defaults.defaults.taxRate),
      estimateExpirationDays: Number(row?.default_estimate_expiration_days ?? defaults.defaults.estimateExpirationDays),
      currency: row?.default_currency || defaults.defaults.currency,
      depositPercentage: Number(row?.default_deposit_percentage ?? defaults.defaults.depositPercentage),
      invoiceDueDays: Number(row?.default_invoice_due_days ?? defaults.defaults.invoiceDueDays),
      materialsIncluded: row?.default_materials_included ?? defaults.defaults.materialsIncluded,
    },
    portal: {
      defaultLanguage: row?.customer_portal_language || defaults.portal.defaultLanguage,
      showPayments: row?.show_payments_in_portal ?? defaults.portal.showPayments,
      showPhotos: row?.show_photos_in_portal ?? defaults.portal.showPhotos,
      showDocuments: row?.show_documents_in_portal ?? defaults.portal.showDocuments,
    },
    onboarding: {
      completed: row?.onboarding_completed ?? defaults.onboarding.completed,
      dismissed: row?.onboarding_dismissed ?? defaults.onboarding.dismissed,
      step: Number(row?.onboarding_step ?? defaults.onboarding.step),
    },
    sampleWorkspace: {
      ...defaults.sampleWorkspace,
      ...(row?.sample_workspace && typeof row.sample_workspace === 'object' ? row.sample_workspace : {}),
      records: row?.sample_workspace?.records && typeof row.sample_workspace.records === 'object'
        ? row.sample_workspace.records
        : {},
    },
  })
}

function toSupabasePayload(contractorId, settings = {}) {
  const normalized = normalizeSettings(settings)

  return {
    contractor_id: contractorId,
    company_name: normalized.company.name || null,
    owner_name: normalized.company.ownerName || null,
    phone: normalized.company.phone || null,
    email: normalized.company.email || null,
    business_address: normalized.company.address || null,
    website: normalized.company.website || null,
    license_number: normalized.company.licenseNumber || null,
    logo_file_path: normalized.company.logo || null,
    primary_brand_color: normalizeBrandColor(normalized.company.primaryColor),
    accepted_payment_methods: serializeAcceptedPaymentMethods(normalized.company.acceptedPaymentMethods),
    default_payment_terms: normalized.defaults.paymentTerms || null,
    default_tax_rate: Number(normalized.defaults.taxRate ?? 0),
    default_estimate_expiration_days: Number(normalized.defaults.estimateExpirationDays ?? 30),
    default_currency: normalized.defaults.currency || 'USD',
    default_deposit_percentage: Number(normalized.defaults.depositPercentage ?? 0),
    default_invoice_due_days: Number(normalized.defaults.invoiceDueDays ?? 14),
    default_materials_included: Boolean(normalized.defaults.materialsIncluded),
    contractor_app_language: normalized.appLanguage || 'en',
    analytics_mode: Boolean(normalized.analyticsMode),
    customer_portal_language: normalized.portal.defaultLanguage || 'en',
    show_payments_in_portal: Boolean(normalized.portal.showPayments),
    show_photos_in_portal: Boolean(normalized.portal.showPhotos),
    show_documents_in_portal: Boolean(normalized.portal.showDocuments),
    onboarding_completed: Boolean(normalized.onboarding.completed),
    onboarding_dismissed: Boolean(normalized.onboarding.dismissed),
    onboarding_step: Math.min(5, Math.max(1, Number(normalized.onboarding.step) || 1)),
    sample_workspace: normalized.sampleWorkspace || {},
  }
}

async function requestSettingsMutation(method, contractorId, settings = {}, query) {
  const payload = toSupabasePayload(contractorId, settings)

  return supabaseClient.request(TABLE_NAME, {
    method,
    query,
    body: payload,
  })
}

async function findSettingsRow(contractorId) {
  const data = await supabaseClient.request(TABLE_NAME, {
    method: 'GET',
    query: {
      select: '*',
      contractor_id: `eq.${contractorId}`,
      limit: '1',
    },
  })

  return readSingleRow(data)
}

async function createDefaultSettingsRecord(contractorId, seedSettings = {}) {
  const data = await requestSettingsMutation('POST', contractorId, createDefaultCompanySettings({
    ...seedSettings,
    onboarding: {
      completed: seedSettings?.onboarding?.completed ?? true,
      dismissed: seedSettings?.onboarding?.dismissed ?? false,
      step: seedSettings?.onboarding?.step ?? 5,
    },
  }))

  return readSingleRow(data)
}

function handleMissingContractorId(methodName) {
  warnDev(`[dev] settingsSupabaseService.${methodName} called without contractorId`)

  return createErrorResult(
    'Your account is not connected to a contractor profile yet.',
    {
      methodName,
      reason: 'No contractorId was provided to the Settings Supabase service.',
    },
    'MISSING_CONTRACTOR_ID'
  )
}

export async function getSettings(contractorId) {
  if (!USE_SUPABASE_SETTINGS) {
    return createSkippedResponse('Supabase settings service skipped because USE_SUPABASE_SETTINGS=false')
  }

  if (!contractorId) {
    setSettingsRuntimeStatus('load', 'error', {
      message: 'Your account is not connected to a contractor profile yet.',
      code: 'MISSING_CONTRACTOR_ID',
      details: null,
      status: null,
    })
    return handleMissingContractorId('getSettings')
  }

  try {
    setSettingsRuntimeStatus('load', 'loading')
    let row = await findSettingsRow(contractorId)

    if (!row) {
      warnDev('[dev] company_settings record missing; creating a default settings record.', { contractorId })
      row = await createDefaultSettingsRecord(contractorId)
    }

    setSettingsRuntimeStatus('load', 'success', null)
    return {
      data: toAppSettings(row),
      error: null,
      skipped: false,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to load company settings from Supabase.')
    setSettingsRuntimeStatus('load', 'error', normalizedError)
    return {
      data: null,
      error: normalizedError,
      skipped: false,
    }
  }
}

export async function updateSettings(contractorId, settings) {
  if (!USE_SUPABASE_SETTINGS) {
    return createSkippedResponse('Supabase settings service skipped because USE_SUPABASE_SETTINGS=false', settings ?? null)
  }

  if (!contractorId) {
    setSettingsRuntimeStatus('save', 'error', {
      message: 'Your account is not connected to a contractor profile yet.',
      code: 'MISSING_CONTRACTOR_ID',
      details: null,
      status: null,
    })
    return handleMissingContractorId('updateSettings')
  }

  try {
    setSettingsRuntimeStatus('save', 'saving')
    const existingRow = await findSettingsRow(contractorId)

    if (!existingRow) {
      warnDev('[dev] company_settings record missing during update; creating a default settings record first.', { contractorId })
      const createdRow = await createDefaultSettingsRecord(contractorId, settings)

      setSettingsRuntimeStatus('save', 'success', null)
      return {
        data: toAppSettings(createdRow),
        error: null,
        skipped: false,
      }
    }

    const data = await requestSettingsMutation('PATCH', contractorId, settings, {
      contractor_id: `eq.${contractorId}`,
    })
    const updatedRow = readSingleRow(data)

    if (!updatedRow) {
      throw Object.assign(new Error('The company settings update did not return an updated row.'), {
        code: 'SETTINGS_UPDATE_NO_ROWS',
        details: { contractorId },
      })
    }

    setSettingsRuntimeStatus('save', 'success', null)
    return {
      data: toAppSettings(updatedRow),
      error: null,
      skipped: false,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to update company settings in Supabase.')
    setSettingsRuntimeStatus('save', 'error', normalizedError)
    return {
      data: null,
      error: normalizedError,
      skipped: false,
    }
  }
}

export function getSettingsRuntimeStatus() {
  return {
    ...settingsRuntimeState,
  }
}

export default {
  getSettings,
  updateSettings,
  getSettingsRuntimeStatus,
}
