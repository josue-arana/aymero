import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const tokenPattern = /^[a-zA-Z0-9_-]{20,200}$/
const projectStatusLabels: Record<string, string> = {
  lead: 'Lead',
  estimate: 'Estimate',
  contract: 'Signed',
  scheduled: 'Scheduled',
  in_progress: 'In Progress',
  waiting_on_client: 'Waiting on Client',
  waiting_on_materials: 'Waiting on Materials',
  ready_for_final_walkthrough: 'Ready for Final Walkthrough',
  completed: 'Completed',
  paid: 'Paid',
  cancelled: 'Cancelled',
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

function mapEstimate(row: Record<string, unknown> | null) {
  if (!row) return null

  return {
    number: row.estimate_number || '',
    estimateNumber: row.estimate_number || '',
    title: row.title || '',
    projectTitle: row.title || '',
    summary: row.scope_of_work || '',
    scopeOfWork: row.scope_of_work || '',
    lineItems: Array.isArray(row.line_items) ? row.line_items : [],
    subtotal: Number(row.subtotal || 0),
    discountAmount: Number(row.discount_amount || 0),
    taxAmount: Number(row.tax_amount || 0),
    total: Number(row.total_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    depositPercentage: row.deposit_percentage === null || row.deposit_percentage === undefined
      ? null
      : Number(row.deposit_percentage),
    materialsIncluded: row.materials_included !== false,
    paymentTerms: row.payment_terms || '',
    status: row.status || '',
    dateCreated: row.created_at || '',
    createdAt: row.created_at || '',
    validUntil: row.valid_until || '',
  }
}

function mapContract(row: Record<string, unknown> | null) {
  if (!row) return null

  let parsedTerms: Record<string, unknown> = {}
  if (row.terms && typeof row.terms === 'object') parsedTerms = row.terms as Record<string, unknown>
  if (typeof row.terms === 'string') {
    try { parsedTerms = JSON.parse(row.terms) } catch { parsedTerms = { termsText: row.terms } }
  }

  return {
    number: row.contract_number || '',
    contractNumber: row.contract_number || '',
    title: row.title || '',
    projectTitle: row.title || '',
    scope: row.scope_of_work || '',
    scopeOfWork: row.scope_of_work || '',
    terms: parsedTerms.summary || (typeof row.terms === 'string' ? row.terms : ''),
    paymentTerms: row.payment_terms || '',
    acceptanceLegalText: parsedTerms.acceptanceLegalText || '',
    contractLanguage: parsedTerms.contractLanguage || '',
    workBreakdown: Array.isArray(parsedTerms.workBreakdown) ? parsedTerms.workBreakdown : [],
    materials: (parsedTerms.sections as Record<string, unknown> | undefined)?.materials || '',
    timeline: (parsedTerms.sections as Record<string, unknown> | undefined)?.timeline || '',
    changeOrders: (parsedTerms.sections as Record<string, unknown> | undefined)?.changeOrders || '',
    clientResponsibilities: (parsedTerms.sections as Record<string, unknown> | undefined)?.clientResponsibilities || '',
    warrantyDisclaimer: (parsedTerms.sections as Record<string, unknown> | undefined)?.warrantyDisclaimer || '',
    total: Number(row.total_amount || 0),
    totalAmount: Number(row.total_amount || 0),
    contractAmount: Number(row.total_amount || 0),
    hasStoredContractAmount: row.total_amount !== null && row.total_amount !== undefined,
    depositAmount: row.deposit_amount === null || row.deposit_amount === undefined
      ? null
      : Number(row.deposit_amount),
    status: row.status || '',
    signed: Boolean(row.signed_at),
    signedDate: row.signed_at || '',
    signedAt: row.signed_at || '',
    signedBy: row.signed_by || '',
    sentAt: row.sent_at || '',
    createdAt: row.created_at || '',
    updatedAt: row.updated_at || '',
  }
}

function mapPublicPayment(payment: Record<string, unknown>, publicProjectId: string) {
  return {
    projectId: publicProjectId,
    amount: Number(payment.amount || 0),
    paymentType: payment.payment_type || '',
    paymentDate: payment.payment_date || '',
    paymentMethod: payment.payment_method || payment.method || '',
    status: payment.status || '',
    createdAt: payment.created_at || '',
  }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse({ error: 'Method not allowed.' }, 405)

  let token = ''
  try {
    const body = await request.json()
    token = String(body?.token || '').trim()
  } catch {
    return jsonResponse({ error: 'Invalid request.' }, 400)
  }

  if (!tokenPattern.test(token) && !uuidPattern.test(token)) {
    return jsonResponse({ error: 'Client Portal Not Found.' }, 404)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
  if (!supabaseUrl || !serviceRoleKey) return jsonResponse({ error: 'Portal service unavailable.' }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })

  let projectQuery = admin
    .from('projects')
    .select('id, contractor_id, client_id, lead_id, public_portal_token, title, project_type, address, status, estimated_value, contract_value, start_date, target_end_date, created_at, updated_at')
    .eq('public_portal_token', token)
    .is('archived_at', null)
    .maybeSingle()
  let { data: project, error: projectError } = await projectQuery

  // Compatibility for links issued before opaque portal tokens were added.
  if (!project && !projectError && uuidPattern.test(token)) {
    const legacyResult = await admin
      .from('projects')
      .select('id, contractor_id, client_id, lead_id, public_portal_token, title, project_type, address, status, estimated_value, contract_value, start_date, target_end_date, created_at, updated_at')
      .eq('id', token)
      .is('archived_at', null)
      .maybeSingle()
    project = legacyResult.data
    projectError = legacyResult.error
  }

  if (projectError) return jsonResponse({ error: 'Portal service unavailable.' }, 500)
  if (!project) return jsonResponse({ error: 'Client Portal Not Found.' }, 404)

  const contractorId = project.contractor_id
  const projectId = project.id
  const [settingsResult, clientResult] = await Promise.all([
    admin
      .from('company_settings')
      .select('company_name, owner_name, phone, email, business_address, website, license_number, logo_file_path, primary_brand_color, accepted_payment_methods, default_payment_terms, customer_portal_language, show_payments_in_portal, show_photos_in_portal, show_documents_in_portal')
      .eq('contractor_id', contractorId)
      .is('archived_at', null)
      .maybeSingle(),
    project.client_id
      ? admin
          .from('clients')
          .select('display_name, phone, address, city, state, postal_code, preferred_language')
          .eq('contractor_id', contractorId)
          .eq('id', project.client_id)
          .is('archived_at', null)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])

  if (settingsResult.error || clientResult.error) return jsonResponse({ error: 'Portal service unavailable.' }, 500)

  const settings = settingsResult.data || {}
  const showPayments = settings.show_payments_in_portal !== false
  const showPhotos = settings.show_photos_in_portal !== false
  const showDocuments = settings.show_documents_in_portal !== false

  const [estimateResult, contractResult, paymentResult, eventResult, photoResult] = await Promise.all([
    showDocuments
      ? admin.from('estimates').select('estimate_number, title, scope_of_work, line_items, subtotal, discount_amount, tax_amount, total_amount, deposit_percentage, materials_included, payment_terms, status, created_at, updated_at').eq('contractor_id', contractorId).eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    showDocuments
      ? admin.from('contracts').select('contract_number, title, scope_of_work, terms, total_amount, deposit_amount, payment_terms, status, sent_at, signed_at, signed_by, created_at, updated_at').eq('contractor_id', contractorId).eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false }).limit(1).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    showPayments
      ? admin.from('payments').select('amount, payment_type, payment_date, payment_method, method, status, created_at').eq('contractor_id', contractorId).eq('project_id', projectId).is('archived_at', null).order('payment_date', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    admin.from('events').select('title, event_type, event_date, start_time, end_time, type, status, starts_at, ends_at, location, created_at').eq('contractor_id', contractorId).eq('project_id', projectId).is('archived_at', null).neq('status', 'cancelled').order('starts_at', { ascending: true }),
    showPhotos
      ? admin.from('project_photos').select('file_path, thumbnail_path, file_size, mime_type, category, caption, taken_at, created_at').eq('contractor_id', contractorId).eq('project_id', projectId).is('archived_at', null).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
  ])

  const queryError = [estimateResult.error, contractResult.error, paymentResult.error, eventResult.error, photoResult.error].find(Boolean)
  if (queryError) return jsonResponse({ error: 'Portal service unavailable.' }, 500)

  const photos = await Promise.all((photoResult.data || []).map(async (photo) => {
    const storagePath = photo.thumbnail_path || photo.file_path
    const { data: signedPhoto } = await admin.storage.from('project-photos').createSignedUrl(storagePath, 3600)
    return signedPhoto?.signedUrl ? {
      fileName: String(photo.file_path || '').split('/').pop() || '',
      fileSize: Number(photo.file_size || 0),
      mimeType: photo.mime_type || '',
      category: photo.category || 'other',
      caption: photo.caption || '',
      takenAt: photo.taken_at || '',
      createdAt: photo.created_at || '',
      previewUrl: signedPhoto.signedUrl,
      url: signedPhoto.signedUrl,
    } : null
  }))

  const client = clientResult.data || {}
  const estimate = mapEstimate(estimateResult.data)
  const contract = mapContract(contractResult.data)
  const publicProjectId = project.public_portal_token
  const projectStatus = projectStatusLabels[String(project.status || '')] || project.status || ''
  const publicPayments = (paymentResult.data || []).map((payment) => mapPublicPayment(payment, publicProjectId))

  return jsonResponse({
    project: {
      id: publicProjectId,
      projectId: publicProjectId,
      publicPortalData: true,
      title: project.title || '',
      projectTitle: project.title || '',
      projectType: project.project_type || '',
      address: project.address || client.address || '',
      location: project.address || client.address || '',
      status: projectStatus,
      projectStatus,
      estimatedValue: Number(project.estimated_value || 0),
      value: Number(contract?.total ?? project.contract_value ?? project.estimated_value ?? 0),
      contractValue: Number(contract?.total ?? project.contract_value ?? 0),
      startDate: project.start_date || '',
      targetCompletion: project.target_end_date || '',
      createdAt: project.created_at || '',
      updatedAt: project.updated_at || '',
      client: client.display_name || '',
      clientName: client.display_name || '',
      phone: client.phone || '',
      portal: {
        estimate: estimate || {},
        contract: contract || {},
        payments: publicPayments,
        events: (eventResult.data || []).map((event) => ({
          title: event.title || '',
          eventType: event.event_type || event.type || '',
          type: event.type || '',
          status: event.status || '',
          date: event.event_date || String(event.starts_at || '').slice(0, 10),
          startTime: event.start_time || '',
          endTime: event.end_time || '',
          startsAt: event.starts_at || '',
          endsAt: event.ends_at || '',
          location: event.location || '',
        })),
        photos: photos.filter(Boolean),
      },
    },
    client: {
      name: client.display_name || '',
      displayName: client.display_name || '',
      phone: client.phone || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      postalCode: client.postal_code || '',
      preferredLanguage: client.preferred_language || '',
    },
    estimate,
    contract,
    payments: publicPayments,
    events: (eventResult.data || []).map((event) => ({
      title: event.title || '',
      eventType: event.event_type || event.type || '',
      type: event.type || '',
      status: event.status || '',
      date: event.event_date || String(event.starts_at || '').slice(0, 10),
      startTime: event.start_time || '',
      endTime: event.end_time || '',
      startsAt: event.starts_at || '',
      endsAt: event.ends_at || '',
      location: event.location || '',
    })),
    photos: photos.filter(Boolean),
    companySettings: {
      company: {
        name: settings.company_name || '',
        ownerName: settings.owner_name || '',
        phone: settings.phone || '',
        email: settings.email || '',
        address: settings.business_address || '',
        website: settings.website || '',
        licenseNumber: settings.license_number || '',
        logo: settings.logo_file_path || '',
        primaryColor: settings.primary_brand_color || '',
        acceptedPaymentMethods: settings.accepted_payment_methods || { methods: [], otherLabel: '' },
      },
      defaults: { paymentTerms: settings.default_payment_terms || '' },
      portal: {
        defaultLanguage: settings.customer_portal_language || client.preferred_language || 'en',
        showPayments,
        showPhotos,
        showDocuments,
      },
    },
  })
})
