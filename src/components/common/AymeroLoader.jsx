import { BrandLogo } from './BrandLogo'
import './aymeroLoader.css'

const SUPPORTED_VARIANTS = new Set(['page', 'section', 'inline', 'document'])

export function AymeroLoader({
  variant = 'section',
  title = '',
  message = '',
  accessibleLabel,
  tone = 'light',
  className = '',
}) {
  const resolvedVariant = SUPPORTED_VARIANTS.has(variant) ? variant : 'section'
  const label = accessibleLabel || title || message

  return (
    <div
      className={`aymero-loader aymero-loader--${resolvedVariant} aymero-loader--${tone} ${className}`.trim()}
      role="status"
      aria-live="polite"
      aria-label={label || undefined}
      data-aymero-loader={resolvedVariant}
    >
      <span className="aymero-loader__visual" aria-hidden="true">
        <svg className="aymero-loader__ring" viewBox="0 0 64 64" focusable="false">
          <circle className="aymero-loader__ring-track" cx="32" cy="32" r="27" />
          <path className="aymero-loader__ring-accent" d="M 10.2 48 A 27 27 0 0 1 45.5 8.6" />
        </svg>
        <span className="aymero-loader__orbit">
          <span className="aymero-loader__dot" />
        </span>
        <BrandLogo
          variant="icon"
          tone={tone === 'dark' ? 'light' : 'dark'}
          alt=""
          className="aymero-loader__mark"
        />
      </span>

      {resolvedVariant !== 'inline' && (title || message) ? (
        <span className="aymero-loader__copy" aria-hidden="true">
          {title ? <span className="aymero-loader__title">{title}</span> : null}
          {message ? <span className="aymero-loader__message">{message}</span> : null}
        </span>
      ) : null}
    </div>
  )
}
