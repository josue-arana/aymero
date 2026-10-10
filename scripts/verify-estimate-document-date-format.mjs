import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { formatEstimateDocumentDate } from '../src/utils/estimateDocumentDate.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8')
const template = read('src/components/estimates/EstimatePdfTemplate.jsx')
const pdf = read('src/utils/estimatePdf.js')

assert.equal(formatEstimateDocumentDate('2026-09-03T12:00:00'), '9/3/2026')
assert.equal(formatEstimateDocumentDate('2026-10-10T12:00:00'), '10/10/2026')
assert.equal(formatEstimateDocumentDate('2027-01-05T12:00:00'), '1/5/2027')
assert.match(formatEstimateDocumentDate('2026-09-03T12:00:00'), /^\d{1,2}\/\d{1,2}\/\d{4}$/)
assert.equal(formatEstimateDocumentDate('not-a-date'), 'not-a-date')
assert.match(template, /formatEstimateDocumentDate\(estimateDate\)/)
assert.match(template, /formatEstimateDocumentDate\(displayValidUntil\)/)
assert.match(pdf, /formatEstimateDocumentDate\(estimateDate\)/)
assert.match(pdf, /formatEstimateDocumentDate\(validUntil\)/)
assert.doesNotMatch(template, /month: 'long'/)
assert.doesNotMatch(pdf, /month: 'long'/)
console.log('Estimate document date-format verification passed.')
