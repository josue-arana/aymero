import { normalizeClientPreferredLanguageFields, readRecordLanguage } from './language.js'
import { normalizeOptionalEmail, normalizeOptionalEmailForPersistence } from './email.js'

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

function hasOwnField(record, fieldName) {
  return Boolean(record) && Object.prototype.hasOwnProperty.call(record, fieldName)
}

export function mapOptionalClientUpdatesToPersistence(updates = {}) {
  return ['phone', 'email', 'address', 'notes'].reduce((payload, fieldName) => {
    if (hasOwnField(updates, fieldName)) {
      payload[fieldName] = fieldName === 'email'
        ? normalizeOptionalEmailForPersistence(updates[fieldName]) || null
        : updates[fieldName] || null
    }
    return payload
  }, {})
}

export function readClientNotesForForm(notes) {
  if (Array.isArray(notes)) {
    return notes
      .filter((note) => typeof note === 'string' && note.trim())
      .join('\n')
  }

  return typeof notes === 'string' ? notes : ''
}

export function mergeClientUpdatesIntoRelatedRecord(record = {}, updates = {}) {
  const nextRecord = { ...record }

  if (hasOwnField(updates, 'name')) nextRecord.client = updates.name
  if (hasOwnField(updates, 'phone')) nextRecord.phone = updates.phone
  if (hasOwnField(updates, 'email')) nextRecord.email = updates.email
  if (hasOwnField(updates, 'address')) {
    nextRecord.address = updates.address
    nextRecord.location = updates.address
  }

  return nextRecord
}

export function buildClientProfiles(leads = [], customClients = [], projects = []) {
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
      phone: client.phone || '',
      email: normalizeOptionalEmail(client.email),
      address: client.address || '',
      preferredLanguage: normalizedClient.preferredLanguage,
      latestProjectStatus: client.latestProjectStatus || 'Lead',
      projectCount: 0,
      totalProjectValue: 0,
      outstandingBalance: 0,
      repeatClient: Boolean(client.repeatClient),
      projects: [],
      notes: typeof client.notes === 'string' ? client.notes : '',
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
      if (!existing.manualClient) {
        if (!existing.phone && lead.phone) existing.phone = lead.phone
        if (!existing.email && lead.email) existing.email = normalizeOptionalEmail(lead.email)
        if (!existing.address && lead.address) existing.address = lead.address
        if (lead.nextStep) existing.notes = [...new Set([...(existing.notes || []), lead.nextStep])]
      }
      if (!existing.preferredLanguage && lead.clientLanguage) {
        existing.preferredLanguage = readRecordLanguage(lead)
      }
    } else {
      const preferredLanguage = readRecordLanguage(lead)
      clientMap.set(clientKey, {
        id: clientKey,
        name,
        phone: lead.phone || '(410) 555-0100',
        email: normalizeOptionalEmail(lead.email),
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

  projects.forEach((project) => {
    const projectClientId = String(project?.clientId || project?.client_id || '').trim()
    const projectClientName = project?.client || project?.clientName || project?.customerName || ''
    const projectClientSlug = getClientSlug(projectClientName)
    const clientKey = projectClientId && clientMap.has(projectClientId)
      ? projectClientId
      : slugToClientId.get(projectClientSlug) || projectClientId || projectClientSlug

    if (!clientKey) return

    const existing = clientMap.get(clientKey)
    const contractAmount = Number(project?.portal?.contractAmount ?? project?.contractValue ?? project?.estimatedValue ?? project?.value ?? 0) || 0
    const paid = Number(project?.portal?.amountPaid ?? project?.amountPaid ?? project?.paid ?? 0) || 0
    const balance = Number(project?.portal?.outstandingBalance ?? project?.remainingBalance ?? project?.remaining ?? Math.max(contractAmount - paid, 0)) || 0
    const projectId = String(project?.id || project?.projectId || project?.project_id || '').trim()
    const resolvedClientName = projectClientName || existing?.displayName || existing?.name || 'Unknown Client'
    const projectRecord = {
      ...project,
      id: projectId || project?.id,
      projectId: projectId || project?.projectId || project?.project_id || null,
      project_id: projectId || project?.project_id || project?.projectId || null,
      clientId: projectClientId || clientKey,
      client: resolvedClientName,
      clientName: resolvedClientName,
      customerName: resolvedClientName,
      isProjectRecord: true,
      projectValue: contractAmount,
      amountPaid: paid,
      outstandingBalance: balance,
      latestStatus: project?.projectStatus || project?.status,
    }

    if (existing) {
      const duplicateIndex = existing.projects.findIndex((candidate) => {
        const candidateProjectId = String(candidate?.projectId || candidate?.project_id || '').trim()
        return Boolean(projectId && (candidateProjectId === projectId || String(candidate?.id || '').trim() === projectId))
      })

      if (duplicateIndex >= 0) {
        existing.projects[duplicateIndex] = { ...existing.projects[duplicateIndex], ...projectRecord }
      } else {
        existing.projects.push(projectRecord)
      }
      existing.latestProjectStatus = projectRecord.latestStatus || existing.latestProjectStatus
      return
    }

    const preferredLanguage = readRecordLanguage(project)
    clientMap.set(clientKey, {
      id: clientKey,
      name: resolvedClientName,
      displayName: resolvedClientName,
      phone: project?.phone || '',
      email: normalizeOptionalEmail(project?.email),
      address: project?.address || project?.location || 'Address not added',
      preferredLanguage,
      preferred_language: preferredLanguage,
      language: preferredLanguage,
      latestProjectStatus: projectRecord.latestStatus || 'Lead',
      projectCount: 1,
      totalProjectValue: contractAmount,
      outstandingBalance: balance,
      repeatClient: false,
      projects: [projectRecord],
      notes: [],
    })
  })

  clientMap.forEach((client) => {
    client.projectCount = client.projects.length
    client.totalProjectValue = client.projects.reduce((total, project) => total + (Number(project?.projectValue ?? project?.value ?? project?.estimatedValue ?? 0) || 0), 0)
    client.outstandingBalance = client.projects.reduce((total, project) => total + (Number(project?.outstandingBalance ?? project?.remainingBalance ?? project?.remaining ?? 0) || 0), 0)
    client.repeatClient = Boolean(client.repeatClient || client.projectCount > 1)
  })

  return Array.from(clientMap.values()).sort((a, b) => a.name.localeCompare(b.name))
}
