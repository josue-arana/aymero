export async function runPersistedScopeAssistantRequest({ persist, afterPersist, request } = {}) {
  if (typeof persist !== 'function' || typeof request !== 'function') {
    throw new Error('Scope Assistant persistence and request callbacks are required.')
  }

  const persistedEstimate = await persist()
  if (!persistedEstimate?.id) {
    return { persistedEstimate: null, response: null, requestInvoked: false }
  }

  await afterPersist?.(persistedEstimate)
  const response = await request(persistedEstimate.id)
  return { persistedEstimate, response, requestInvoked: true }
}
