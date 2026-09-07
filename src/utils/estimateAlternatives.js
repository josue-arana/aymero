function normalizeId(value) {
  return typeof value === 'string' ? value.trim() : ''
}

function readProjectId(estimate = {}) {
  return normalizeId(estimate?.projectId || estimate?.project_id)
}

function readAmount(estimate = {}) {
  const amount = Number(estimate?.total ?? estimate?.totalAmount ?? estimate?.amount ?? 0)
  return Number.isFinite(amount) ? amount : 0
}

/**
 * Summarizes only unambiguous estimate values. Alternatives for the same
 * project are deliberately excluded until a selected estimate is provided.
 */
export function sumUnambiguousEstimateValues(estimates = [], projects = []) {
  const activeEstimates = estimates.filter((estimate) => !estimate?.isArchived && !estimate?.archivedAt && !estimate?.archived_at)
  const projectMap = new Map(projects.map((project) => [normalizeId(project?.id || project?.projectId || project?.project_id), project]))
  const grouped = new Map()

  activeEstimates.forEach((estimate) => {
    const projectId = readProjectId(estimate)
    const key = projectId || `estimate:${normalizeId(estimate?.id)}`
    const rows = grouped.get(key) || []
    rows.push(estimate)
    grouped.set(key, rows)
  })

  return Array.from(grouped.entries()).reduce((sum, [key, rows]) => {
    if (rows.length === 1) return sum + readAmount(rows[0])

    const project = projectMap.get(key)
    const selectedId = normalizeId(project?.selectedEstimateId || project?.selected_estimate_id)
    const selected = selectedId ? rows.find((estimate) => normalizeId(estimate?.id) === selectedId) : null
    return selected ? sum + readAmount(selected) : sum
  }, 0)
}

