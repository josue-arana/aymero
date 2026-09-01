import { spawnSync } from 'node:child_process'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const productionRef = 'qespkkmxaxzsfqrlghev'
const verificationVersion = '99999999999998'
const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function readArgument(name) {
  const index = process.argv.indexOf(name)
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : ''
}

const projectRef = readArgument('--project-ref')
const expectedProjectName = readArgument('--expected-project-name')
if (!projectRef || !expectedProjectName || projectRef === productionRef) {
  throw new Error('A verified non-production project ref and name are required.')
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

function assertTarget() {
  const response = JSON.parse(run(
    'supabase',
    ['projects', 'list', '--output-format', 'json'],
    { capture: true },
  ).trim())
  const projects = Array.isArray(response) ? response : response.projects
  const target = projects?.find((project) => project.ref === projectRef)
  if (!target || target.name !== expectedProjectName || target.ref === productionRef) {
    throw new Error('Staging project identity mismatch; verification refused.')
  }
  process.stdout.write(`Verified non-production target: ${target.name} (${target.ref})\n`)
}

const verificationSql = `-- Staging-only, assertion-only verification. No persistent schema or row mutations.\n
do $aymero_verify$\n
declare\n
  expected_tables text[] := array[\n
    'billing_customers', 'billing_subscriptions', 'billing_webhook_events',\n
    'clients', 'company_settings', 'contractor_members', 'contractors',\n
    'contracts', 'estimates', 'events', 'invoices', 'leads', 'payments',\n
    'project_photos', 'projects'\n
  ];\n
  expected_rls_tables text[] := array[\n
    'billing_customers', 'billing_subscriptions', 'billing_webhook_events',\n
    'contracts', 'estimates', 'events', 'invoices', 'payments', 'project_photos'\n
  ];\n
  table_name_to_check text;\n
  populated_table text;\n
begin\n
  foreach table_name_to_check in array expected_tables loop\n
    if to_regclass(format('public.%I', table_name_to_check)) is null then\n
      raise exception 'Missing expected Aymero table: %', table_name_to_check;\n
    end if;\n
  end loop;\n
\n
  foreach table_name_to_check in array expected_rls_tables loop\n
    if not (\n
      select relrowsecurity\n
      from pg_class\n
      where oid = format('public.%I', table_name_to_check)::regclass\n
    ) then\n
      raise exception 'RLS is not enabled for expected table: %', table_name_to_check;\n
    end if;\n
  end loop;\n
\n
  if not exists (\n
    select 1\n
    from information_schema.columns\n
    where table_schema = 'public'\n
      and table_name = 'estimates'\n
      and column_name = 'scope_assistant_state'\n
      and data_type = 'jsonb'\n
      and is_nullable = 'NO'\n
      and column_default = '''{}''::jsonb'\n
  ) then\n
    raise exception 'Invalid estimates.scope_assistant_state column metadata.';\n
  end if;\n
\n
  if not exists (\n
    select 1\n
    from pg_constraint as constraint_record\n
    join pg_class as table_record on table_record.oid = constraint_record.conrelid\n
    join pg_namespace as schema_record on schema_record.oid = table_record.relnamespace\n
    where schema_record.nspname = 'public'\n
      and table_record.relname = 'estimates'\n
      and constraint_record.conname = 'estimates_scope_assistant_state_object_check'\n
      and pg_get_constraintdef(constraint_record.oid) ilike '%jsonb_typeof(scope_assistant_state)%object%'\n
  ) then\n
    raise exception 'Missing Scope Assistant JSON-object constraint.';\n
  end if;\n
\n
  for populated_table in\n
    select table_name\n
    from (\n
      select 'contractors' as table_name where exists (select 1 from public.contractors)\n
      union all select 'contractor_members' where exists (select 1 from public.contractor_members)\n
      union all select 'clients' where exists (select 1 from public.clients)\n
      union all select 'leads' where exists (select 1 from public.leads)\n
      union all select 'projects' where exists (select 1 from public.projects)\n
      union all select 'estimates' where exists (select 1 from public.estimates)\n
      union all select 'billing_customers' where exists (select 1 from public.billing_customers)\n
      union all select 'billing_subscriptions' where exists (select 1 from public.billing_subscriptions)\n
      union all select 'billing_webhook_events' where exists (select 1 from public.billing_webhook_events)\n
    ) as populated\n
  loop\n
    raise exception 'Unexpected row data in staging table: %', populated_table;\n
  end loop;\n
\n
  if not exists (\n
    select 1\n
    from storage.buckets\n
    where id = 'project-photos'\n
      and name = 'project-photos'\n
      and public = false\n
  ) then\n
    raise exception 'Private project-photos storage bucket is missing.';\n
  end if;\n
\n
  if has_table_privilege('anon', 'public.billing_customers', 'SELECT')\n
     or has_table_privilege('anon', 'public.billing_subscriptions', 'SELECT')\n
     or has_table_privilege('anon', 'public.billing_webhook_events', 'SELECT')\n
     or has_table_privilege('authenticated', 'public.billing_webhook_events', 'SELECT') then\n
    raise exception 'Billing table privilege boundary is weaker than expected.';\n
  end if;\n
\n
  if has_function_privilege('public', 'public.complete_beta_contractor_onboarding(text,text,text,text,text)', 'EXECUTE')\n
     or has_function_privilege('anon', 'public.complete_beta_contractor_onboarding(text,text,text,text,text)', 'EXECUTE')\n
     or not has_function_privilege('authenticated', 'public.complete_beta_contractor_onboarding(text,text,text,text,text)', 'EXECUTE')\n
     or not has_function_privilege('service_role', 'public.complete_beta_contractor_onboarding(text,text,text,text,text)', 'EXECUTE') then\n
    raise exception 'Onboarding function ACL does not match the reconciled baseline.';\n
  end if;\n
end\n
$aymero_verify$;\n`

assertTarget()
const temporaryRoot = mkdtempSync(join(tmpdir(), 'aymero-staging-verify-'))
const temporarySupabase = join(temporaryRoot, 'supabase')
const temporaryMigrations = join(temporarySupabase, 'migrations')

try {
  mkdirSync(temporaryMigrations, { recursive: true })
  writeFileSync(join(temporarySupabase, 'config.toml'), '[db]\nmajor_version = 17\n')
  for (const filename of readdirSync(join(repositoryRoot, 'supabase/migrations'))) {
    if (!filename.endsWith('.sql')) continue
    copyFileSync(
      join(repositoryRoot, 'supabase/migrations', filename),
      join(temporaryMigrations, filename),
    )
  }
  writeFileSync(
    join(temporaryMigrations, `${verificationVersion}_verify_staging_schema.sql`),
    verificationSql,
  )

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
    'migration', 'repair', verificationVersion,
    '--status', 'reverted',
    '--project-ref', projectRef,
  ])
  console.log('Aymero staging schema assertions passed; temporary verification ledger entry removed.')
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true })
}
