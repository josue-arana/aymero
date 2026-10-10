export function formatEstimateDocumentDate(value) {
  const parsedDate = value ? new Date(value) : new Date()

  if (Number.isNaN(parsedDate.getTime())) {
    return String(value || '')
  }

  return parsedDate.toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  })
}

export default formatEstimateDocumentDate
