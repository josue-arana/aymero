const nextActionToHeroAction = {
  'review-contract': 'review-contract',
  'view-invoice': 'view-invoice',
  'view-schedule': 'view-schedule',
  'schedule-job': 'schedule-job',
  'upload-photos': 'upload-photos',
}

export function resolveProjectHeroActionIds({
  nextActionId = '',
  projectIsArchived = false,
  projectIsCompleted = false,
  isPaidInFull = false,
} = {}) {
  if (projectIsArchived) return [{ id: 'edit', primary: false }]

  const primaryId = nextActionToHeroAction[nextActionId] || ''
  const secondaryIds = projectIsCompleted
    ? ['record-payment', 'upload-photos', 'edit']
    : ['record-payment', 'schedule-job', 'upload-photos', 'edit']

  return [
    ...(primaryId ? [{ id: primaryId, primary: true }] : []),
    ...secondaryIds
      .filter((id) => id !== primaryId && !(isPaidInFull && id === 'record-payment'))
      .map((id) => ({ id, primary: false })),
  ]
}
