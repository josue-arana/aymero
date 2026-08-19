import { ArrowLeft } from 'lucide-react'

export function RecordBackButton({ label, onClick, ariaLabel = label, className = '' }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-2 text-sm font-semibold text-slate-600 transition-colors duration-150 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${className}`.trim()}
    >
      <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden="true" />
      <span className="min-w-0 break-words text-left">{label}</span>
    </button>
  )
}
