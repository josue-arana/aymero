import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  createAiScopeEvaluationPlan,
  renderAiScopeEvaluationMarkdown,
  runAiScopeEvaluationBatch,
} from './lib/aiScopeEvaluationHarness.mjs'

function readFixtures() {
  const path = fileURLToPath(new URL('./fixtures/ai-scope-controlled-pipeline-cases.json', import.meta.url))
  return JSON.parse(readFileSync(path, 'utf8'))
}

function parseArguments(argv) {
  const options = { batch: '', execute: false, requestCap: null, outputDir: '' }
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--execute') options.execute = true
    else if (argument === '--batch') options.batch = argv[++index] || ''
    else if (argument === '--request-cap') options.requestCap = Number(argv[++index])
    else if (argument === '--output-dir') options.outputDir = argv[++index] || ''
    else if (argument === '--help') options.help = true
    else throw new Error(`Unknown argument: ${argument}`)
  }
  return options
}

function printUsage() {
  console.log([
    'Usage:',
    '  npm run evaluate:ai-scope-pipelines -- --batch 1 --request-cap 10',
    '  npm run evaluate:ai-scope-pipelines -- --batch 1 --request-cap 10 --execute',
    '',
    'Without --execute, the command performs a zero-request readiness check.',
    'Execution requires OPENAI_API_KEY and AI_SCOPE_EVALUATION_MODEL.',
  ].join('\n'))
}

function defaultOutputDirectory(batch) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  return join(tmpdir(), 'aymero-ai-scope-evaluation', `batch-${batch}-${timestamp}`)
}

function saveReport(report, outputDir) {
  const normalizedDirectory = resolve(outputDir)
  mkdirSync(normalizedDirectory, { recursive: true, mode: 0o700 })
  const jsonPath = join(normalizedDirectory, 'evaluation-report.json')
  const markdownPath = join(normalizedDirectory, 'evaluation-report.md')
  writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
  writeFileSync(markdownPath, `${renderAiScopeEvaluationMarkdown(report)}\n`, { encoding: 'utf8', mode: 0o600 })
  return { jsonPath, markdownPath }
}

async function main() {
  const options = parseArguments(process.argv.slice(2))
  if (options.help) {
    printUsage()
    return
  }

  const fixtures = readFixtures()
  const plan = createAiScopeEvaluationPlan({ batch: options.batch, fixtures })
  console.log(`Evaluation batch: ${plan.batch}`)
  console.log(`Cases: ${plan.caseIds.join(', ')}`)
  console.log(`Planned provider requests: ${plan.expectedRequests}`)
  console.log('Retries: disabled')
  console.log(`Historical sources ready: ${plan.sourcesReady ? 'yes' : 'no'}`)
  for (const blocked of plan.blockedSources) {
    console.log(`Blocked source: ${blocked.id} (${blocked.sourceStatus})`)
  }

  if (!options.execute) {
    console.log('Dry readiness check complete. No provider request was made.')
    return
  }

  const outputDir = options.outputDir || defaultOutputDirectory(plan.batch)
  let report
  try {
    report = await runAiScopeEvaluationBatch({
      batch: plan.batch,
      fixtures,
      model: process.env.AI_SCOPE_EVALUATION_MODEL,
      apiKey: process.env.OPENAI_API_KEY,
      requestCap: options.requestCap,
    })
  } catch (error) {
    if (error?.evaluationReport) {
      const paths = saveReport(error.evaluationReport, outputDir)
      console.error(`Evaluation stopped: ${error.evaluationReport.error?.code || 'AI_SCOPE_EVALUATION_FAILED'}`)
      console.error(`Partial JSON report: ${paths.jsonPath}`)
      console.error(`Partial Markdown report: ${paths.markdownPath}`)
    } else {
      console.error(`Evaluation did not start: ${error?.code || error?.message || 'AI_SCOPE_EVALUATION_FAILED'}`)
    }
    process.exitCode = 1
    return
  }

  const paths = saveReport(report, outputDir)
  console.log(`Completed provider requests: ${report.actualRequests}`)
  console.log(`JSON report: ${paths.jsonPath}`)
  console.log(`Markdown report: ${paths.markdownPath}`)
}

main().catch((error) => {
  console.error(`Evaluation runner failed: ${error?.code || error?.message || 'AI_SCOPE_EVALUATION_FAILED'}`)
  process.exitCode = 1
})
