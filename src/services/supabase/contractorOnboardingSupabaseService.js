import { USE_AUTH } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'

const CONTRACTOR_ONBOARDING_RPC = 'rpc/complete_beta_contractor_onboarding'

const onboardingRuntimeState = {
  status: 'idle',
  lastError: null,
}

function createSkippedResponse(message, data = null) {
  return {
    data,
    error: null,
    skipped: true,
    message,
  }
}

function readSingleRow(data) {
  return Array.isArray(data) ? data[0] ?? null : data ?? null
}

function normalizeError(error, fallbackMessage) {
  const technicalMessage = error?.message || fallbackMessage

  if (error?.status === 403) {
    return {
      message: fallbackMessage,
      technicalMessage: 'Automatic beta onboarding is blocked by Supabase permissions. Check the onboarding RPC and grants.',
      details: error?.details || null,
      code: error?.code || 'ONBOARDING_PERMISSION_DENIED',
      status: error?.status || null,
    }
  }

  return {
    message: fallbackMessage,
    technicalMessage,
    details: error?.details || null,
    code: error?.code || null,
    status: error?.status || null,
  }
}

function setOnboardingRuntimeStatus(status, error = null) {
  onboardingRuntimeState.status = status
  onboardingRuntimeState.lastError = error
}

export async function completeBetaContractorOnboarding({
  companyName,
  ownerName,
  phone,
  businessEmail,
  businessAddress,
} = {}) {
  if (!USE_AUTH) {
    return createSkippedResponse('Contractor onboarding skipped because USE_AUTH=false')
  }

  try {
    setOnboardingRuntimeStatus('submitting')
    const data = await supabaseClient.request(CONTRACTOR_ONBOARDING_RPC, {
      method: 'POST',
      body: {
        company_name_input: companyName || '',
        owner_name_input: ownerName || '',
        phone_input: phone || null,
        business_email_input: businessEmail || null,
        business_address_input: businessAddress || null,
      },
    })

    const row = readSingleRow(data)
    setOnboardingRuntimeStatus('success', null)

    return {
      data: {
        contractorId: row?.contractor_id || '',
        membershipId: row?.membership_id || '',
        settingsId: row?.settings_id || '',
        companyName: row?.company_name || companyName || '',
        ownerName: row?.owner_name || ownerName || '',
        phone: row?.phone || phone || '',
        businessEmail: row?.business_email || businessEmail || '',
        businessAddress: row?.business_address || businessAddress || '',
        onboardingCompleted: Boolean(row?.onboarding_completed),
        existingMembership: Boolean(row?.existing_membership),
      },
      error: null,
      skipped: false,
    }
  } catch (error) {
    const normalizedError = normalizeError(error, 'Unable to complete contractor onboarding.')
    setOnboardingRuntimeStatus('error', normalizedError)

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error('[dev] Contractor onboarding failed.', normalizedError)
    }

    return {
      data: null,
      error: normalizedError,
      skipped: false,
    }
  }
}

export function getContractorOnboardingRuntimeStatus() {
  return {
    ...onboardingRuntimeState,
  }
}

export default {
  completeBetaContractorOnboarding,
  getContractorOnboardingRuntimeStatus,
}
