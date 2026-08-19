import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { en } from '../src/translations/en.js'
import { es } from '../src/translations/es.js'
import {
  buildCustomerDeliveryContent,
  getCustomerDeliveryAvailability,
} from '../src/utils/customerDelivery.js'
import {
  ESTIMATE_SHARE_RESOLUTION,
  resolveEstimateShareLink,
} from '../src/utils/estimateShare.js'

const dictionaries = { en, es }
const translate = (language) => (key, params = {}) => Object.entries(params).reduce(
  (value, [param, replacement]) => String(value).replaceAll(`{{${param}}}`, replacement),
  dictionaries[language][key],
)
const portalOrigin = 'https://portal.aymero.co'
const standardToken = '4fd4a895ba7f4c8b91019f91c98c85fa'
const longToken = 'a'.repeat(180)
const arbitraryLongString = 'Renovation'.repeat(64)
const estimateUrl = (token) => `${portalOrigin}/estimate/${token}`

for (const token of [standardToken, longToken]) {
  const link = estimateUrl(token)
  const content = buildCustomerDeliveryContent({
    documentType: 'estimate',
    customerName: 'Maria Rivera',
    projectTitle: 'Kitchen Renovation',
    amountValue: '$47,500',
    documentLink: link,
    companyName: 'Rivera Construction',
    contentT: translate('en'),
  })

  assert.equal(content.smsBody.includes(link), true)
  assert.equal(content.emailBody.includes(link), true)
  assert.equal(content.smsBody.includes(token), true)
}

const arbitraryStringContent = buildCustomerDeliveryContent({
  documentType: 'estimate',
  customerName: arbitraryLongString,
  projectTitle: arbitraryLongString,
  amountValue: arbitraryLongString,
  documentLink: estimateUrl(standardToken),
  contentT: translate('en'),
})
assert.equal(arbitraryStringContent.smsBody.includes(arbitraryLongString), true)

for (const appLanguage of ['en', 'es']) {
  for (const estimateLanguage of ['en', 'es']) {
    const appT = translate(appLanguage)
    const contentT = translate(estimateLanguage)
    const link = estimateUrl(standardToken)
    const content = buildCustomerDeliveryContent({
      documentType: 'estimate',
      customerName: 'Maria Rivera',
      projectTitle: 'Cocina Rivera',
      amountValue: '$12,345',
      documentLink: link,
      companyName: 'Construcciones Rivera',
      contentT,
    })

    assert.equal(appT('messagePreview'), dictionaries[appLanguage].messagePreview)
    assert.equal(content.subject, contentT('sendEstimateSubject', { project: 'Cocina Rivera' }))
    assert.equal(content.smsBody.startsWith(estimateLanguage === 'es' ? 'Hola Maria' : 'Hi Maria'), true)
    assert.equal(content.smsBody.includes('Cocina Rivera'), true)
    assert.equal(content.smsBody.includes('$12,345'), true)
    assert.equal(content.smsBody.includes(link), true)
    assert.equal(content.emailBody.includes('Construcciones Rivera'), true)
    assert.doesNotMatch(content.smsBody, /securely|secure client link|PDF attached|download your PDF/i)
    assert.doesNotMatch(content.emailBody, /securely|secure client link|PDF attached|download your PDF/i)
  }
}

const missingLinkContent = buildCustomerDeliveryContent({
  documentType: 'estimate',
  customerName: 'Maria Rivera',
  projectTitle: 'Kitchen Renovation',
  amountValue: '$47,500',
  documentLink: '',
  contentT: translate('en'),
})
assert.equal(missingLinkContent.smsBody, '')
assert.equal(missingLinkContent.emailBody, '')
assert.deepEqual(getCustomerDeliveryAvailability({
  documentType: 'estimate',
  documentLink: '',
  phone: '5551234567',
  email: 'client@example.com',
}), {
  requiresClientLink: true,
  hasRequiredClientLink: false,
  text: false,
  email: false,
})
assert.notEqual(en.estimateShareLinkUnavailableHelp, es.estimateShareLinkUnavailableHelp)

const resolveShare = (record) => resolveEstimateShareLink(record, {
  buildUrl: (token) => estimateUrl(token),
})
assert.equal(resolveShare({ public_share_token: standardToken }).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT)
assert.equal(resolveShare({ public_share_token: 'not a token' }).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_INVALID)
assert.equal(resolveShare({ public_share_token: standardToken, archived_at: '2026-08-18T12:00:00.000Z' }).status, ESTIMATE_SHARE_RESOLUTION.TOKEN_PRESENT)

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const modalSource = read('../src/components/common/SendToCustomerModal.jsx')
const builderSource = read('../src/pages/EstimateBuilderPage.jsx')
const healthSource = read('../src/config/developerHealthRegistry.js')

assert.match(modalSource, /\[overflow-wrap:anywhere\]/)
assert.match(modalSource, /min-w-0 max-w-full whitespace-pre-wrap break-words/)
assert.match(modalSource, /overflow-x-hidden/)
assert.match(modalSource, /safe-area-inset-bottom/)
assert.match(modalSource, /aria-labelledby="customer-message-preview-label"/)
assert.match(modalSource, /role="region"/)
assert.match(modalSource, /aria-pressed=\{channel === option\.id\}/)
assert.match(modalSource, /hasRequiredClientLink \? <div/)
assert.match(modalSource, /disabled=\{isSubmitting \|\| !deliveryAvailability\[channel\]\}/)
assert.match(builderSource, /contentT=\{estimateT\}/)
assert.match(builderSource, /companyName=\{companySettings\?\.company\?\.name \|\| ''\}/)
assert.match(healthSource, /id: 'clientEstimateApproval'/)
assert.match(healthSource, /classification: 'backlog'/)
assert.match(healthSource, /priority: 'high'/)

console.log('Customer delivery polish validation passed.')
