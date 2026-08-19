import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Archive, DollarSign, MoreVertical, Plus, Search, Trash2, Undo2, UserCheck, Users, WalletCards } from 'lucide-react'
import { MetricCard } from '../components/ui/MetricCard'
import { StatusBadge } from '../components/ui/StatusBadge'
import { FilterChip } from '../components/ui/FilterChip'
import { useToast } from '../components/common/ToastProvider'
import { currency } from '../utils/formatters'
import { archiveMenuItemClasses } from '../utils/buttonStyles'
import { buildClientProfiles } from '../utils/clients'
import { ClientFormModal } from '../components/clients/ClientFormModal'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import { ActionMenu } from '../components/common/ActionMenu'
import { useAuth } from '../contexts/AuthContext'
import { useAnalyticsMode } from '../contexts/SimpleModeContext'
import dataProvider from '../services/dataProvider'
import { getClientsContractorId } from '../services/system/clientsRuntimeService'
import clientsHeroBackground from '../assets/page-heroes/clients-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'

const clientFilters = ['Active', 'Archived']

function isClientArchived(client, archivedClientIds = []) {
  return Boolean(
    client?.isArchived
      || client?.archivedAt
      || client?.archived_at
      || archivedClientIds.includes(client?.id)
  )
}

export function ClientsPage({ leads, customClients = [], archivedClientIds = [], onOpenClient, onCreateClient, onArchiveClient, onRestoreClient, onDeleteClient, language = 'en', t }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedFilter, setSelectedFilter] = useState('Active')
  const [isCreateOpen, setIsCreateOpen] = useState(false)
  const [confirmAction, setConfirmAction] = useState(null)
  const [activeClientActionId, setActiveClientActionId] = useState('')
  const clientActionGuardRef = useRef(false)
  const { showToast } = useToast()
  const { contractor, company, session } = useAuth()
  const { isAnalyticsMode } = useAnalyticsMode()
  const contractorId = getClientsContractorId({ contractor, company, session })

  useEffect(() => {
    if (!location.state?.createClient) return
    setIsCreateOpen(true)
    navigate(location.pathname, { replace: true, state: {} })
  }, [location.pathname, location.state, navigate])
  const clients = useMemo(() => buildClientProfiles(leads, customClients), [leads, customClients])
  const activeClientsList = useMemo(() => clients.filter((client) => !isClientArchived(client, archivedClientIds)), [clients, archivedClientIds])

  const filteredClients = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()
    return clients.filter((client) => {
      const archived = isClientArchived(client, archivedClientIds)
      const matchesArchive = selectedFilter === 'Archived' ? archived : !archived
      const matchesSearch = !term || [client.name, client.phone, client.email, client.address]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term))
      return matchesArchive && matchesSearch
    })
  }, [clients, archivedClientIds, searchTerm, selectedFilter])

  const activeClients = activeClientsList.filter((client) => client.projects.some((project) => !['Completed', 'Paid'].includes(project.projectStatus))).length
  const repeatClients = activeClientsList.filter((client) => client.repeatClient || client.projectCount > 1).length
  const outstandingBalance = activeClientsList.reduce((sum, client) => sum + client.outstandingBalance, 0)

  const summaryCards = [
    { label: t('totalClients'), value: activeClientsList.length, helper: t('totalClientsHelper'), icon: Users },
    { label: t('activeClients'), value: activeClients, helper: t('activeClientsHelper'), icon: UserCheck },
    { label: t('repeatClients'), value: repeatClients, helper: t('repeatClientsHelper'), icon: WalletCards },
    { label: t('outstandingBalance'), value: currency.format(outstandingBalance), helper: t('clientsOutstandingBalanceHelper'), icon: DollarSign },
  ]

  function confirmArchive(client) {
    setConfirmAction({ mode: 'archive', client })
  }

  function confirmDelete(client) {
    setConfirmAction({ mode: 'delete', client })
  }

  async function runSingleFlightClientAction(clientId, task) {
    if (clientActionGuardRef.current) {
      return false
    }

    clientActionGuardRef.current = true
    setActiveClientActionId(clientId)

    try {
      const result = await task()
      return result ?? true
    } finally {
      clientActionGuardRef.current = false
      setActiveClientActionId('')
    }
  }

  async function runConfirmAction() {
    if (!confirmAction) return
    await runSingleFlightClientAction(confirmAction.client.id, async () => {
      try {
        if (confirmAction.mode === 'archive') {
          const response = await dataProvider.clients.archive(confirmAction.client.id, { contractorId })
          if (response?.error) {
            showToast(response.error.message || t('archiveFailed'), 'error')
            return false
          }
          onArchiveClient(confirmAction.client.id, response?.data)
        }
        if (confirmAction.mode === 'delete') {
          const response = await dataProvider.clients.deletePermanently(confirmAction.client.id, { contractorId })
          if (response?.error) {
            showToast(response.error.message || t('deleteFailed'), 'error')
            return false
          }
          onDeleteClient(confirmAction.client.id)
        }
      } catch (err) {
        showToast(err?.message || (confirmAction?.mode === 'delete' ? t('deleteFailed') : t('archiveFailed')), 'error')
        return false
      } finally {
        setConfirmAction(null)
      }
      return true
    })
  }

  function openClientProfile(clientId) {
    onOpenClient(clientId)
  }

  function handleClientCardKeyDown(event, clientId) {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      openClientProfile(clientId)
    }
  }

  async function restoreClient(clientId) {
    await runSingleFlightClientAction(clientId, async () => {
      try {
        const response = await dataProvider.clients.restore(clientId, { contractorId })
        if (response?.error) {
          showToast(response.error.message || t('restoreFailed'), 'error')
          return false
        }
        onRestoreClient(clientId, response?.data)
      } catch (err) {
        showToast(err?.message || t('restoreFailed'), 'error')
        return false
      }
      return true
    })
  }

  function renderClientActions(client, compact = false) {
    const archived = isClientArchived(client, archivedClientIds)
    const isClientActionPending = activeClientActionId === client.id
    const moreMenuItems = archived
      ? [
          {
            id: 'restore-client',
            label: t('restore'),
            icon: <Undo2 className="mr-2 h-4 w-4" />,
            disabled: isClientActionPending,
            onClick: () => restoreClient(client.id),
          },
          {
            id: 'delete-client',
            label: t('deletePermanently'),
            icon: <Trash2 className="mr-2 h-4 w-4" />,
            disabled: isClientActionPending,
            onClick: () => confirmDelete(client),
            className: 'flex w-full items-center rounded-xl px-3 py-2 text-left text-sm font-semibold text-red-700 hover:bg-red-50',
          },
        ]
      : [
          {
            id: 'archive-client',
            label: t('archive'),
            icon: <Archive className="mr-2 h-4 w-4" />,
            disabled: isClientActionPending,
            onClick: () => confirmArchive(client),
            className: archiveMenuItemClasses,
          },
        ]

    const actionLayoutClasses = compact ? 'grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2' : 'flex items-center justify-end gap-2'

    const moreButtonClasses = compact
      ? 'inline-flex min-h-[44px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'
      : 'inline-flex min-h-[40px] items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-800 transition hover:bg-slate-50'

    if (archived) {
      return (
        <div className={actionLayoutClasses}>
          <button
            disabled={isClientActionPending}
            onClick={(event) => {
              event.stopPropagation()
              openClientProfile(client.id)
            }}
            className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
          >
            {t('viewClient')}
          </button>
          <ActionMenu
            label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
            ariaLabel={t('more')}
            showChevron={!compact}
            buttonClassName={moreButtonClasses}
            items={moreMenuItems}
            buttonDisabled={isClientActionPending}
          />
        </div>
      )
    }

    return (
      <div className={actionLayoutClasses}>
        <button
          disabled={isClientActionPending}
          onClick={(event) => {
            event.stopPropagation()
            openClientProfile(client.id)
          }}
          className="inline-flex min-h-[44px] items-center justify-center rounded-xl bg-slate-950 px-3 py-2 text-xs font-bold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-600"
        >
          {t('viewClient')}
        </button>
        <ActionMenu
          label={compact ? <MoreVertical className="h-4 w-4" /> : t('more')}
          ariaLabel={t('more')}
          showChevron={!compact}
          buttonClassName={moreButtonClasses}
          items={moreMenuItems}
          buttonDisabled={isClientActionPending}
        />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-6 text-white shadow-xl" style={buildHeroBackgroundStyle(clientsHeroBackground, 'rgba(2, 6, 23, 0.82)', 'rgba(15, 23, 42, 0.35)', '72% center')}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="mb-2 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('clients')}</p>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{t('clientsPageTitle')}</h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-300 sm:text-base">{t('clientsPageHelp')}</p>
          </div>
          <button onClick={() => setIsCreateOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-bold text-slate-950 shadow-sm transition hover:bg-blue-50">
            <Plus className="h-4 w-4" /> {t('createClient')}
          </button>
        </div>
      </section>

      {isAnalyticsMode && (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => <MetricCard key={card.label} {...card} />)}
        </section>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
        <div className="mb-5 flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-950">{selectedFilter === 'Archived' ? t('archivedClients') : t('clientList')}</h2>
            <p className="text-sm text-slate-500">{selectedFilter === 'Archived' ? t('archivedViewHelp') : t('clientListHelp')}</p>
          </div>
          <div className="flex w-full items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 lg:w-96">
            <Search className="h-4 w-4 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400" placeholder={t('searchClientsPlaceholder')} />
          </div>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
          {clientFilters.map((filter) => (
            <FilterChip key={filter} selected={selectedFilter === filter} onClick={() => setSelectedFilter(filter)}>
              {filter === 'Archived' ? t('archived') : t('active')}
            </FilterChip>
          ))}
        </div>

        <div className="hidden overflow-hidden rounded-2xl border border-slate-200 md:block">
          <table className="w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">{t('client')}</th>
                <th className="px-4 py-3">{t('phone')}</th>
                <th className="px-4 py-3">{t('email')}</th>
                <th className="px-4 py-3 text-right">{t('projects')}</th>
                {isAnalyticsMode && <th className="px-4 py-3 text-right">{t('totalProjectValue')}</th>}
                {isAnalyticsMode && <th className="px-4 py-3 text-right">{t('outstandingBalance')}</th>}
                <th className="px-4 py-3">{t('latestStatus')}</th>
                <th className="px-4 py-3 text-right">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredClients.map((client) => (
                <tr
                  key={client.id}
                  onClick={() => openClientProfile(client.id)}
                  onKeyDown={(event) => handleClientCardKeyDown(event, client.id)}
                  tabIndex={0}
                  className="cursor-pointer bg-white transition hover:bg-blue-50/40 focus-visible:bg-blue-50/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
                >
                  <td className="max-w-64 px-4 py-4"><p className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{client.name}</p><p className="break-words text-xs text-slate-500 [overflow-wrap:anywhere]">{client.address}</p></td>
                  <td className="px-4 py-4 font-medium text-slate-700">{client.phone}</td>
                  <td className="max-w-56 break-words px-4 py-4 text-slate-600 [overflow-wrap:anywhere]">{client.email || t('notAdded')}</td>
                  <td className="px-4 py-4 text-right font-bold text-slate-900">{client.projectCount}</td>
                  {isAnalyticsMode && <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(client.totalProjectValue)}</td>}
                  {isAnalyticsMode && <td className="px-4 py-4 text-right font-bold text-slate-900">{currency.format(client.outstandingBalance)}</td>}
                  <td className="px-4 py-4"><div className="flex flex-wrap gap-2">{client.latestProjectStatus ? <StatusBadge status={client.latestProjectStatus} t={t} /> : null}{isClientArchived(client, archivedClientIds) ? <StatusBadge status="Archived" t={t} /> : null}</div></td>
                  <td className="px-4 py-4 text-right">{renderClientActions(client)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 md:hidden">
          {filteredClients.map((client) => (
            <article
              key={client.id}
              role="button"
              tabIndex={0}
              onClick={() => openClientProfile(client.id)}
              onKeyDown={(event) => handleClientCardKeyDown(event, client.id)}
              className="cursor-pointer rounded-3xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-blue-200 hover:bg-blue-50/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500/40"
            >
              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="min-w-0"><h3 className="break-words font-bold text-slate-950 [overflow-wrap:anywhere]">{client.name}</h3><p className="break-words text-sm text-slate-500">{client.phone}</p></div>
                <div className="flex flex-wrap justify-end gap-2">{client.latestProjectStatus ? <StatusBadge status={client.latestProjectStatus} t={t} /> : null}{isClientArchived(client, archivedClientIds) ? <StatusBadge status="Archived" t={t} /> : null}</div>
              </div>
              <div className="min-w-0 space-y-2 text-sm text-slate-600 [overflow-wrap:anywhere]"><p className="break-words">{client.email || t('notAdded')}</p><p className="break-words">{client.address}</p></div>
              <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl bg-slate-50 p-3 text-sm">
                <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('projects')}</p><p className="font-bold text-slate-950">{client.projectCount}</p></div>
                {isAnalyticsMode && <div><p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('balance')}</p><p className="font-bold text-slate-950">{currency.format(client.outstandingBalance)}</p></div>}
              </div>
              <div className="mt-3">{renderClientActions(client, true)}</div>
            </article>
          ))}
        </div>

        {filteredClients.length === 0 && <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center"><p className="font-bold text-slate-900">{t('noClientsFound')}</p><p className="mt-2 text-sm text-slate-500">{t('noClientsFoundHelp')}</p></div>}
      </section>
      <ClientFormModal
        isOpen={isCreateOpen}
        mode="create"
        defaultPreferredLanguage={language}
        onClose={() => setIsCreateOpen(false)}
        onSave={async (client) => {
          let nextClient = client

          try {
            const response = await dataProvider.clients.create(client, { contractorId })
            if (response?.data && !response?.error) {
              nextClient = response.data
            }
          } catch (err) {
            // local mode: ignore errors
          }

          onCreateClient(nextClient)
          setIsCreateOpen(false)
        }}
        t={t}
      />
      <ConfirmRecordModal isOpen={Boolean(confirmAction)} mode={confirmAction?.mode} title={confirmAction?.mode === 'delete' ? t('confirmPermanentDelete') : t('confirmArchive')} message={confirmAction?.mode === 'delete' ? t('permanentDeleteHelp') : t('archiveHelp')} confirmLabel={confirmAction?.mode === 'delete' ? t('deletePermanently') : t('archive')} onCancel={() => setConfirmAction(null)} onConfirm={runConfirmAction} t={t} />
    </div>
  )
}
