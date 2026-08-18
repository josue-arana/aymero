import { normalizeClientPreferredLanguageFields, readRecordLanguage } from './language.js'

export function getClientSlug(name = '') {
  return String(name)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function findRelatedClient(clients = [], record = {}) {
  const recordClientId = String(record?.clientId || record?.client_id || '').trim()
  const recordClientSlug = getClientSlug(
    record?.client || record?.clientName || record?.customerName || record?.name || record?.displayName || ''
  )

  if (!recordClientId && !recordClientSlug) {
    return null
  }

  return clients.find((client) => {
    const clientId = String(client?.id || '').trim()
    const clientSlug = getClientSlug(client?.name || client?.displayName || clientId)

    return Boolean(
      (recordClientId && clientId && clientId === recordClientId)
      || (recordClientSlug && clientSlug === recordClientSlug)
    )
  }) || null
}

export function buildClientProfiles(leads = [], customClients = []) {
  const clientMap = new Map()
  const slugToClientId = new Map()

  customClients.forEach((client) => {
    const normalizedClient = normalizeClientPreferredLanguageFields(client)
    const id = client.id || getClientSlug(client.name)
    const slug = getClientSlug(client.name || id)
    const archivedAt = client.archivedAt || client.archived_at || null
    const isArchived = Boolean(client.isArchived || archivedAt)
    clientMap.set(id, {
      ...normalizedClient,
      id,
      name: client.name || 'Unknown Client',
      displayName: client.displayName || client.name || 'Unknown Client',
      firstName: client.firstName || client.first_name || '',
      lastName: client.lastName || client.last_name || '',
      phone: client.phone || '(410) 555-0100',
      email: client.email || '',
      address: client.address || 'Address not added',
      preferredLanguage: normalizedClient.preferredLanguage,
      latestProjectStatus: client.latestProjectStatus || 'Lead',
      projectCount: 0,
      totalProjectValue: 0,
      outstandingBalance: 0,
      repeatClient: Boolean(client.repeatClient),
      projects: [],
      notes: client.notes ? [client.notes] : ['Client added manually.'],
      status: client.status || 'active',
      archivedAt,
      archived_at: archivedAt,
      isArchived,
      createdAt: client.createdAt || client.created_at || null,
      updatedAt: client.updatedAt || client.updated_at || null,
      manualClient: true,
    })
    if (slug) slugToClientId.set(slug, id)
  })

  leads.forEach((lead) => {
    const name = lead.client || 'Unknown Client'
    const slug = getClientSlug(name)
    const leadClientId = typeof lead.clientId === 'string' ? lead.clientId.trim() : ''
    const clientKey = leadClientId && clientMap.has(leadClientId)
      ? leadClientId
      : slugToClientId.get(slug) || leadClientId || slug
    const existing = clientMap.get(clientKey)
    const contractAmount = lead.portal?.contractAmount || lead.value || 0
    const paid = lead.portal?.amountPaid || 0
    const balance = lead.portal?.outstandingBalance ?? Math.max(contractAmount - paid, 0)

    const projectRecord = {
      ...lead,
      isProjectRecord: Boolean(lead.projectId || lead.project_id),
      projectValue: contractAmount,
      amountPaid: paid,
      outstandingBalance: balance,
      latestStatus: lead.projectStatus || lead.status,
    }

    if (existing) {
      existing.projects.push(projectRecord)
      existing.projectCount += 1
      existing.totalProjectValue += contractAmount
      existing.outstandingBalance += balance
      existing.repeatClient = existing.repeatClient || existing.projectCount > 1 || lead.source === 'Repeat Client'
      existing.latestProjectStatus = projectRecord.latestStatus || existing.latestProjectStatus
      if (!existing.phone && lead.phone) existing.phone = lead.phone
      if (!existing.email && lead.email) existing.email = lead.email
      if (!existing.address && lead.address) existing.address = lead.address
      if (!existing.preferredLanguage && lead.clientLanguage) {
        existing.preferredLanguage = readRecordLanguage(lead)
      }
      if (lead.nextStep) existing.notes = [...new Set([...(existing.notes || []), lead.nextStep])]
    } else {
      const preferredLanguage = readRecordLanguage(lead)
      clientMap.set(clientKey, {
        id: clientKey,
        name,
        phone: lead.phone || '(410) 555-0100',
        email: lead.email || '',
        address: lead.address || lead.location || 'Address not added',
        preferredLanguage,
        preferred_language: preferredLanguage,
        language: preferredLanguage,
        latestProjectStatus: projectRecord.latestStatus || lead.status,
        projectCount: 1,
        totalProjectValue: contractAmount,
        outstandingBalance: balance,
        repeatClient: lead.source === 'Repeat Client',
        projects: [projectRecord],
        notes: [
          lead.nextStep || 'Follow up with client on next project step.',
          lead.source ? `Source: ${lead.source}` : 'Client source not recorded.',
        ],
      })
    }

    if (slug) slugToClientId.set(slug, clientKey)
  })

  return Array.from(clientMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
