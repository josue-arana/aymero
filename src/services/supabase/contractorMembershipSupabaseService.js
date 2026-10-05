import { USE_AUTH } from '../../config/backendConfig'
import { supabaseClient } from '../../lib/supabaseClient'
import { normalizeSupportedLanguage } from '../../utils/language'

const MEMBERS_TABLE = 'contractor_members'
const CONTRACTORS_TABLE = 'contractors'

function createSkippedResponse(message, data = null) {
  return {
    data,
    error: null,
    skipped: true,
    message,
  }
}

function normalizeError(error, fallbackMessage) {
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

export async function resolveAuthenticatedContractorAccess(userId) {
  if (!USE_AUTH) {
    return createSkippedResponse('Contractor membership lookup skipped because USE_AUTH=false')
  }

  if (!userId) {
    return {
      data: null,
      error: {
        message: 'A user id is required to resolve contractor membership.',
        details: null,
        code: 'MISSING_USER_ID',
        status: null,
      },
      skipped: false,
    }
  }

  try {
    const memberships = await supabaseClient.request(MEMBERS_TABLE, {
      method: 'GET',
      query: {
        select: 'id, contractor_id, role, status, name, email, preferred_language, joined_at, created_at',
        user_id: `eq.${userId}`,
        archived_at: 'is.null',
        status: 'eq.active',
        order: 'created_at.asc',
        limit: '2',
      },
    })

    if (!Array.isArray(memberships) || memberships.length === 0) {
      return {
        data: {
          contractorId: '',
          membership: null,
          contractor: null,
          membershipStatus: 'missing',
          requiresSetup: true,
        },
        error: null,
        skipped: false,
      }
    }

    if (memberships.length > 1) {
      return {
        data: {
          contractorId: '',
          membership: null,
          contractor: null,
          membershipStatus: 'multiple',
          requiresSetup: true,
        },
        error: {
          message: 'Your account is linked to multiple contractor profiles. Contact support to finish setup.',
          details: {
            userId,
            membershipCount: memberships.length,
          },
          code: 'MULTIPLE_CONTRACTOR_MEMBERSHIPS',
          status: null,
        },
        skipped: false,
      }
    }

    const membership = memberships[0]
    const contractorId = membership?.contractor_id || ''

    if (!contractorId) {
      return {
        data: {
          contractorId: '',
          membership: null,
          contractor: null,
          membershipStatus: 'missing',
          requiresSetup: true,
        },
        error: {
          message: 'Your account is not connected to a contractor profile yet.',
          details: {
            userId,
            membershipId: membership?.id || null,
          },
          code: 'CONTRACTOR_MEMBERSHIP_MISSING_CONTRACTOR_ID',
          status: null,
        },
        skipped: false,
      }
    }

    const contractorRow = await supabaseClient.request(CONTRACTORS_TABLE, {
      method: 'GET',
      query: {
        select: 'id, company_name, owner_name, phone, email, business_address, website, license_number, logo_file_path',
        id: `eq.${contractorId}`,
        archived_at: 'is.null',
        limit: '1',
      },
    })

    const contractor = readSingleRow(contractorRow)
    if (!contractor) {
      return {
        data: {
          contractorId: '',
          membership: null,
          contractor: null,
          membershipStatus: 'error',
          requiresSetup: true,
        },
        error: {
          message: 'Your contractor workspace could not be found. Retry setup or contact support.',
          details: {
            userId,
            contractorId,
            membershipId: membership?.id || null,
          },
          code: 'CONTRACTOR_PROFILE_MISSING',
          status: null,
        },
        skipped: false,
      }
    }

    return {
      data: {
        contractorId,
        membership,
        contractor,
        membershipStatus: 'active',
        requiresSetup: false,
      },
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to resolve contractor membership for the authenticated user.'),
      skipped: false,
    }
  }
}

export async function updateAuthenticatedPreferredLanguage(userId, preferredLanguage) {
  if (!USE_AUTH) {
    return createSkippedResponse('Contractor membership language update skipped because USE_AUTH=false')
  }

  if (!userId) {
    return {
      data: null,
      error: {
        message: 'A user id is required to update the preferred language.',
        details: null,
        code: 'MISSING_USER_ID',
        status: null,
      },
      skipped: false,
    }
  }

  try {
    const memberships = await supabaseClient.request(MEMBERS_TABLE, {
      method: 'PATCH',
      query: {
        select: 'id, contractor_id, role, status, name, email, preferred_language, joined_at, created_at',
        user_id: `eq.${userId}`,
        archived_at: 'is.null',
        status: 'eq.active',
      },
      body: {
        preferred_language: normalizeSupportedLanguage(preferredLanguage, 'en'),
      },
    })

    return {
      data: readSingleRow(memberships),
      error: null,
      skipped: false,
    }
  } catch (error) {
    return {
      data: null,
      error: normalizeError(error, 'Unable to update the preferred language for the authenticated user.'),
      skipped: false,
    }
  }
}

export default {
  resolveAuthenticatedContractorAccess,
  updateAuthenticatedPreferredLanguage,
}
