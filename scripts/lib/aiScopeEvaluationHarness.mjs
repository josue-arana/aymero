import {
  AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS,
  AI_SCOPE_PROMPT_VERSIONS,
  buildAiScopeResponsesRequest,
  buildConstructionAnalysisRequest,
  buildControlledTranslationRequest,
  buildProfessionalScopeRequest,
  normalizeAiScopeProviderUsage,
  parseAiScopeProviderResponse,
  parseConstructionAnalysisResponse,
} from '../../supabase/functions/_shared/aiScopeAssistant.js'
import { requestAiScopeProvider } from '../../supabase/functions/_shared/aiScopeAssistantProvider.js'

export const AI_SCOPE_EVALUATION_BATCHES = Object.freeze({
  '1': Object.freeze(['roof-replacement', 'cabinet-hardware']),
  '2': Object.freeze(['kitchen-quartz', 'kitchen-flooring']),
})

export const AI_SCOPE_EVALUATION_CALLS_PER_CASE = 5
export const AI_SCOPE_EVALUATION_REQUESTS_PER_BATCH = 10

function requireBatch(batch) {
  const normalized = String(batch || '').trim()
  if (!AI_SCOPE_EVALUATION_BATCHES[normalized]) {
    throw new Error('Select evaluation batch 1 or 2 explicitly.')
  }
  return normalized
}

function safeError(error) {
  return {
    name: String(error?.name || 'Error').slice(0, 100),
    message: String(error?.message || 'Evaluation request failed.').slice(0, 500),
    code: String(error?.code || 'AI_SCOPE_EVALUATION_FAILED').slice(0, 100),
    providerStatus: Number(error?.providerStatus) || null,
  }
}

function roundDuration(value) {
  return Math.round(Number(value) * 100) / 100
}

function mergeWarnings(...groups) {
  return [...new Set(groups.flat().filter((warning) => typeof warning === 'string' && warning.trim()))].slice(0, 5)
}

export function createAiScopeEvaluationPlan({ batch, fixtures } = {}) {
  const normalizedBatch = requireBatch(batch)
  if (!Array.isArray(fixtures)) throw new Error('Evaluation fixtures are required.')
  const fixtureById = new Map(fixtures.map((fixture) => [fixture.id, fixture]))
  const selectedFixtures = AI_SCOPE_EVALUATION_BATCHES[normalizedBatch].map((id) => {
    const fixture = fixtureById.get(id)
    if (!fixture) throw new Error(`Evaluation fixture ${id} is missing.`)
    return fixture
  })
  return {
    batch: normalizedBatch,
    caseIds: selectedFixtures.map(({ id }) => id),
    expectedRequests: selectedFixtures.length * AI_SCOPE_EVALUATION_CALLS_PER_CASE,
    sourcesReady: selectedFixtures.every(({ sourceStatus }) => sourceStatus === 'verbatim_historical'),
    blockedSources: selectedFixtures
      .filter(({ sourceStatus }) => sourceStatus !== 'verbatim_historical')
      .map(({ id, sourceStatus }) => ({ id, sourceStatus })),
    fixtures: selectedFixtures,
  }
}

function assertExecutionConfiguration({ plan, model, apiKey, requestCap }) {
  if (!plan.sourcesReady) {
    const ids = plan.blockedSources.map(({ id }) => id).join(', ')
    const error = new Error(`Verbatim historical source is required before execution: ${ids}.`)
    error.code = 'AI_SCOPE_EVALUATION_SOURCE_BLOCKED'
    throw error
  }
  if (!String(model || '').trim()) {
    const error = new Error('AI_SCOPE_EVALUATION_MODEL must explicitly select the evaluation model.')
    error.code = 'AI_SCOPE_EVALUATION_MODEL_REQUIRED'
    throw error
  }
  if (!String(apiKey || '').trim()) {
    const error = new Error('OPENAI_API_KEY is required for an explicitly authorized evaluation run.')
    error.code = 'AI_SCOPE_EVALUATION_KEY_REQUIRED'
    throw error
  }
  if (!Number.isSafeInteger(Number(requestCap)) || Number(requestCap) !== plan.expectedRequests) {
    const error = new Error(`Request cap must equal the planned ${plan.expectedRequests} requests for batch ${plan.batch}.`)
    error.code = 'AI_SCOPE_EVALUATION_REQUEST_CAP_INVALID'
    throw error
  }
}

export async function runAiScopeEvaluationBatch({
  batch,
  fixtures,
  model,
  apiKey,
  requestCap,
  requestProvider = requestAiScopeProvider,
  clock = () => performance.now(),
  now = () => new Date().toISOString(),
} = {}) {
  const plan = createAiScopeEvaluationPlan({ batch, fixtures })
  assertExecutionConfiguration({ plan, model, apiKey, requestCap })

  let requestCount = 0
  const report = {
    schemaVersion: 1,
    batch: plan.batch,
    caseIds: plan.caseIds,
    model: String(model).trim(),
    startedAt: now(),
    completedAt: null,
    expectedRequests: plan.expectedRequests,
    actualRequests: 0,
    retries: 0,
    pricing: null,
    instructionVersions: {
      legacyProfessionalize: AI_SCOPE_PROMPT_VERSIONS.professionalize,
      legacyTranslate: AI_SCOPE_PROMPT_VERSIONS.translate,
      controlledPipeline: AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS.pipeline,
      constructionAnalysis: AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS.constructionAnalysis,
      professionalScope: AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS.professionalize,
      controlledTranslate: AI_SCOPE_CONTROLLED_PIPELINE_VERSIONS.translate,
    },
    cases: [],
    error: null,
  }

  const invoke = async (stage, requestBody, parse) => {
    if (requestCount >= Number(requestCap)) {
      const error = new Error(`Evaluation request cap of ${requestCap} was reached before ${stage}.`)
      error.code = 'AI_SCOPE_EVALUATION_REQUEST_CAP_REACHED'
      throw error
    }
    requestCount += 1
    report.actualRequests = requestCount
    const startedAt = clock()
    const providerResponse = await requestProvider({ apiKey, requestBody })
    return {
      result: parse(providerResponse),
      usage: normalizeAiScopeProviderUsage(providerResponse?.usage),
      durationMs: roundDuration(clock() - startedAt),
    }
  }

  try {
    for (const fixture of plan.fixtures) {
      const originalSource = fixture.originalSource
      const caseResult = {
        id: fixture.id,
        sourceLanguage: fixture.sourceLanguage,
        targetLanguage: fixture.targetLanguage,
        sourceStatus: fixture.sourceStatus,
        originalSource,
        laterConfirmedFacts: fixture.laterConfirmedFacts,
        evaluationAssertions: fixture.evaluationAssertions,
        legacy: { professionalization: null, translation: null },
        controlled: { interpretation: null, professionalization: null, translation: null },
      }
      report.cases.push(caseResult)

      const legacyProfessionalizationRequest = buildAiScopeResponsesRequest({
        action: 'professionalize',
        model,
        source: originalSource,
        sourceLanguage: fixture.sourceLanguage,
      })
      const legacyProfessionalization = await invoke(
        `${fixture.id}:legacy-professionalization`,
        legacyProfessionalizationRequest,
        (response) => parseAiScopeProviderResponse('professionalize', response),
      )
      caseResult.legacy.professionalization = legacyProfessionalization

      const interpretationRequest = buildConstructionAnalysisRequest({
        model,
        source: originalSource,
        sourceLanguage: fixture.sourceLanguage,
      })
      const controlledInterpretation = await invoke(
        `${fixture.id}:controlled-interpretation`,
        interpretationRequest,
        (response) => parseConstructionAnalysisResponse(response, fixture.sourceLanguage),
      )
      caseResult.controlled.interpretation = controlledInterpretation

      const writingRequest = buildProfessionalScopeRequest({
        model,
        interpretation: controlledInterpretation.result,
        sourceLanguage: fixture.sourceLanguage,
      })
      const controlledProfessionalization = await invoke(
        `${fixture.id}:controlled-professionalization`,
        writingRequest,
        (response) => parseAiScopeProviderResponse('professionalize', response),
      )
      controlledProfessionalization.result.reviewWarnings = mergeWarnings(
        controlledInterpretation.result.reviewWarnings,
        controlledProfessionalization.result.reviewWarnings,
      )
      caseResult.controlled.professionalization = controlledProfessionalization

      const legacyTranslationRequest = buildAiScopeResponsesRequest({
        action: 'translate',
        model,
        source: legacyProfessionalization.result.scope,
        sourceLanguage: fixture.sourceLanguage,
        targetLanguage: fixture.targetLanguage,
      })
      caseResult.legacy.translation = await invoke(
        `${fixture.id}:legacy-translation`,
        legacyTranslationRequest,
        (response) => parseAiScopeProviderResponse('translate', response),
      )

      const controlledTranslationRequest = buildControlledTranslationRequest({
        model,
        source: controlledProfessionalization.result.scope,
        sourceLanguage: fixture.sourceLanguage,
        targetLanguage: fixture.targetLanguage,
      })
      caseResult.controlled.translation = await invoke(
        `${fixture.id}:controlled-translation`,
        controlledTranslationRequest,
        (response) => parseAiScopeProviderResponse('translate', response),
      )
    }
    report.completedAt = now()
    return report
  } catch (error) {
    report.completedAt = now()
    report.error = safeError(error)
    error.evaluationReport = report
    throw error
  }
}

function renderUsage(usage) {
  if (!usage) return 'Unavailable'
  return `${usage.inputTokens} input / ${usage.outputTokens} output / ${usage.totalTokens} total tokens`
}

function renderStage(title, stage, resultKey = 'scope') {
  if (!stage) return `### ${title}\n\nNot executed.\n`
  const output = resultKey === 'interpretation'
    ? `\`\`\`json\n${JSON.stringify(stage.result, null, 2)}\n\`\`\``
    : stage.result[resultKey]
  const warnings = Array.isArray(stage.result.reviewWarnings) && stage.result.reviewWarnings.length
    ? `\n\nReview warnings:\n${stage.result.reviewWarnings.map((warning) => `- ${warning}`).join('\n')}`
    : ''
  return `### ${title}\n\n${output}${warnings}\n\nUsage: ${renderUsage(stage.usage)}  \nLatency: ${stage.durationMs} ms\n`
}

export function renderAiScopeEvaluationMarkdown(report) {
  const sections = [
    '# Aymero AI Scope Evaluation',
    '',
    `Batch: ${report.batch}`,
    `Model: ${report.model}`,
    `Requests: ${report.actualRequests}/${report.expectedRequests}`,
    'Retries: 0',
    'Estimated cost: Not calculated; verified model pricing was not configured.',
    '',
  ]
  for (const item of report.cases) {
    sections.push(
      `## ${item.id}`,
      '',
      '### Original contractor description',
      '',
      item.originalSource,
      '',
      '### Later confirmed facts (not supplied to either model pipeline)',
      '',
      item.laterConfirmedFacts.length ? `\`\`\`json\n${JSON.stringify(item.laterConfirmedFacts, null, 2)}\n\`\`\`` : 'None.',
      '',
      renderStage('Legacy Spanish output', item.legacy.professionalization),
      renderStage('Controlled interpretation', item.controlled.interpretation, 'interpretation'),
      renderStage('Controlled Spanish output', item.controlled.professionalization),
      renderStage('Legacy English output', item.legacy.translation),
      renderStage('Controlled English output', item.controlled.translation),
      '### Evaluation assertions',
      '',
      `\`\`\`json\n${JSON.stringify(item.evaluationAssertions, null, 2)}\n\`\`\``,
      '',
    )
  }
  if (report.error) sections.push('## Run error', '', `\`\`\`json\n${JSON.stringify(report.error, null, 2)}\n\`\`\``)
  return sections.join('\n')
}
