import { Trash2 } from 'lucide-react'
import { LightweightFormattedTextarea } from '../estimates/LightweightFormattedTextarea'

export function InvoiceLineItemRow({ item, index, itemCount, canRemove, onChange, onRemove, t }) {
  return (
    <div className="grid min-w-0 items-start gap-3 px-4 py-4 text-sm sm:grid-cols-[minmax(0,1fr)_140px]">
      <div className="min-w-0">
        <LightweightFormattedTextarea
          value={item.description || ''}
          onChange={(value) => onChange(index, 'description', value)}
          ariaLabel={`${t('description')} ${index + 1}`}
          placeholder={t('description')}
          rows={3}
          minHeight={104}
          maxHeight={Number.POSITIVE_INFINITY}
          t={t}
          className="px-3 py-3 text-sm leading-6"
        />
        {canRemove ? (
          <button
            type="button"
            disabled={itemCount <= 1}
            onClick={() => onRemove(index)}
            aria-label={`${t('removeItem')} ${index + 1}`}
            className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-semibold text-red-700 transition hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 sm:w-auto"
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
            {t('removeItem')}
          </button>
        ) : null}
      </div>
      <input
        type="text"
        inputMode="decimal"
        value={item.amount}
        onChange={(event) => onChange(index, 'amount', event.target.value)}
        aria-label={`${t('amount')} ${index + 1}`}
        className="h-12 min-w-0 self-start rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right font-bold tabular-nums text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
      />
    </div>
  )
}

export function InvoiceLineItemsEditor({ isEditing, canEditDraftLineItems, lineItems, onChange, onRemove, onAdd, t }) {
  if (!isEditing) return null

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <div className="hidden grid-cols-[minmax(0,1fr)_140px] bg-slate-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-500 sm:grid">
          <span>{t('description')}</span>
          <span className="text-right">{t('amount')}</span>
        </div>
        <div className="divide-y divide-slate-100">
          {lineItems.map((item, index) => (
            <InvoiceLineItemRow
              key={item.id || `invoice-line-${index}`}
              item={item}
              index={index}
              itemCount={lineItems.length}
              canRemove={canEditDraftLineItems}
              onChange={onChange}
              onRemove={onRemove}
              t={t}
            />
          ))}
        </div>
      </div>
      {canEditDraftLineItems ? (
        <button type="button" onClick={onAdd} className="mt-3 rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">{t('addItem')}</button>
      ) : null}
    </>
  )
}
