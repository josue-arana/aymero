import { useEffect, useRef, useState } from 'react'
import { ScaledDocumentPreview } from '../common/ScaledDocumentPreview'
import {
  ESTIMATE_DOCUMENT_SOURCE_PADDING,
  ESTIMATE_DOCUMENT_SOURCE_WIDTH,
  getEstimatePaginationModel,
  waitForEstimateDocumentAssets,
} from '../../utils/estimatePagination'

const paginationDebounceMs = 180

const defaultTranslationKeys = {
  pageCountSingle: 'estimatePageCountSingle',
  pageCountMultiple: 'estimatePageCountMultiple',
  pageOf: 'estimatePageOf',
  paginationLabel: 'estimatePreviewPagination',
  preparing: 'preparingEstimatePreview',
  updating: 'updatingEstimatePreview',
  unavailable: 'estimatePreviewUnavailable',
}

function getPageCountLabel(pageCount, t, translationKeys) {
  return pageCount === 1
    ? t(translationKeys.pageCountSingle, { count: pageCount })
    : t(translationKeys.pageCountMultiple, { count: pageCount })
}

export function PaginatedEstimatePreview({
  children,
  t,
  uiT = t,
  sourceWidth = ESTIMATE_DOCUMENT_SOURCE_WIDTH,
  sourcePadding = ESTIMATE_DOCUMENT_SOURCE_PADDING,
  className = '',
  translationKeys = defaultTranslationKeys,
}) {
  const chromeT = uiT || t
  const sourceRef = useRef(null)
  const timerRef = useRef(null)
  const [snapshot, setSnapshot] = useState(null)
  const [isPaginating, setIsPaginating] = useState(true)
  const [paginationFailed, setPaginationFailed] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const sourceNode = sourceRef.current
    if (!sourceNode) return undefined

    let cancelled = false
    let calculationVersion = 0

    const calculatePagination = () => {
      window.clearTimeout(timerRef.current)
      calculationVersion += 1
      const scheduledVersion = calculationVersion
      setIsPaginating(true)
      setPaginationFailed(false)

      timerRef.current = window.setTimeout(async () => {
        try {
          await waitForEstimateDocumentAssets(sourceNode)
          if (cancelled || scheduledVersion !== calculationVersion) return

          const model = getEstimatePaginationModel(sourceNode)
          if (!model?.pageCount) {
            throw new Error('Estimate preview pagination returned no pages.')
          }

          setSnapshot({ children, model })
          setPaginationFailed(false)
        } catch {
          if (!cancelled && scheduledVersion === calculationVersion) setPaginationFailed(true)
        } finally {
          if (!cancelled && scheduledVersion === calculationVersion) setIsPaginating(false)
        }
      }, paginationDebounceMs)
    }

    calculatePagination()

    const resizeObserver = new ResizeObserver(calculatePagination)
    resizeObserver.observe(sourceNode)

    return () => {
      cancelled = true
      window.clearTimeout(timerRef.current)
      resizeObserver.disconnect()
    }
  }, [children, sourcePadding, sourceWidth])

  const pageCount = snapshot?.model?.pageCount || 0

  return (
    <div
      className={`relative min-w-0 ${className}`.trim()}
      aria-busy={isPaginating}
      aria-label={chromeT(translationKeys.paginationLabel)}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none fixed left-[-200vw] top-0 -z-50 opacity-0"
      >
        <div
          ref={sourceRef}
          data-estimate-pagination-source="true"
          style={{
            width: `${sourceWidth}px`,
            maxWidth: 'none',
            backgroundColor: '#ffffff',
            color: '#0f172a',
            padding: `${sourcePadding}px`,
            boxSizing: 'border-box',
          }}
        >
          {children}
        </div>
      </div>

      <div className="mb-3 flex min-h-6 items-center justify-end gap-2 px-1 text-xs font-semibold text-slate-500">
        {pageCount ? (
          <span aria-live="polite">{getPageCountLabel(pageCount, chromeT, translationKeys)}</span>
        ) : null}
        {isPaginating ? (
          <span role="status" className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-blue-500" />
            {chromeT(translationKeys.updating)}
          </span>
        ) : null}
      </div>

      {!snapshot && isPaginating ? (
        <div role="status" className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="aspect-[8.5/11] animate-pulse bg-gradient-to-br from-white via-slate-50 to-slate-100" />
          <span className="sr-only">{chromeT(translationKeys.preparing)}</span>
        </div>
      ) : null}

      {paginationFailed && !snapshot ? (
        <div role="alert" className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-5 text-center text-sm font-semibold text-amber-800">
          {chromeT(translationKeys.unavailable)}
        </div>
      ) : null}

      {snapshot ? (
        <>
          <div className="sr-only">{snapshot.children}</div>
          <div className="space-y-5">
            {snapshot.model.pages.map((page) => (
              <section
                key={`${page.start}-${page.end}`}
                role="group"
                aria-label={chromeT(translationKeys.pageOf, {
                  page: page.number,
                  count: snapshot.model.pageCount,
                })}
                className="min-w-0"
              >
                <p className="mb-2 text-center text-[11px] font-semibold text-slate-500">
                  {chromeT(translationKeys.pageOf, {
                    page: page.number,
                    count: snapshot.model.pageCount,
                  })}
                </p>
                <ScaledDocumentPreview pageWidth={snapshot.model.paperWidth} pagePadding={0}>
                  <div
                    aria-hidden="true"
                    style={{
                      position: 'relative',
                      width: `${snapshot.model.paperWidth}px`,
                      height: `${snapshot.model.paperHeight}px`,
                      overflow: 'hidden',
                      border: '1px solid #e2e8f0',
                      backgroundColor: '#ffffff',
                      boxShadow: '0 12px 30px rgba(15, 23, 42, 0.10)',
                      boxSizing: 'border-box',
                    }}
                  >
                    <div
                      style={{
                        position: 'absolute',
                        top: `${snapshot.model.paperMargin}px`,
                        left: `${snapshot.model.paperMargin}px`,
                        width: `${snapshot.model.elementWidth}px`,
                        height: `${page.height}px`,
                        overflow: 'hidden',
                      }}
                    >
                      <div
                        style={{
                          width: `${snapshot.model.elementWidth}px`,
                          transform: `translateY(-${page.start}px)`,
                          transformOrigin: 'top left',
                        }}
                      >
                        <div
                          style={{
                            width: `${sourceWidth}px`,
                            maxWidth: 'none',
                            backgroundColor: '#ffffff',
                            color: '#0f172a',
                            padding: `${sourcePadding}px`,
                            boxSizing: 'border-box',
                          }}
                        >
                          {snapshot.children}
                        </div>
                      </div>
                    </div>
                  </div>
                </ScaledDocumentPreview>
              </section>
            ))}
          </div>
        </>
      ) : null}
    </div>
  )
}

export default PaginatedEstimatePreview
