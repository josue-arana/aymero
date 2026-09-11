import { useEffect, useMemo, useRef, useState } from 'react'
import { ModalShell } from './ModalShell'
import { SelectField } from '../ui/SelectField'
import { currency } from '../../utils/formatters'
import { getEligiblePaymentInvoices, getInvoicePaymentRemaining } from '../../utils/paymentAllocation'
import { normalizeCurrencyInput, parsePaymentAmount } from '../../utils/paymentAmount'

const paymentMethods = ['Cash', 'Check', 'Zelle', 'Credit Card', 'Bank Transfer', 'Other']
const paymentTypes = ['Deposit', 'Progress Payment', 'Final Payment', 'Other']

function buildPaymentState(initialPayment = null) {
  if (initialPayment) {
    return {
      amount: initialPayment.amount === 0 ? '0' : String(initialPayment.amount ?? ''),
      date: initialPayment.paymentDate || initialPayment.date || new Date().toISOString().slice(0, 10),
      method: initialPayment.paymentMethod || initialPayment.method || 'Cash',
      type: initialPayment.paymentType || initialPayment.type || 'Progress Payment',
      notes: initialPayment.notes || '',
    }
  }

  return {
    amount: '',
    date: new Date().toISOString().slice(0, 10),
    method: 'Cash',
    type: 'Progress Payment',
    notes: '',
  }
}

export function RecordPaymentModal({ isOpen, projectBalance = null, projectValue = 0, projectId = '', invoices = [], payments = [], initialPayment = null, onClose, onSave, t }) {
  const [payment, setPayment] = useState(() => buildPaymentState(initialPayment))
  const [amountError, setAmountError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(initialPayment?.invoiceId || initialPayment?.invoice_id || '')
  const submitGuardRef = useRef(false)
  const isEditing = Boolean(initialPayment?.id)
  const eligibleInvoices = useMemo(() => getEligiblePaymentInvoices(invoices, { projectId, payments }), [invoices, payments, projectId])
  const selectedInvoice = eligibleInvoices.find((invoice) => String(invoice.id) === String(selectedInvoiceId)) || null
  const halfDepositAmount = Number(projectValue || 0) > 0 ? Number(projectValue || 0) * 0.5 : 0

  useEffect(() => {
    if (isOpen) {
      setPayment(buildPaymentState(initialPayment))
      setSelectedInvoiceId(initialPayment?.invoiceId || initialPayment?.invoice_id || '')
      setAmountError('')
      setIsSubmitting(false)
      submitGuardRef.current = false
    }
  }, [eligibleInvoices, initialPayment, isOpen])

  if (!isOpen) return null

  function handleAmountChange(nextValue) {
    setPayment((current) => ({ ...current, amount: normalizeCurrencyInput(nextValue) }))
    if (amountError) {
      setAmountError('')
    }
  }

  async function handleSave() {
    const { normalized: normalizedAmount, value: parsedAmount } = parsePaymentAmount(payment.amount)

    if (!normalizedAmount) {
      setAmountError(t('enterPaymentAmount'))
      return
    }

    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setAmountError(t('paymentAmountMustBeGreaterThanZero'))
      return
    }

    if (submitGuardRef.current) {
      return
    }

    submitGuardRef.current = true
    setIsSubmitting(true)
    setAmountError('')

    try {
      await onSave?.({
        ...payment,
        amount: parsedAmount,
        invoiceId: selectedInvoiceId || null,
      })
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="sm:max-w-lg">
      <h2 className="text-xl font-bold text-slate-950">{t(isEditing ? 'editPayment' : 'recordPayment')}</h2>
      <p className="mt-1 text-sm text-slate-500">{t('recordPaymentHelp')}</p>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold text-slate-700">
          {t('amount')}
          <input
            type="text"
            inputMode="decimal"
            value={payment.amount}
            onChange={(event) => handleAmountChange(event.target.value)}
            placeholder={t('enterPaymentAmount')}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500"
          />
          {payment.type === 'Deposit' && halfDepositAmount > 0 ? (
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleAmountChange(String(halfDepositAmount))}
              className="mt-2 inline-flex items-center rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t('useHalfDeposit')}
            </button>
          ) : null}
          {amountError ? <p className="mt-2 text-sm font-semibold text-red-600">{amountError}</p> : null}
        </label>
        <label className="text-sm font-bold text-slate-700">
          {t('paymentDate')}
          <input
            type="date"
            value={payment.date}
            onChange={(event) => setPayment((current) => ({ ...current, date: event.target.value }))}
            className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500"
          />
        </label>
        <label className="text-sm font-bold text-slate-700">
          {t('paymentMethod')}
          <SelectField
            value={payment.method}
            onChange={(event) => setPayment((current) => ({ ...current, method: event.target.value }))}
            className="mt-2 bg-slate-50"
          >
            {paymentMethods.map((method) => (
              <option key={method} value={method}>
                {t(method)}
              </option>
            ))}
          </SelectField>
        </label>
        <label className="text-sm font-bold text-slate-700">
          {t('paymentType')}
          <SelectField
            value={payment.type}
            onChange={(event) => setPayment((current) => ({ ...current, type: event.target.value }))}
            className="mt-2 bg-slate-50"
          >
            {paymentTypes.map((type) => (
              <option key={type} value={type}>
                {t(type)}
              </option>
            ))}
          </SelectField>
        </label>
      </div>

      <label className="mt-4 block text-sm font-bold text-slate-700">
        {t('notes')}
        <textarea
          value={payment.notes}
          onChange={(event) => setPayment((current) => ({ ...current, notes: event.target.value }))}
          rows={3}
          className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-blue-500"
        />
      </label>

      {eligibleInvoices.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
          <label className="block text-sm font-bold text-slate-700">
            <span className="mb-2 block">{t('applyToInvoiceOptional')}</span>
            <SelectField value={selectedInvoiceId} onChange={(event) => { setSelectedInvoiceId(event.target.value); setAmountError('') }} className="bg-white">
              <option value="">{t('noInvoiceAssociation')}</option>
              {eligibleInvoices.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  {invoice.number || invoice.invoiceNumber || t('invoice')} · {currency.format(getInvoicePaymentRemaining(invoice, payments))} {t('remaining').toLowerCase()}
                </option>
              ))}
            </SelectField>
          </label>
          {selectedInvoice ? (
            <p className="mt-2 text-xs font-semibold text-slate-500">{t('invoiceBalance')}: {currency.format(getInvoicePaymentRemaining(selectedInvoice, payments))}</p>
          ) : null}
        </div>
      ) : null}

      <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button disabled={isSubmitting} onClick={onClose} className="rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60">
          {t('cancel')}
        </button>
        <button
          disabled={isSubmitting}
          onClick={handleSave}
          className="rounded-2xl bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-blue-400"
        >
          {isSubmitting ? t('saving') : t(isEditing ? 'saveChanges' : 'savePayment')}
        </button>
      </div>
    </ModalShell>
  )
}
