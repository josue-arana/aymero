import { useEffect } from 'react'
import { USE_SUPABASE_CLIENTS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import { getClientsContractorId } from '../services/system/clientsRuntimeService'
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

export function useClientsBootstrap(setCustomClients, onStatusChange) {
  const { contractor, company, contractorAccess, session } = useAuth()
  const contractorId = getClientsContractorId({ contractor, company, session })

  useEffect(() => {
    let isCancelled = false

    if (!USE_SUPABASE_CLIENTS || contractorAccess?.membershipStatus !== 'active' || !contractorId) {
      return undefined
    }

    async function loadClients() {
      onStatusChange?.(COLLECTION_STATUS.LOADING)
      const response = await dataProvider.clients.list({ contractorId, includeArchived: true })

      if (isCancelled) return

      if (response?.error) {
        warnDev('[dev] Failed to load clients from Supabase during bootstrap.', response.error)
        onStatusChange?.(COLLECTION_STATUS.LOADED)
        return
      }

      setCustomClients(Array.isArray(response?.data) ? response.data : [])
      onStatusChange?.(COLLECTION_STATUS.LOADED)
    }

    loadClients()

    return () => {
      isCancelled = true
    }
  }, [contractorAccess?.membershipStatus, contractorId, onStatusChange, setCustomClients])
}

export default useClientsBootstrap
