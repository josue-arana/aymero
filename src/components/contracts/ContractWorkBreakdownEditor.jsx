import { LightweightFormattedTextarea } from '../estimates/LightweightFormattedTextarea'
import { SelectField } from '../ui/SelectField'
import { currency } from '../../utils/formatters'
import {
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_MATERIALS_INCLUDED,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
} from '../../utils/estimateDocument'
import { normalizeContractWorkBreakdown } from '../../utils/contractDocument'

function getMaterialsStatus(item = {}) {
  if (item.materialsStatus) return item.materialsStatus
  if (item.materialsIncluded === true) return ESTIMATE_MATERIALS_INCLUDED
  if (item.materialsIncluded === false) return ESTIMATE_LABOR_ONLY
  return ''
}

function getMaterialsIncluded(materialsStatus) {
  if (materialsStatus === ESTIMATE_MATERIALS_INCLUDED) return true
  if (materialsStatus === ESTIMATE_LABOR_ONLY || materialsStatus === ESTIMATE_OWNER_SUPPLIED_MATERIALS) return false
  return null
}

export function ContractWorkBreakdownEditor({ workBreakdown = [], onChange, t = (key) => key }) {
  const normalizedWorkBreakdown = normalizeContractWorkBreakdown(workBreakdown)

  function updateItem(index, changes) {
    onChange?.(normalizedWorkBreakdown.map((item, itemIndex) => (
      itemIndex === index ? { ...item, ...changes } : item
    )))
  }

  function updateMaterialsStatus(index, materialsStatus) {
    const nextItem = {
      materialsStatus: materialsStatus || undefined,
      materialsIncluded: getMaterialsIncluded(materialsStatus),
    }

    if (!materialsStatus) {
      delete nextItem.materialsStatus
      delete nextItem.materialsIncluded
    }

    updateItem(index, nextItem)
  }

  if (normalizedWorkBreakdown.length === 0) return null

  return (
    <div className="mt-4 space-y-4">
      {normalizedWorkBreakdown.map((item, index) => {
        const materialsStatus = getMaterialsStatus(item)

        return (
          <div key={item.id || `contract-work-item-${index}`} className="rounded-2xl border border-slate-200 bg-white p-3 sm:p-4">
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_12rem] lg:items-start">
              <div className="min-w-0 space-y-2">
                <label className="block text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  {t('lineItemTitle')}
                </label>
                <input
                  type="text"
                  value={item.title || ''}
                  onChange={(event) => updateItem(index, { title: event.target.value })}
                  placeholder={t('lineItemTitlePlaceholder')}
                  aria-label={t('lineItemTitle')}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-300 focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
                <label className="block pt-1 text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                  {t('lineItemDescription')}
                </label>
                <LightweightFormattedTextarea
                  value={item.description || ''}
                  onChange={(description) => updateItem(index, { description })}
                  placeholder={t('lineItemDescriptionPlaceholder')}
                  rows={3}
                  minHeight={104}
                  maxHeight={400}
                  ariaLabel={t('lineItemDescription')}
                  t={t}
                  className="px-3 py-3 text-sm leading-6"
                />
              </div>
              <div className="min-w-0 space-y-3 lg:pt-6">
                <div className="space-y-1">
                  <label className="block text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">
                    {t('materialResponsibility')}
                  </label>
                  <SelectField
                    value={materialsStatus}
                    onChange={(event) => updateMaterialsStatus(index, event.target.value)}
                    aria-label={t('materialResponsibility')}
                    className="min-h-11 rounded-xl px-3 py-2 text-sm"
                  >
                    <option value="">{t('notSpecified')}</option>
                    <option value={ESTIMATE_MATERIALS_INCLUDED}>{t('materialsIncluded')}</option>
                    <option value={ESTIMATE_LABOR_ONLY}>{t('laborOnly')}</option>
                    <option value={ESTIMATE_OWNER_SUPPLIED_MATERIALS}>{t('ownerSuppliedMaterials')}</option>
                  </SelectField>
                </div>
                {Number(item.quantity) > 0 ? (
                  <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-700">
                    {t('quantity')}: {item.quantity}
                  </div>
                ) : null}
                <div className="rounded-xl bg-slate-50 px-3 py-3 text-right text-sm font-bold text-slate-900">
                  <p className="text-[11px] uppercase tracking-[0.14em] text-slate-400">{t('lineItemAmount')}</p>
                  <p className="mt-1">{currency.format(Number(item.amount || 0))}</p>
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
