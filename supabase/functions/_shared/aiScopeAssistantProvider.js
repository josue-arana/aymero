import { AiScopeContractError, classifyAiScopeProviderStatus } from './aiScopeAssistant.js'

export const AI_SCOPE_PROVIDER_TIMEOUT_MS = 25000

export async function requestAiScopeProvider({
  apiKey,
  requestBody,
  timeoutMs = AI_SCOPE_PROVIDER_TIMEOUT_MS,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!String(apiKey || '').trim() || !requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new AiScopeContractError('AI provider configuration is unavailable.', 'AI_SCOPE_CONFIGURATION_MISSING')
  }
  if (typeof fetchImpl !== 'function') {
    throw new AiScopeContractError('AI provider transport is unavailable.', 'AI_SCOPE_PROVIDER_UNREACHABLE')
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetchImpl('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const error = new Error(`OpenAI Responses request failed with status ${response.status}.`)
      error.code = classifyAiScopeProviderStatus(response.status)
      error.providerStatus = response.status
      throw error
    }
    return data
  } finally {
    clearTimeout(timeoutId)
  }
}
