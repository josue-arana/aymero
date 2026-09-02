import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifestPath = join(repositoryRoot, 'supabase/bootstrap/greenfield-manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

const projectRef = readArgument('--project-ref')
const expectedProjectName = readArgument('--expected-project-name')
const confirmedEmptyNonProduction = process.argv.includes('--confirm-empty-non-production')

if (!projectRef || !expectedProjectName || !confirmedEmptyNonProduction) {
  throw new Error(
    'Usage: node scripts/bootstrap-aymero-greenfield.mjs --project-ref <ref> '
    + '--expected-project-name <name> --confirm-empty-non-production',
  )
}
if (projectRef === manifest.productionProjectRef) {
  throw new Error('Refusing to bootstrap Aymero Production.')
}
if (!/^[a-z]{20}$/.test(projectRef)) {
  throw new Error('A canonical 20-character Supabase project ref is required.')
}

function run(command, args, { capture = false } = {}) {
  const result = spawnSync(command, args, {
    cwd: repositoryRoot,
    encoding: capture ? 'utf8' : undefined,
    stdio: capture ? 'pipe' : 'inherit',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (capture && result.stderr) process.stderr.write(result.stderr)
    throw new Error(`${command} ${args.join(' ')} exited ${result.status}.`)
  }
  return capture ? String(result.stdout || '') : ''
}

function runSupabaseJson(args) {
  const output = run('supabase', [...args, '--output-format', 'json'], { capture: true })
  return JSON.parse(output.trim())
}

function assertTarget() {
  const response = runSupabaseJson(['projects', 'list'])
  const projects = Array.isArray(response) ? response : response.projects
  const target = projects?.find((project) => project.ref === projectRef)
  if (!target || target.name !== expectedProjectName) {
    throw new Error(`Project ref/name mismatch for ${projectRef}; refusing to write.`)
  }
  if (target.ref === manifest.productionProjectRef) {
    throw new Error('Resolved target is Aymero Production; refusing to write.')
  }
  process.stdout.write(`Verified non-production target: ${target.name} (${target.ref})\n`)
}

function assertEmptyApplicationSchema() {
  const response = runSupabaseJson(['inspect', 'db', 'table-stats', '--project-ref', projectRef])
  const rows = Array.isArray(response) ? response : response.rows
  if (!Array.isArray(rows) || rows.length !== 0) {
    throw new Error('Target contains public application tables; greenfield bootstrap refused.')
  }
}

const baselineSource = run(
  'git',
  ['show', `${manifest.baseline.sourceCommit}:${manifest.baseline.sourcePath}`],
  { capture: true },
)
const baselineHash = createHash('sha256').update(baselineSource).digest('hex')
if (baselineHash !== manifest.baseline.sha256) {
  throw new Error('Historical baseline hash mismatch; refusing to bootstrap.')
}

const executableBaseline = baselineSource
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*--.*$/gm, '')
if (/^\s*(?:insert|update|delete|copy)\b/im.test(executableBaseline)) {
  throw new Error('Historical baseline contains row-data SQL; refusing to bootstrap.')
}

assertTarget()
assertEmptyApplicationSchema()

const temporaryRoot = mkdtempSync(join(tmpdir(), 'aymero-greenfield-'))
const temporarySupabase = join(temporaryRoot, 'supabase')
const temporaryMigrations = join(temporarySupabase, 'migrations')

try {
  mkdirSync(temporaryMigrations, { recursive: true })
  writeFileSync(join(temporarySupabase, 'config.toml'), '[db]\nmajor_version = 17\n')

  const guard = `-- EMPTY NON-PRODUCTION DATABASES ONLY. NEVER RUN AGAINST AYMERO PRODUCTION.\n`
    + `-- Schema only: no customer, contractor, auth, billing, or Stripe rows.\n\n`
    + `do $aymero_bootstrap$\n`
    + `begin\n`
    + `  if to_regclass('public.contractors') is not null\n`
    + `     or to_regclass('public.estimates') is not null\n`
    + `     or to_regclass('public.billing_customers') is not null then\n`
    + `    raise exception 'Aymero application schema already exists; bootstrap refused.';\n`
    + `  end if;\n`
    + `end\n`
    + `$aymero_bootstrap$;\n\n`
  writeFileSync(
    join(temporaryMigrations, `${manifest.baseline.temporaryLedgerVersion}_aymero_historical_baseline.sql`),
    `${guard}${baselineSource}\n`,
  )

  for (const filename of manifest.reusableHistorical) {
    copyFileSync(
      join(repositoryRoot, 'supabase/migrations', filename),
      join(temporaryMigrations, filename),
    )
  }

  assertTarget()
  run('supabase', [
    'db', 'push',
    '--project-ref', projectRef,
    '--workdir', temporaryRoot,
    '--include-all',
    '--skip-vault',
    '--yes',
  ])

  assertTarget()
  run('supabase', [
    'migration', 'repair', manifest.baseline.temporaryLedgerVersion,
    '--status', 'reverted',
    '--project-ref', projectRef,
  ])

  assertTarget()
  run('supabase', [
    'migration', 'repair',
    ...manifest.productionOnlyHistorical.map(({ version }) => version),
    '--status', 'applied',
    '--project-ref', projectRef,
  ])

  process.stdout.write(
    'Historical baseline and reusable migrations applied. '
    + 'Production-only data migrations were ledger-reconciled without executing their SQL.\n',
  )
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
