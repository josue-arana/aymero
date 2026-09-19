import { useEffect } from 'react'
import { USE_SUPABASE_LEADS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import { getLeadsContractorId } from '../services/system/leadsRuntimeService'
import { COLLECTION_STATUS } from '../utils/collectionLoading'

function warnDev(message, meta) {
  if (!import.meta.env.DEV) return

  if (meta === undefined) {
    // eslint-disable-next-line no-console
    console.warn(message)
    return
  }

  // eslint-disable-next-line no-console
  console.warn(message, meta)
}

export function useLeadsBootstrap(setLeads, onStatusChange) {
  const { contractor, company, contractorAccess, session } = useAuth()
  const contractorId = getLeadsContractorId({ contractor, company, session })

  useEffect(() => {
    let isCancelled = false

    if (!USE_SUPABASE_LEADS || contractorAccess?.membershipStatus !== 'active' || !contractorId) {
      return undefined
    }

    async function loadLeads() {
      onStatusChange?.(COLLECTION_STATUS.LOADING)
      const response = await dataProvider.leads.list({ contractorId, includeArchived: true })

      if (isCancelled) return

      if (response?.error) {
        warnDev('[dev] Failed to load leads from Supabase during bootstrap.', response.error)
        onStatusChange?.(COLLECTION_STATUS.LOADED)
        return
      }

      setLeads(Array.isArray(response?.data) ? response.data : [])
      onStatusChange?.(COLLECTION_STATUS.LOADED)
    }

    loadLeads()

    return () => {
      isCancelled = true
    }
  }, [contractorAccess?.membershipStatus, contractorId, onStatusChange, setLeads])
}

export default useLeadsBootstrap
