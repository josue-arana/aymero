export const COLLECTION_STATUS = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  REFRESHING: 'refreshing',
  LOADED: 'loaded',
})

export function isCollectionInitialLoading(status) {
  return status === COLLECTION_STATUS.IDLE || status === COLLECTION_STATUS.LOADING
}
