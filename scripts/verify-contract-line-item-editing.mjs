import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const contractPage = read('../src/pages/ContractsPage.jsx')
const editor = read('../src/components/contracts/ContractWorkBreakdownEditor.jsx')
const contractDocument = read('../src/utils/contractDocument.js')
const contractService = read('../src/services/supabase/contractsSupabaseService.js')
const contractTemplate = read('../src/components/contracts/ContractPdfTemplate.jsx')
const portalSummary = read('../src/components/portal/PortalSummary.jsx')
const english = read('../src/translations/en.js')
const spanish = read('../src/translations/es.js')

assert.match(contractPage, /<ContractWorkBreakdownEditor workBreakdown=\{workBreakdown\} onChange=\{setWorkBreakdown\}/)
assert.match(contractPage, /\bworkBreakdown,\n\s*paymentTerms,/)
assert.match(editor, /LightweightFormattedTextarea/)
assert.match(editor, /ESTIMATE_MATERIALS_INCLUDED/)
assert.match(editor, /ESTIMATE_LABOR_ONLY/)
assert.match(editor, /ESTIMATE_OWNER_SUPPLIED_MATERIALS/)
assert.match(editor, /onChange=\{\(description\) => updateItem\(index, \{ description \}\)\}/)
assert.match(editor, /onChange=\{\(event\) => updateItem\(index, \{ title: event\.target\.value \}\)\}/)
assert.match(editor, /\{t\('quantity'\)\}: \{item\.quantity\}/)
assert.match(editor, /currency\.format\(Number\(item\.amount \|\| 0\)\)/)
assert.doesNotMatch(editor, /updateItem\(index, \{ amount:/)
assert.doesNotMatch(editor, /addItem|removeItem|removeLineItem/)
assert.match(contractDocument, /\.{3}\(quantity \? \{ quantity \} : \{\}\),/)
assert.match(contractDocument, /materialsIncluded,/)
assert.match(contractDocument, /materialsStatus,/)
assert.match(contractService, /const workBreakdown = normalizeContractWorkBreakdown/)
assert.match(contractService, /workBreakdown,/)
assert.match(contractTemplate, /workBreakdown=\{normalizedWorkBreakdown\}/)
assert.match(portalSummary, /workBreakdown: contractDocumentState\.workBreakdown/)
assert.match(english, /"materialResponsibility": "Material responsibility"/)
assert.match(spanish, /"materialResponsibility": "Responsabilidad de materiales"/)
assert.match(english, /"notSpecified": "Not specified"/)
assert.match(spanish, /"notSpecified": "No especificado"/)

console.log('Contract line-item editing verification passed.')
