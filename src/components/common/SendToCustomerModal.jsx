import { useEffect, useMemo, useRef, useState } from 'react'
import { ModalShell } from './ModalShell'
import { normalizePortalShareUrl } from '../../utils/portal'
import { buildCustomerDeliveryContent, getCustomerDeliveryAvailability } from '../../utils/customerDelivery'

export function SendToCustomerModal({ isOpen, documentType = 'invoice', customer = {}, projectTitle = '', amountLabel = '', amountValue = '', dueDate = '', portalUrl = '', documentLink = '', companyName = '', onClose, onSent, t, contentT = t }) {
  const phone = customer.phone || ''
  const email = customer.email || ''
  const hasPhone = Boolean(phone)
  const hasEmail = Boolean(email)
  const [channel, setChannel] = useState('text')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitGuardRef = useRef(false)

  useEffect(() => {
    if (isOpen) {
      setChannel(hasPhone ? 'text' : hasEmail ? 'email' : 'text')
      setIsSubmitting(false)
      submitGuardRef.current = false
    }
  }, [hasEmail, hasPhone, isOpen])

  const typeLabel = t(documentType)
  const resolvedPortalUrl = normalizePortalShareUrl(portalUrl)
  const resolvedDocumentLink = normalizePortalShareUrl(documentLink)
  const deliveryAvailability = getCustomerDeliveryAvailability({
    documentType,
    documentLink: resolvedDocumentLink,
    phone,
    email,
  })
  const { requiresClientLink, hasRequiredClientLink } = deliveryAvailability
  const availableChannels = useMemo(() => (
    [
      hasPhone ? { id: 'text', label: t('textMessage') } : null,
      hasEmail ? { id: 'email', label: t('email') } : null,
    ].filter(Boolean)
  ), [hasEmail, hasPhone, t])
  const primaryActionLabel = channel === 'email'
    ? (isSubmitting ? t('saving') : hasEmail ? t('sendEmailNow') : t('noEmailOnFile'))
    : (isSubmitting ? t('saving') : hasPhone ? t('sendTextNow') : t('noPhoneOnFile'))
  const messageContent = useMemo(() => {
    return buildCustomerDeliveryContent({
      documentType,
      customerName: customer.name,
      projectTitle,
      amountValue,
      dueDate,
      portalUrl: resolvedPortalUrl,
      documentLink: resolvedDocumentLink,
      companyName,
      contentT,
    })
  }, [amountValue, companyName, contentT, customer.name, documentType, dueDate, projectTitle, resolvedDocumentLink, resolvedPortalUrl])

  const clientLinkStatus = resolvedDocumentLink
    ? t('clientLinkReady')
    : requiresClientLink
      ? t('clientLinkUnavailable')
      : messageContent.resolvedDocumentStatus
  const clientLinkUnavailableHelpKey = documentType === 'estimate'
    ? 'estimateShareLinkUnavailableHelp'
    : 'clientLinkUnavailableHelp'

  if (!isOpen) return null

  async function sendText() {
    if (submitGuardRef.current || !deliveryAvailability.text) {
      return
    }

    const separator = /Android/i.test(navigator.userAgent) ? '?' : '&'
    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      const result = await onSent?.('text')

      if (result === false) {
        return
      }

      onClose?.()
      window.location.href = `sms:${encodeURIComponent(phone)}${separator}body=${encodeURIComponent(messageContent.smsBody)}`
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  async function sendEmail() {
    if (submitGuardRef.current || !deliveryAvailability.email) {
      return
    }

    submitGuardRef.current = true
    setIsSubmitting(true)

    try {
      const result = await onSent?.('email')

      if (result === false) {
        return
      }

      onClose?.()
      window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(messageContent.subject)}&body=${encodeURIComponent(messageContent.emailBody)}`
    } finally {
      submitGuardRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell isOpen={isOpen} onBackdropClick={isSubmitting ? undefined : onClose} panelClassName="min-w-0 overflow-x-hidden pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:max-w-lg">
      <div className="mb-5 min-w-0 rounded-2xl bg-blue-50 p-4 text-blue-900">
        <p className="text-xs font-bold uppercase tracking-wide text-blue-500">{t('sendToCustomer')}</p>
        <h2 className="mt-1 text-xl font-bold">{t('sendDocumentToCustomer', { document: typeLabel })}</h2>
        <p className="mt-2 text-sm leading-6 text-blue-800">{t(requiresClientLink ? 'sendClientLinkHelp' : 'sendToCustomerHelp')}</p>
      </div>

      <div className="min-w-0 rounded-2xl border border-slate-200 p-4 text-sm [overflow-wrap:anywhere]">
        <p className="break-words font-bold text-slate-950">{customer.name || t('customer')}</p>
        <p className="mt-1 break-words text-slate-500">{projectTitle}</p>
        {amountLabel && amountValue && <p className="mt-2 break-words text-slate-700">{amountLabel}: <span className="font-bold">{amountValue}</span></p>}
        {resolvedPortalUrl && <p className="mt-2 break-all text-slate-700">{t('shareUrl')}: <span className="font-bold">{resolvedPortalUrl}</span></p>}
        <p className="mt-2 break-words text-slate-700">{t(requiresClientLink ? 'clientLinkStatus' : 'documentStatus')}: <span className="font-bold">{clientLinkStatus}</span></p>
        {requiresClientLink && !resolvedDocumentLink ? (
          <p className="mt-2 text-sm leading-6 text-amber-700">{t(clientLinkUnavailableHelpKey)}</p>
        ) : null}
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-1">
        <div className={`grid gap-1 ${availableChannels.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
          {availableChannels.map((option) => (
            <button
              key={option.id}
              type="button"
              disabled={isSubmitting}
              onClick={() => setChannel(option.id)}
              aria-pressed={channel === option.id}
              className={`rounded-[1rem] px-4 py-3 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-60 ${channel === option.id ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-200' : 'text-slate-600 hover:bg-white/80 hover:text-slate-900'}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {hasRequiredClientLink ? <div className="mt-4 min-w-0 max-w-full overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-4" role="region" aria-labelledby="customer-message-preview-label">
        {channel === 'email' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">{t('subject')}</p>
            <p className="mt-1 break-words text-sm font-bold text-slate-900 [overflow-wrap:anywhere]">{messageContent.subject}</p>
          </>
        )}
        <p id="customer-message-preview-label" className={`text-xs font-bold uppercase tracking-wide text-slate-400 ${channel === 'email' ? 'mt-4' : ''}`}>{t('messagePreview')}</p>
        <p className="mt-1 min-w-0 max-w-full whitespace-pre-wrap break-words text-sm leading-6 text-slate-700 [overflow-wrap:anywhere]">
          {channel === 'email' ? messageContent.emailBody : messageContent.smsBody}
        </p>
      </div> : null}

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          disabled={isSubmitting || !deliveryAvailability[channel]}
          onClick={channel === 'email' ? sendEmail : sendText}
          className="rounded-2xl bg-blue-600 px-4 py-4 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          {primaryActionLabel}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onClose}
          className="rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {t('cancel')}
        </button>
      </div>
    </ModalShell>
  )
}
