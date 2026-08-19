import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

function read(relativePath) {
  return readFileSync(fileURLToPath(new URL(relativePath, import.meta.url)), 'utf8')
}

const appSource = read('../src/App.jsx')
const topbarSource = read('../src/components/layout/Topbar.jsx')
const modalSource = read('../src/components/common/ModalShell.jsx')
const backButtonSource = read('../src/components/common/RecordBackButton.jsx')
const filterChipSource = read('../src/components/ui/FilterChip.jsx')
const statusBadgeSource = read('../src/components/ui/StatusBadge.jsx')
const selectSource = read('../src/components/ui/SelectField.jsx')
const globalCssSource = read('../src/index.css')
const publicEstimateSource = read('../src/pages/PublicEstimatePage.jsx')
const authShellSource = read('../src/components/auth/AuthPageShell.jsx')
const onboardingSource = read('../src/pages/AuthOnboardingPage.jsx')
const settingsSource = read('../src/pages/SettingsPage.jsx')

assert.match(appSource, /safe-area-inset-left/)
assert.match(appSource, /safe-area-inset-right/)
assert.match(appSource, /safe-area-inset-bottom/)
assert.match(topbarSource, /safe-area-inset-top/)
assert.match(topbarSource, /min-h-11 min-w-11/)
assert.match(topbarSource, /focus-visible:ring-2 focus-visible:ring-blue-500/)

assert.match(modalSource, /role="dialog"/)
assert.match(modalSource, /aria-modal="true"/)
assert.match(modalSource, /focusableSelector/)
assert.match(modalSource, /event\.key !== 'Tab'/)
assert.match(modalSource, /previouslyFocused\.focus\(\)/)
assert.match(modalSource, /safe-area-inset-bottom/)
assert.match(modalSource, /overflow-x-hidden/)

assert.match(backButtonSource, /min-h-11/)
assert.match(backButtonSource, /focus-visible:ring-2/)
assert.match(backButtonSource, /aria-label=\{ariaLabel\}/)
for (const page of [
  'LeadDetailPage.jsx',
  'EstimateBuilderPage.jsx',
  'ContractsPage.jsx',
  'ProjectDetailPage.jsx',
  'ClientProfilePage.jsx',
  'InvoiceDetailPage.jsx',
]) {
  assert.match(read(`../src/pages/${page}`), /<RecordBackButton/)
}

assert.match(filterChipSource, /min-h-11/)
assert.match(filterChipSource, /aria-pressed=\{selected\}/)
assert.match(filterChipSource, /focus-visible:ring-2/)
for (const page of [
  'LeadsPage.jsx',
  'EstimatesPage.jsx',
  'ClientsPage.jsx',
  'JobsPage.jsx',
  'InvoicesPage.jsx',
  'CalendarPage.jsx',
  'ContractsPage.jsx',
]) {
  assert.match(read(`../src/pages/${page}`), /<FilterChip/)
}

for (const page of [
  'LeadsPage.jsx',
  'ClientsPage.jsx',
  'JobsPage.jsx',
  'InvoicesPage.jsx',
  'ContractsPage.jsx',
]) {
  const source = read(`../src/pages/${page}`)
  assert.match(source, /<StatusBadge status="Archived"/)
  assert.doesNotMatch(source, /\? 'Archived' : (?:lead\.status|client\.latestProjectStatus|job\.jobStatus|invoice\.status)/)
}

assert.match(statusBadgeSource, /min-h-6/)
assert.match(statusBadgeSource, /leading-none/)
assert.match(statusBadgeSource, /Archived: 'bg-amber-50/)
assert.match(selectSource, /min-h-12/)
assert.match(selectSource, /disabled:cursor-not-allowed/)
assert.match(globalCssSource, /prefers-reduced-motion: reduce/)
assert.match(globalCssSource, /transition-duration: 0\.01ms/)

for (const page of [
  'LeadsPage.jsx',
  'EstimatesPage.jsx',
  'ClientsPage.jsx',
  'JobsPage.jsx',
  'InvoicesPage.jsx',
  'CalendarPage.jsx',
]) {
  assert.match(read(`../src/pages/${page}`), /overflow-wrap:anywhere/)
}
for (const page of ['JobsPage.jsx', 'InvoicesPage.jsx']) {
  const source = read(`../src/pages/${page}`)
  assert.match(source, /event\.key !== 'Enter' && event\.key !== ' '/)
  assert.match(source, /tabIndex=\{0\} role="button"/)
}
assert.match(publicEstimateSource, /safe-area-inset-left/)
assert.match(publicEstimateSource, /safe-area-inset-right/)
assert.match(publicEstimateSource, /overflow-wrap:anywhere/)

assert.match(authShellSource, /safe-area-inset-top/)
assert.match(authShellSource, /safe-area-inset-bottom/)
assert.match(authShellSource, /safe-area-inset-left/)
assert.match(authShellSource, /safe-area-inset-right/)
assert.match(authShellSource, /min-h-11 items-center/)
assert.match(authShellSource, /min-h-dvh/)
assert.match(onboardingSource, /min-h-dvh/)
assert.match(onboardingSource, /safe-area-inset-top/)
assert.match(onboardingSource, /safe-area-inset-bottom/)
assert.match(onboardingSource, /h-11 w-11/)
assert.doesNotMatch(settingsSource, /className="min-h-10 rounded-2xl/)

console.log('Global UI consistency validation passed.')
