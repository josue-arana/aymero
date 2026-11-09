import { useEffect, useRef, useState } from 'react'
import { CalendarDays } from 'lucide-react'
import { formatInvoiceDateInput, invoiceDateFromInput } from '../../utils/invoiceDate'

export function InvoiceDateInput({ id, label, value, onChange, required = false, min, error, inputRef, pickerLabel = '', className = '' }) {
  const [displayValue, setDisplayValue] = useState(() => formatInvoiceDateInput(value))
  const pickerRef = useRef(null)

  useEffect(() => {
    setDisplayValue(formatInvoiceDateInput(value))
  }, [value])

  function commitDisplayValue(nextValue) {
    setDisplayValue(nextValue)
    onChange(invoiceDateFromInput(nextValue))
  }

  function handleTextChange(nextValue) {
    setDisplayValue(nextValue)
    const parsed = invoiceDateFromInput(nextValue)
    if (parsed) onChange(parsed)
  }

  return (
    <label htmlFor={id} className={`block min-w-0 text-sm font-bold text-slate-700 ${className}`.trim()}>
      <span className="mb-2 block">{label}</span>
      <span className="relative block">
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="MM/DD/YYYY"
          value={displayValue}
          onChange={(event) => handleTextChange(event.target.value)}
          onBlur={(event) => commitDisplayValue(event.target.value)}
          required={required}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 pr-12 text-sm font-semibold text-slate-900 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <button type="button" onClick={() => { try { pickerRef.current?.showPicker?.() } catch { pickerRef.current?.click() } }} aria-label={pickerLabel || label} className="absolute inset-y-0 right-0 z-10 inline-flex w-11 items-center justify-center rounded-r-xl text-slate-500 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500">
          <CalendarDays className="h-4 w-4" aria-hidden="true" />
        </button>
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-label={label}
          value={value || ''}
          min={min}
          onChange={(event) => commitDisplayValue(formatInvoiceDateInput(event.target.value))}
          className="pointer-events-none absolute right-0 top-1/2 h-px w-px -translate-y-1/2 opacity-0"
        />
      </span>
      {error ? <span id={`${id}-error`} role="alert" className="mt-2 block text-xs font-semibold text-red-700">{error}</span> : null}
    </label>
  )
}
