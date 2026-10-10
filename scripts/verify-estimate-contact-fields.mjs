import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const template = read('src/components/estimates/EstimatePdfTemplate.jsx')
const builder = read('src/pages/EstimateBuilderPage.jsx')
const pdf = read('src/utils/estimatePdf.js')
const publicPage = read('src/pages/PublicEstimatePage.jsx')
const endpoint = read('supabase/functions/super-endpoint/index.ts')
const en = read('src/translations/en.js')
const es = read('src/translations/es.js')
const pagination = read('src/utils/estimatePagination.js')
const output = read('src/utils/documentOutput.js')

assert.match(template, /lead\?\.phone \? <div[^>]*>\{lead\.phone\}<\/div>/)
assert.match(template, /\{t\('license'\)\}: \{company\.licenseNumber\}/)
assert.match(builder, /phone: lead\?\.phone \|\| clientRecord\?\.phone \|\| ''/)
assert.match(pdf, /lead\?\.phone, lead\?\.address \|\| lead\?\.location/)
assert.match(pdf, /\$\{t\('license'\)\}: \$\{company\.licenseNumber\}/)
assert.match(publicPage, /phone: client\.phone \|\| ''/)
assert.match(endpoint, /select\('display_name, phone, address, city, state, postal_code, preferred_language'\)/)
assert.match(endpoint, /phone: client\.phone \|\| lead\.phone \|\| ''/)
assert.match(endpoint, /licenseNumber: settings\.license_number \|\| ''/)
assert.match(en, /"license": "License"/)
assert.match(es, /"license": "Licencia"/)
assert.match(template, /company\?\.phone/)
assert.match(template, /company\?\.email/)
assert.match(template, /company\?\.website/)
assert.match(pagination, /ESTIMATE_DOCUMENT_SOURCE_WIDTH/)
assert.match(output, /shouldUseGeneratedPdfForPrint/)
console.log('Estimate contact-field verification passed.')
