import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { buildInvoiceCreationPayload, buildInvoiceProjectOptions } from '../src/utils/invoiceCreation.js'
import { dedupeInvoiceRecords, findRelatedLeadForInvoice, hydrateInvoiceRecord } from '../src/utils/invoiceRecords.js'
import { generateInvoiceNumber } from '../src/utils/invoiceNumber.js'
import { selectProjectWorkspaceInvoices } from '../src/utils/projectWorkspaceViewModel.js'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const clients = [
  { id: 'client-direct', name: 'Direct Client' },
  { id: 'client-lead', name: 'Lead Client' },
]
const leads = [
  { id: 'lead-old', clientId: 'client-direct', client: 'Direct Client', projectId: 'project-old', projectTitle: 'Old Project' },
  { id: 'lead-current', clientId: 'client-lead', client: 'Lead Client', projectId: 'project-lead', projectTitle: 'Lead Project' },
]
const projects = [
  { id: 'project-direct', clientId: 'client-direct', leadId: null, projectTitle: 'Direct Project', value: 10000, amountPaid: 4000 },
  { id: 'project-lead', clientId: 'client-lead', leadId: 'lead-current', projectTitle: 'Lead Project', value: 5000, amountPaid: 1000 },
]
const contracts = [
  { id: 'contract-lead', projectId: 'project-lead', status: 'Signed' },
]

const projectOptions = buildInvoiceProjectOptions({ projects, leads, clients, contracts })
const directProject = projectOptions.find((project) => project.id === 'project-direct')
const leadProject = projectOptions.find((project) => project.id === 'project-lead')
assert.equal(directProject.leadId, null)
assert.equal(directProject.clientId, 'client-direct')
assert.equal(directProject.remainingBalance, 6000)
assert.equal(leadProject.leadId, 'lead-current')
assert.equal(leadProject.contractId, 'contract-lead')

const archivedClientOptions = buildInvoiceProjectOptions({
  projects: [{ id: 'project-archived-client', clientId: 'client-archived', projectTitle: 'Archived Client Project' }],
  clients: [{ id: 'client-archived', name: 'Archived Client', archivedAt: '2026-08-01T12:00:00.000Z' }],
})
assert.equal(archivedClientOptions.length, 1)
assert.equal(archivedClientOptions[0].clientId, 'client-archived')

const incompleteProjects = [
  null,
  {},
  { id: 'project-null-client', clientId: null, projectTitle: 'Null Client' },
  { id: 'project-missing-client-id', projectTitle: 'Missing Client ID', clientName: 'Direct Client' },
  { id: 'project-stale-client', clientId: 'client-does-not-exist', clientName: 'Direct Client' },
  { id: 'project-malformed', clientId: { unexpected: true }, projectTitle: 123 },
]
let incompleteOptions
assert.doesNotThrow(() => {
  incompleteOptions = buildInvoiceProjectOptions({
    projects: incompleteProjects,
    leads: [null, { id: 'unrelated-lead', clientId: 'client-direct', projectId: 'another-project' }],
    clients: [null, ...clients],
    contracts: [null],
  })
})
assert.deepEqual(incompleteOptions.map((project) => project.id), ['another-project'])
assert.ok(incompleteProjects.filter(Boolean).every((project) => !incompleteOptions.some((option) => option.id === project.id)))
assert.doesNotThrow(() => buildInvoiceProjectOptions({ projects: null, leads: null, clients: null, contracts: null }))
assert.doesNotThrow(() => buildInvoiceProjectOptions(null))

const noCrossClientFallback = buildInvoiceProjectOptions({
  projects: [{ id: 'project-cross-client', clientId: 'stale-client', clientName: 'Direct Client' }],
  leads: [{ id: 'lead-other', projectId: 'project-other', clientId: 'client-direct', client: 'Direct Client' }],
  clients,
})
assert.deepEqual(noCrossClientFallback.map((project) => project.id), ['project-other'])
assert.equal(noCrossClientFallback.some((project) => project.id === 'project-cross-client'), false)
assert.ok(projectOptions.every((project) => clients.some((client) => client.id === project.clientId)))

const directPayload = buildInvoiceCreationPayload({
  project: directProject,
  client: clients[0],
  title: 'Progress Invoice',
  issueDate: '2026-08-23',
  dueDate: '2026-08-30',
  lineItems: [
    { description: 'Partial billing', amount: 2500 },
    { description: 'Additional work', amount: 500 },
  ],
  paymentTerms: 'Due in 7 days',
  invoiceLanguage: 'es',
})
assert.equal(directPayload.projectId, 'project-direct')
assert.equal(directPayload.clientId, 'client-direct')
assert.equal(directPayload.leadId, null)
assert.equal(directPayload.amount, 3000)
assert.equal(directPayload.status, 'Draft')
assert.equal(directPayload.invoiceLanguage, 'es')

assert.equal(findRelatedLeadForInvoice(leads, directPayload), null)
const hydratedDirectInvoice = hydrateInvoiceRecord({ id: 'invoice-direct', ...directPayload }, { leads })
assert.equal(hydratedDirectInvoice.leadId, null)
assert.equal(hydratedDirectInvoice.projectId, 'project-direct')
assert.equal(hydratedDirectInvoice.clientId, 'client-direct')

const coexistingInvoices = dedupeInvoiceRecords([
  { id: 'invoice-one', number: 'INV-ONE', projectId: 'project-direct' },
  { id: 'invoice-two', number: 'INV-TWO', projectId: 'project-direct' },
])
assert.equal(coexistingInvoices.length, 2)
assert.deepEqual(
  selectProjectWorkspaceInvoices(coexistingInvoices, { projectIds: ['project-direct'] }).map((invoice) => invoice.id),
  ['invoice-one', 'invoice-two']
)
assert.match(generateInvoiceNumber({ id: 'invoice-direct' }, new Date('2026-08-23T12:00:00')), /^INV-20260823-[A-Z0-9]{4}$/)

const appSource = read('../src/App.jsx')
const invoicesPageSource = read('../src/pages/InvoicesPage.jsx')
const projectSource = read('../src/pages/ProjectDetailPage.jsx')
const modalSource = read('../src/components/invoices/InvoiceCreationModal.jsx')
const supabaseServiceSource = read('../src/services/supabase/invoicesSupabaseService.js')
const invoiceDetailSource = read('../src/pages/InvoiceDetailPage.jsx')

assert.match(invoicesPageSource, /onClick=\{onCreateInvoice\}/)
assert.match(projectSource, /onClick=\{onCreateInvoice\}/)
assert.match(appSource, /async function createInvoiceRecord\(invoiceDraft\)/)
assert.match(appSource, /dataProvider\.invoices\.create\(invoiceDraft/)
assert.match(appSource, /if \(!persistedInvoice\?\.id\)/)
assert.match(appSource, /setInvoiceRecords\(\(current\) => dedupeInvoiceRecords\(\[persistedInvoice, \.\.\.current\]\)\)/)
assert.match(appSource, /navigate\(`\/invoices\/\$\{persistedInvoice\.id\}`\)/)
assert.ok(appSource.indexOf('if (!persistedInvoice?.id)') < appSource.indexOf('navigate(`/invoices/${persistedInvoice.id}`)'))
assert.match(modalSource, /useProjectRemainingBalance/)
assert.match(modalSource, /lineItems\.reduce/)
assert.match(modalSource, /min-h-12/)
assert.match(modalSource, /ariaLabelledBy="create-invoice-title"/)
assert.match(modalSource, /Array\.isArray\(clients\)/)
assert.match(modalSource, /disabled=\{lockProject\}/)
assert.match(appSource, /invoiceModalState\.isOpen \? \(/)
assert.match(supabaseServiceSource, /const invoiceNumber = await ensureUniqueInvoiceNumber\(contractorId, invoiceData\)/)
assert.match(supabaseServiceSource, /payload\.project_id = readField\(invoice, \['projectId', 'project_id'\]\) \|\| null/)
assert.match(supabaseServiceSource, /payload\.client_id = readField\(invoice, \['clientId', 'client_id'\]\) \|\| null/)
assert.doesNotMatch(supabaseServiceSource, /payload\.lead_id/)
assert.match(invoiceDetailSource, /<InvoiceDocumentPreview/)

for (const key of [
  'newInvoice',
  'createInvoice',
  'createInvoiceHelp',
  'invoiceTitle',
  'invoiceLineItemsHelp',
  'useProjectRemainingBalance',
  'invoiceCreated',
  'invoiceCreateFailed',
]) {
  assert.equal(typeof en[key], 'string', `Missing English translation: ${key}`)
  assert.equal(typeof es[key], 'string', `Missing Spanish translation: ${key}`)
}

console.log('Invoice creation validation passed.')
