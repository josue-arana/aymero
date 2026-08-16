import { PaginatedEstimatePreview } from '../estimates/PaginatedEstimatePreview'

const contractTranslationKeys = {
  pageOf: 'contractPageOf',
  paginationLabel: 'contractPreviewPagination',
  preparing: 'preparingContractPreview',
  updating: 'updatingContractPreview',
  unavailable: 'contractPreviewUnavailable',
}

export function PaginatedContractPreview(props) {
  return <PaginatedEstimatePreview {...props} translationKeys={contractTranslationKeys} />
}

export default PaginatedContractPreview
