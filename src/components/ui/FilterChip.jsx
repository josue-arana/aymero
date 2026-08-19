export function FilterChip({ selected = false, children, className = '', ...props }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      {...props}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center rounded-full px-4 py-2 text-sm font-bold transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 ${selected ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'} ${className}`.trim()}
    >
      {children}
    </button>
  )
}
