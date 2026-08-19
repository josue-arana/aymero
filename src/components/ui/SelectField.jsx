import { ChevronDown } from 'lucide-react'

export function SelectField({ className = '', containerClassName = '', children, ...props }) {
  return (
    <div className={`relative min-w-0 ${containerClassName}`}>
      <select
        {...props}
        className={`min-h-12 w-full appearance-none rounded-2xl border border-slate-200 bg-white px-4 py-3 pr-10 text-sm font-bold text-slate-700 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:opacity-80 ${className}`}
      >
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
    </div>
  )
}
