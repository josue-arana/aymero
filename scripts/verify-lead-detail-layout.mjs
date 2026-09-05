import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const leadDetailSource = read('../src/pages/LeadDetailPage.jsx')
const leadProgressSource = read('../src/components/leads/LeadProgress.jsx')

// The page keeps the established content blocks and a natural stacked reading order.
for (const componentName of [
  'LeadRecommendedActionCard',
  'RelatedLeadRecordsCard',
  'LeadDetailsCard',
  'LeadActivityCard',
]) {
  assert.match(leadDetailSource, new RegExp(`<${componentName}`))
}
assert.match(
  leadDetailSource,
  /data-lead-detail-layout="stacked"[\s\S]*<LeadRecommendedActionCard[\s\S]*<RelatedLeadRecordsCard[\s\S]*<LeadDetailsCard[\s\S]*<LeadActivityCard/,
)

// Desktop uses two independently flowing stacks instead of synchronized grid rows.
assert.match(leadDetailSource, /data-lead-detail-layout="columns"/)
assert.match(
  leadDetailSource,
  /data-lead-detail-column="primary"[\s\S]*<LeadRecommendedActionCard[\s\S]*<LeadDetailsCard/,
)
assert.match(
  leadDetailSource,
  /data-lead-detail-column="secondary"[\s\S]*<RelatedLeadRecordsCard[\s\S]*<LeadActivityCard/,
)
assert.match(leadDetailSource, /data-lead-detail-breakpoint="xl"/)
assert.match(leadDetailSource, /data-lead-detail-ratio="2:1"/)
assert.doesNotMatch(leadDetailSource, /lg:row-start-[12]/)
assert.doesNotMatch(leadDetailSource, /style=\{\{[^}]*\b(?:height|minHeight|maxHeight)\b/)

// Related records remain conditional and do not produce an empty placeholder.
assert.match(leadDetailSource, /\(leadHasEstimate \|\| relatedProject\) \? \(/)
assert.match(leadDetailSource, /if \(!estimate && !project\) return null/)

// Presentation extraction keeps lifecycle actions wired to the existing handler.
assert.match(leadDetailSource, /onLifecycleAction=\{handleLifecycleAction\}/)
assert.match(leadDetailSource, /onClick=\{\(\) => onLifecycleAction\(action\.actionType\)\}/)

// Progress remains a five-step, overflow-safe grid with bilingual long labels.
assert.match(leadProgressSource, /<ol className="grid grid-cols-5"/)
assert.match(leadProgressSource, /className="min-w-0 text-center"/)
assert.equal(en.leadProgressEstimateSent, 'Estimate Sent')
assert.equal(es.leadProgressEstimateSent, 'Estimado enviado')
assert.equal(en.leadProgressJobCreated, 'Job Created')
assert.equal(es.leadProgressJobCreated, 'Trabajo creado')

// Preferred language is displayed only from the language already carried by the lead.
assert.match(leadDetailSource, /normalizeSupportedLanguageOrEmpty\(currentLead\?\.clientLanguage\)/)
assert.match(leadDetailSource, /label: t\('preferredLanguage'\)/)
for (const key of ['preferredLanguage', 'english', 'spanish']) {
  assert.equal(typeof en[key], 'string')
  assert.equal(typeof es[key], 'string')
  assert.ok(en[key].length > 0)
  assert.ok(es[key].length > 0)
}

console.log('Lead Detail responsive layout validation passed.')
