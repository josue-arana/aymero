export function buildProjectCompletionUpdate(completedAt = new Date().toISOString()) {
  return {
    status: 'Completed',
    projectStatus: 'Completed',
    completedAt,
    completed_at: completedAt,
  }
}

export function isProjectCompleted(project = {}) {
  const status = String(project?.projectStatus || project?.status || '').trim().toLowerCase()
  return status === 'completed' || Boolean(project?.completedAt || project?.completed_at)
}

