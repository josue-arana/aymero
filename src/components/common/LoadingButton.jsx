import { AymeroLoader } from './AymeroLoader'

/**
 * Presentation-only button wrapper for mutation actions.
 * The caller owns the async state and business logic.
 */
export function LoadingButton({
  loading = false,
  loadingLabel,
  children,
  disabled = false,
  className = '',
  type = 'button',
  ...buttonProps
}) {
  const isDisabled = disabled || loading

  return (
    <button
      {...buttonProps}
      type={type}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className={className}
    >
      <span className="grid min-w-0 place-items-center">
        <span className={`col-start-1 row-start-1 inline-flex min-w-0 items-center justify-center gap-2 ${loading ? 'invisible' : ''}`} aria-hidden={loading || undefined}>
          {children}
        </span>
        {loading ? (
          <span className="col-start-1 row-start-1 inline-flex min-w-0 items-center justify-center gap-2">
            <AymeroLoader variant="inline" accessibleLabel={loadingLabel} />
            <span>{loadingLabel}</span>
          </span>
        ) : null}
      </span>
    </button>
  )
}
