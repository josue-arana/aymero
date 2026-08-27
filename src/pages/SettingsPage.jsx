import { useEffect, useMemo, useState } from 'react'
import { Building2, CreditCard, FileText, Globe2, ImageUp, Languages, Palette, Save } from 'lucide-react'
import { useToast } from '../components/common/ToastProvider'
import { InfoCard } from '../components/ui/InfoCard'
import { USE_SUPABASE_SETTINGS } from '../config/backendConfig'
import { useAuth } from '../contexts/AuthContext'
import dataProvider from '../services/dataProvider'
import { getSettingsContractorId } from '../services/system/settingsRuntimeService'
import settingsHeroBackground from '../assets/page-heroes/settings-bg.png'
import { buildHeroBackgroundStyle } from '../utils/heroBackground'
import { getPaymentTermOptions } from '../utils/paymentTerms'
import {
  ACCEPTED_PAYMENT_METHOD_OPTIONS,
  normalizeAcceptedPaymentMethods,
  OTHER_PAYMENT_METHOD,
  serializeAcceptedPaymentMethods,
} from '../utils/acceptedPaymentMethods'
import { ConfirmRecordModal } from '../components/common/ConfirmRecordModal'
import {
  hasCompleteSampleWorkspaceManifest,
  hasSampleWorkspace,
  needsSampleWorkspaceUpgrade,
} from '../services/sampleWorkspaceService'
import {
  normalizeBrandColor,
  parseBrandColor,
} from '../data/brandColors'
import { normalizeSupportedLanguage } from '../utils/language'

function getSettingsUiErrorMessage(error, t) {
  if (error?.code === 'ANALYTICS_MODE_COLUMN_MISSING') {
    return t('analyticsModeSetupRequired')
  }

  return error?.message || t('settingsSaveFailed')
}

export function SettingsPage({ settings, onSaveSettings, onOpenCompanySetup, onCreateSampleData, onUpdateSampleData, onRemoveSampleData, onReopenSampleGuide, onOpenSampleWorkspace, language, setLanguage, portalLanguage, setPortalLanguage, t }) {
  const { contractor, company: authCompany, session } = useAuth()
  const { showToast } = useToast()
  const [draft, setDraft] = useState(settings)
  const [successMessage, setSuccessMessage] = useState('')
  const [settingsLoadError, setSettingsLoadError] = useState('')
  const [paymentMethodsError, setPaymentMethodsError] = useState('')
  const [brandColorInput, setBrandColorInput] = useState(() => normalizeBrandColor(settings?.company?.primaryColor))
  const [brandColorError, setBrandColorError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [sampleAction, setSampleAction] = useState('')
  const [sampleProgress, setSampleProgress] = useState(null)

  const contractorId = useMemo(() => (
    getSettingsContractorId({
      contractor,
      company: authCompany,
      session,
    })
  ), [authCompany, contractor, session])

  useEffect(() => {
    setDraft(settings)
    setPaymentMethodsError('')
  }, [settings])

  useEffect(() => {
    setBrandColorInput(normalizeBrandColor(draft?.company?.primaryColor))
    setBrandColorError('')
  }, [draft?.company?.primaryColor])

  function updateSection(section, field, value) {
    setDraft((current) => ({
      ...current,
      [section]: {
        ...(current?.[section] || {}),
        [field]: value,
      },
    }))
  }

  function updateCompany(field, value) {
    updateSection('company', field, value)
  }

  function updateDefaults(field, value) {
    updateSection('defaults', field, value)
  }

  function updatePortal(field, value) {
    updateSection('portal', field, value)
  }

  function updateRootField(field, value) {
    setDraft((current) => ({
      ...(current || {}),
      [field]: value,
    }))
  }

  function changeApplicationLanguage(nextLanguage) {
    const normalizedLanguage = normalizeSupportedLanguage(nextLanguage, language)
    updateRootField('appLanguage', normalizedLanguage)
    setLanguage(normalizedLanguage)
  }

  function changePortalDefaultLanguage(nextLanguage) {
    const normalizedLanguage = normalizeSupportedLanguage(nextLanguage, portalLanguage)
    updatePortal('defaultLanguage', normalizedLanguage)
    setPortalLanguage(normalizedLanguage)
  }

  function handleLogoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      updateCompany('logo', reader.result)
    }
    reader.readAsDataURL(file)
  }

  function handleBrandColorPickerChange(value) {
    const canonicalColor = normalizeBrandColor(value)
    setBrandColorInput(canonicalColor)
    setBrandColorError('')
    updateCompany('primaryColor', canonicalColor)
  }

  function handleBrandColorTextChange(value) {
    const canonicalColor = parseBrandColor(value)

    if (canonicalColor) {
      setBrandColorInput(canonicalColor)
      setBrandColorError('')
      updateCompany('primaryColor', canonicalColor)
      return
    }

    setBrandColorInput(value)
    setBrandColorError('')
  }

  function validateBrandColorInput() {
    const canonicalColor = parseBrandColor(brandColorInput)

    if (!canonicalColor) {
      setBrandColorError(t('invalidHexColor'))
      return null
    }

    setBrandColorInput(canonicalColor)
    setBrandColorError('')
    updateCompany('primaryColor', canonicalColor)
    return canonicalColor
  }

  async function saveSettings() {
    if (isSaving) return

    const canonicalBrandColor = validateBrandColorInput()
    if (!canonicalBrandColor) return

    const acceptedPaymentMethods = normalizeAcceptedPaymentMethods(
      draft?.company?.acceptedPaymentMethods
    )

    if (
      acceptedPaymentMethods.methods.includes(OTHER_PAYMENT_METHOD)
      && !acceptedPaymentMethods.otherLabel.trim()
    ) {
      const errorMessage = t('customPaymentMethodRequired')
      setPaymentMethodsError(errorMessage)
      showToast(errorMessage, 'error')
      return
    }

    setPaymentMethodsError('')
    const nextSettings = {
      ...draft,
      company: {
        ...(draft?.company || {}),
        primaryColor: canonicalBrandColor,
        acceptedPaymentMethods: serializeAcceptedPaymentMethods(acceptedPaymentMethods),
      },
      portal: {
        ...(draft.portal || {}),
        defaultLanguage: portalLanguage,
      },
      appLanguage: language,
    }
    // Persist through the data provider (no-op in local mode) and then
    // update App state so the visible company settings refresh immediately.
    setIsSaving(true)
    try {
      const res = await dataProvider?.settings?.updateSettings?.(nextSettings, { contractorId })

      if (USE_SUPABASE_SETTINGS && res?.error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[dev] Settings Supabase save failed.', {
            contractorId,
            error: res.error,
            response: res,
          })
        }

        setSuccessMessage('')
        const errorMessage = getSettingsUiErrorMessage(res.error, t)
        setSettingsLoadError(errorMessage)
        showToast(errorMessage, 'error')
        return
      }

      const persistedSettings = res?.data || nextSettings

      setDraft(persistedSettings)
      setSettingsLoadError('')
      if (persistedSettings.appLanguage) {
        setLanguage(persistedSettings.appLanguage)
      }
      if (persistedSettings.portal?.defaultLanguage) {
        setPortalLanguage(persistedSettings.portal.defaultLanguage)
      }

      onSaveSettings?.(persistedSettings)
    } catch (err) {
      if (USE_SUPABASE_SETTINGS) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.error('[dev] Settings Supabase save threw an unexpected error.', {
            contractorId,
            error: err,
          })
        }

        setSuccessMessage('')
        setSettingsLoadError(err?.message || t('settingsSaveFailed'))
        showToast(err?.message || t('settingsSaveFailed'), 'error')
        return
      }

      onSaveSettings?.(nextSettings)
      setSuccessMessage(t('settingsSaved'))
      window.setTimeout(() => setSuccessMessage(''), 2500)
      return
    } finally {
      setIsSaving(false)
    }
    setSuccessMessage(t('settingsSaved'))
    window.setTimeout(() => setSuccessMessage(''), 2500)
  }

  const company = draft?.company || {}
  const defaults = draft?.defaults || {}
  const portal = draft?.portal || {}
  const acceptedPaymentMethods = normalizeAcceptedPaymentMethods(company.acceptedPaymentMethods)
  const paymentTermOptions = getPaymentTermOptions(t, defaults.paymentTerms)
  const selectedBrandColor = normalizeBrandColor(company.primaryColor)
  const previewTotal = useMemo(() => new Intl.NumberFormat(
    language === 'es' ? 'es-US' : 'en-US',
    {
      style: 'currency',
      currency: defaults.currency || 'USD',
      maximumFractionDigits: 2,
    }
  ).format(12500), [defaults.currency, language])
  const sampleWorkspaceExists = hasSampleWorkspace(draft)
  const sampleWorkspaceInstalled = hasCompleteSampleWorkspaceManifest(draft)
  const sampleWorkspaceNeedsUpgrade = needsSampleWorkspaceUpgrade(draft)

  function toggleAcceptedPaymentMethod(method, checked) {
    const nextMethods = checked
      ? [...acceptedPaymentMethods.methods, method]
      : acceptedPaymentMethods.methods.filter((value) => value !== method)

    updateCompany('acceptedPaymentMethods', {
      methods: [...new Set(nextMethods)],
      otherLabel: method === OTHER_PAYMENT_METHOD && !checked
        ? ''
        : acceptedPaymentMethods.otherLabel,
    })
    setPaymentMethodsError('')
  }

  function updateCustomPaymentMethod(value) {
    updateCompany('acceptedPaymentMethods', {
      ...acceptedPaymentMethods,
      otherLabel: value,
    })
    setPaymentMethodsError('')
  }

  async function runSampleAction() {
    const completedAction = sampleAction
    setSettingsLoadError('')
    setSuccessMessage('')
    setSampleProgress({ current: 0, total: 8, key: sampleAction === 'remove' ? 'sampleDataRemoving' : 'sampleDataChecking' })
    let result

    try {
      result = sampleAction === 'remove'
        ? await onRemoveSampleData?.(setSampleProgress)
        : sampleAction === 'update'
          ? await onUpdateSampleData?.(setSampleProgress)
          : await onCreateSampleData?.(setSampleProgress)
    } catch (error) {
      setSampleProgress(null)
      showToast(t(completedAction === 'remove' ? 'sampleDataRemoveError' : completedAction === 'update' ? 'sampleDataUpdateError' : 'sampleDataErrorBody'), 'error')
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Sample workspace settings action failed before returning a result.', {
          failingFunction: completedAction === 'remove' ? 'onRemoveSampleData' : completedAction === 'update' ? 'onUpdateSampleData' : 'onCreateSampleData',
          code: error?.code || 'SAMPLE_DATA_ACTION_FAILED',
          message: error?.message || null,
        })
      }
      return
    }

    if (result?.upgradeRequired) {
      setSampleProgress(null)
      setSampleAction('update')
      showToast(t('sampleDataUpdateRequired'))
      return
    }

    const actionSucceeded = completedAction === 'remove'
      ? !result?.error
      : result?.success === true && result?.installed === true

    if (!actionSucceeded) {
      setSampleProgress(null)
      const sampleActionErrorKey = completedAction === 'remove'
        ? result?.error?.code === 'SAMPLE_DATA_ESTIMATE_DEPENDENCY_BLOCKED'
          ? 'sampleDataDependencyError'
          : 'sampleDataRemoveError'
        : completedAction === 'update'
          ? 'sampleDataUpdateError'
          : 'sampleDataErrorBody'
      showToast(t(sampleActionErrorKey), 'error')
      return
    }

    if (completedAction !== 'remove' && result.settings) {
      setDraft(result.settings)
    }
    setSampleAction('')
    setSampleProgress(null)

    try {
      showToast(t(completedAction === 'remove' ? 'sampleDataRemovedToast' : completedAction === 'update' ? 'sampleDataUpdatedToast' : 'sampleDataReadyToast'))
    } catch (error) {
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.warn('[dev] Sample workspace action succeeded; the Settings success toast failed.', {
          failingFunction: 'showToast',
          code: error?.code || 'SAMPLE_DATA_SUCCESS_TOAST_FAILED',
          message: error?.message || null,
        })
      }
    }

    if (completedAction !== 'remove') {
      try {
        await onOpenSampleWorkspace?.()
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] Sample workspace installed; opening the workspace failed.', {
            failingFunction: 'onOpenSampleWorkspace',
            code: error?.code || 'SAMPLE_DATA_NAVIGATION_FAILED',
            message: error?.message || null,
          })
        }
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <section className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-6" style={buildHeroBackgroundStyle(settingsHeroBackground)}>
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/55 via-slate-950/20 to-transparent" />
        <div className="relative">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{t('settings')}</p>
          <h1 className="mt-2 text-3xl font-bold tracking-tight">{t('settingsTitle')}</h1>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-300">{t('settingsHelp')}</p>
        </div>
      </section>

      {successMessage && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
          {successMessage}
        </div>
      )}

      {settingsLoadError && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800">
          {settingsLoadError}
        </div>
      )}

      <section className="flex flex-col gap-4 rounded-3xl border border-blue-200 bg-blue-50 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-700">{t('onboardingCompanySetup')}</p>
          <h2 className="mt-2 text-lg font-bold text-slate-950">{t('onboardingCompanySetupTitle')}</h2>
          <p className="mt-1 text-sm leading-6 text-slate-600">{t('onboardingCompanySetupBody')}</p>
        </div>
        <div className="flex shrink-0 flex-col gap-2 sm:items-end">
          <button type="button" onClick={onOpenCompanySetup} className="min-h-11 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">
            {settings?.onboarding?.completed ? t('onboardingReviewSetup') : t('onboardingResumeSetup')}
          </button>
          {sampleWorkspaceNeedsUpgrade ? (
            <button type="button" onClick={() => setSampleAction('update')} className="min-h-11 rounded-2xl border border-amber-200 bg-white px-4 text-sm font-bold text-amber-800 hover:bg-amber-50">
              {t('sampleDataUpdateAction')}
            </button>
          ) : !sampleWorkspaceInstalled ? (
            <button type="button" onClick={() => setSampleAction('install')} className="min-h-11 rounded-2xl border border-blue-200 bg-white px-4 text-sm font-bold text-blue-700 hover:bg-blue-50">
              {t(sampleWorkspaceExists ? 'sampleDataContinueAction' : 'sampleDataExploreAction')}
            </button>
          ) : null}
          {sampleWorkspaceInstalled && !sampleWorkspaceNeedsUpgrade ? (
            <button type="button" onClick={async () => {
              const result = await onReopenSampleGuide?.()
              if (result?.error) showToast(t('sampleGuideSaveError'), 'error')
            }} className="min-h-11 rounded-2xl border border-cyan-200 bg-white px-4 text-sm font-bold text-cyan-800 hover:bg-cyan-50">
              {t('sampleGuideReopen')}
            </button>
          ) : null}
          {sampleWorkspaceExists ? (
            <button type="button" onClick={() => setSampleAction('remove')} className="min-h-11 rounded-2xl border border-rose-200 bg-white px-4 text-sm font-bold text-rose-700 hover:bg-rose-50">
              {t('sampleDataRemoveAction')}
            </button>
          ) : null}
        </div>
      </section>

      <ConfirmRecordModal
        isOpen={Boolean(sampleAction)}
        mode={sampleAction === 'remove' ? 'delete' : 'archive'}
        title={t(sampleAction === 'remove' ? 'sampleDataRemoveConfirmTitle' : sampleAction === 'update' ? 'sampleDataUpdateConfirmTitle' : 'sampleDataConfirmTitle')}
        message={sampleProgress ? t(sampleProgress.key || 'sampleDataCreating') : t(sampleAction === 'remove' ? 'sampleDataRemoveConfirmBody' : sampleAction === 'update' ? 'sampleDataUpdateConfirmBody' : 'sampleDataConfirmBody')}
        confirmLabel={t(sampleAction === 'remove' ? 'sampleDataRemoveAction' : sampleAction === 'update' ? 'sampleDataUpdateAction' : 'sampleDataAddAction')}
        submittingLabel={t(sampleAction === 'remove' ? 'sampleDataRemoving' : sampleAction === 'update' ? 'sampleDataUpdating' : 'sampleDataCreating')}
        onCancel={() => { setSampleAction(''); setSampleProgress(null) }}
        onConfirm={runSampleAction}
        t={t}
      />

      <section className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-5">
          <InfoCard title={t('companyProfile')} icon={Building2}>
            <div className="grid gap-4 sm:grid-cols-2">
              <SettingsInput label={t('companyName')} value={company.name} onChange={(value) => updateCompany('name', value)} />
              <SettingsInput label={t('ownerName')} value={company.ownerName} onChange={(value) => updateCompany('ownerName', value)} />
              <SettingsInput label={t('phoneNumber')} value={company.phone} onChange={(value) => updateCompany('phone', value)} />
              <SettingsInput label={t('email')} value={company.email} onChange={(value) => updateCompany('email', value)} />
              <SettingsInput label={t('website')} value={company.website} onChange={(value) => updateCompany('website', value)} />
              <SettingsInput label={t('licenseNumber')} value={company.licenseNumber} onChange={(value) => updateCompany('licenseNumber', value)} />
              <label className="block text-sm font-bold text-slate-700 sm:col-span-2">
                {t('businessAddress')}
                <textarea value={company.address || ''} onChange={(event) => updateCompany('address', event.target.value)} placeholder={t('businessAddressPlaceholder')} rows={3} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </label>
            </div>
          </InfoCard>

          <InfoCard title={t('estimateInvoiceDefaults')} icon={FileText}>
            <p id="estimate-invoice-defaults-help" className="text-sm leading-6 text-slate-600">{t('estimateInvoiceDefaultsHelp')}</p>
            <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <label className="flex min-w-0 flex-col text-sm font-bold text-slate-700">
                <span className="lg:min-h-10">{t('onboardingDefaultPaymentTerms')}</span>
                <select value={defaults.paymentTerms || ''} onChange={(event) => updateDefaults('paymentTerms', event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                  {paymentTermOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              <SettingsNumberInput
                label={t('defaultDepositPercentage')}
                suffix="%"
                value={defaults.depositPercentage}
                onChange={(value) => updateDefaults('depositPercentage', Number(value || 0))}
              />
              <SettingsNumberInput
                label={t('defaultInvoiceDueDays')}
                suffix={t('days')}
                value={defaults.invoiceDueDays}
                onChange={(value) => updateDefaults('invoiceDueDays', Number(value || 0))}
              />
            </div>
            <div className="mt-5 border-t border-slate-200 pt-4">
              <label className="flex cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  checked={Boolean(defaults.materialsIncluded)}
                  onChange={(event) => updateDefaults('materialsIncluded', event.target.checked)}
                  aria-describedby="default-materials-included-help"
                  className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-700">{t('defaultMaterialsIncluded')}</span>
                  <span id="default-materials-included-help" className="mt-1 block text-xs leading-5 text-slate-500">{t('defaultMaterialsIncludedHelp')}</span>
                </span>
              </label>
            </div>
          </InfoCard>

          <InfoCard title={t('acceptedPaymentMethods')} icon={CreditCard}>
            <fieldset aria-describedby="accepted-payment-methods-help accepted-payment-methods-hint">
              <legend className="sr-only">{t('acceptedPaymentMethods')}</legend>
              <p id="accepted-payment-methods-help" className="text-sm leading-6 text-slate-600">{t('acceptedPaymentMethodsHelp')}</p>
              <p id="accepted-payment-methods-hint" className="mt-1 text-xs leading-5 text-slate-500">{t('acceptedPaymentMethodsSelectionHint')}</p>
              <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {ACCEPTED_PAYMENT_METHOD_OPTIONS.map((option) => {
                  const checked = acceptedPaymentMethods.methods.includes(option.value)

                  return (
                    <PortalFeatureCheckbox
                      key={option.value}
                      label={t(option.labelKey)}
                      checked={checked}
                      onChange={(nextChecked) => toggleAcceptedPaymentMethod(option.value, nextChecked)}
                    />
                  )
                })}
              </div>
              {acceptedPaymentMethods.methods.includes(OTHER_PAYMENT_METHOD) ? (
                <label htmlFor="custom-payment-method" className="mt-4 block text-sm font-bold text-slate-700">
                  {t('customPaymentMethod')}
                  <input
                    id="custom-payment-method"
                    value={acceptedPaymentMethods.otherLabel}
                    onChange={(event) => updateCustomPaymentMethod(event.target.value)}
                    aria-invalid={Boolean(paymentMethodsError)}
                    aria-describedby={paymentMethodsError ? 'custom-payment-method-error' : undefined}
                    className={`mt-2 w-full rounded-2xl border bg-slate-50 px-4 py-3 text-sm outline-none focus:ring-4 ${paymentMethodsError ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 focus:border-blue-500 focus:ring-blue-100'}`}
                  />
                  {paymentMethodsError ? <span id="custom-payment-method-error" className="mt-2 block text-sm font-semibold text-rose-600">{paymentMethodsError}</span> : null}
                </label>
              ) : null}
            </fieldset>
          </InfoCard>

          <InfoCard title={t('languageSettings')} icon={Languages}>
            <div className="grid gap-4 sm:grid-cols-2">
              <LanguageSelect label={t('contractorAppLanguage')} value={language} onChange={changeApplicationLanguage} t={t} />
              <LanguageSelect label={t('customerPortalDefaultLanguage')} value={portalLanguage} onChange={changePortalDefaultLanguage} t={t} />
            </div>
          </InfoCard>

          <InfoCard title={t('customerPortalSettings')} icon={Globe2}>
            <fieldset>
              <legend className="text-sm font-bold text-slate-700">{t('visibleFeatures')}</legend>
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <PortalFeatureCheckbox
                  label={t('documents')}
                  checked={portal.showDocuments !== false}
                  onChange={(checked) => updatePortal('showDocuments', checked)}
                />
                <PortalFeatureCheckbox
                  label={t('photos')}
                  checked={portal.showPhotos !== false}
                  onChange={(checked) => updatePortal('showPhotos', checked)}
                />
                <PortalFeatureCheckbox
                  label={t('payments')}
                  checked={portal.showPayments !== false}
                  onChange={(checked) => updatePortal('showPayments', checked)}
                />
              </div>
            </fieldset>
          </InfoCard>

          <InfoCard title={t('features')} icon={Globe2}>
            <ToggleRow
              label={t('analyticsMode')}
              description={t('analyticsModeDescription')}
              checked={draft?.analyticsMode !== false}
              onChange={(checked) => updateRootField('analyticsMode', checked)}
              t={t}
            />
          </InfoCard>
        </div>

        <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
          <section
            className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm"
            aria-labelledby="company-branding-heading"
          >
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                <Palette className="h-5 w-5" aria-hidden="true" />
              </span>
              <div>
                <h2 id="company-branding-heading" className="text-base font-bold text-slate-950">{t('branding')}</h2>
              </div>
            </div>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-sm font-bold text-slate-700">{t('companyLogo')}</p>
            </div>
            <div className="flex items-center gap-4">
              <CompanyLogoPreview company={company} />
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-950">{company.name || t('brandName')}</p>
                <p className="text-xs text-slate-500">{company.phone || t('phoneNumber')}</p>
              </div>
            </div>
            <label
              htmlFor="company-logo-upload"
              className="mt-5 flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-4 text-sm font-bold text-slate-700 transition hover:bg-white focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100"
            >
              <ImageUp className="h-4 w-4" aria-hidden="true" /> {t('uploadCompanyLogo')}
              <input id="company-logo-upload" type="file" accept="image/*" onChange={handleLogoUpload} className="sr-only" />
            </label>
            {company.logo && (
              <button type="button" onClick={() => updateCompany('logo', '')} className="mt-3 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100">
                {t('removeLogo')}
              </button>
            )}

            <fieldset className="mt-5 border-t border-slate-200 pt-5" aria-describedby="brand-color-help">
              <legend className="text-sm font-bold text-slate-700">{t('brandColor')}</legend>
              <p id="brand-color-help" className="mt-2 text-xs leading-5 text-slate-500">{t('brandingHelp')}</p>
              <div className="mt-3 grid grid-cols-[64px_minmax(0,1fr)] items-end gap-3">
                <label htmlFor="company-accent-color-picker" className="block text-xs font-bold text-slate-600">
                  {t('pickColor')}
                  <input
                    id="company-accent-color-picker"
                    type="color"
                    value={selectedBrandColor}
                    onChange={(event) => handleBrandColorPickerChange(event.target.value)}
                    aria-describedby="brand-color-help"
                    className="mt-2 h-12 w-16 cursor-pointer rounded-xl border border-slate-200 bg-white p-1 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100"
                  />
                </label>
                <label htmlFor="company-accent-color-hex" className="min-w-0 text-xs font-bold text-slate-600">
                  {t('hexColor')}
                  <input
                    id="company-accent-color-hex"
                    type="text"
                    inputMode="text"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck="false"
                    value={brandColorInput}
                    onChange={(event) => handleBrandColorTextChange(event.target.value)}
                    onBlur={validateBrandColorInput}
                    aria-invalid={Boolean(brandColorError)}
                    aria-describedby={brandColorError ? 'brand-color-help brand-color-error' : 'brand-color-help'}
                    placeholder="#2563EB"
                    className={`mt-2 h-12 w-full min-w-0 rounded-xl border bg-slate-50 px-3 font-mono text-sm font-semibold uppercase outline-none focus:ring-4 ${brandColorError ? 'border-rose-400 text-rose-900 focus:border-rose-500 focus:ring-rose-100' : 'border-slate-200 text-slate-800 focus:border-blue-500 focus:ring-blue-100'}`}
                  />
                </label>
              </div>
              {brandColorError ? <p id="brand-color-error" role="alert" className="mt-2 text-xs font-semibold text-rose-600">{brandColorError}</p> : null}
            </fieldset>

            <div className="mt-5 border-t border-slate-200 pt-5">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{t('onboardingLivePreview')}</p>
              <div className="mt-3 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-3">
                <div className="rounded-xl bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-lg font-black tracking-[0.12em]" style={{ color: selectedBrandColor }}>
                        {t('estimate').toUpperCase()}
                      </p>
                      <p className="mt-1 truncate text-[11px] font-semibold text-slate-500">
                        {company.name || t('brandName')}
                      </p>
                    </div>
                    <CompanyLogoPreview company={company} compact />
                  </div>
                  <div className="my-3 h-0.5 rounded-full" style={{ backgroundColor: selectedBrandColor }} />
                  <div className="flex items-end justify-between gap-3">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: selectedBrandColor }}>
                      {t('totalEstimate')}
                    </span>
                    <span className="text-sm font-black text-slate-950">{previewTotal}</span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm" aria-labelledby="save-settings-heading">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Save className="h-4 w-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <h2 id="save-settings-heading" className="text-sm font-bold text-slate-950">{t('saveSettings')}</h2>
                <p className="mt-1 text-xs leading-5 text-slate-500">{t('settingsSaveHelp')}</p>
              </div>
            </div>
            <button type="button" onClick={saveSettings} disabled={isSaving} aria-busy={isSaving} className="mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-blue-100 disabled:cursor-not-allowed disabled:opacity-60">
              <Save className="h-4 w-4" aria-hidden="true" /> {isSaving ? t('saving') : t('saveSettings')}
            </button>
          </section>
        </aside>
      </section>
    </div>
  )
}

function SettingsInput({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block text-sm font-bold text-slate-700">
      {label}
      <input type={type} value={value ?? ''} onChange={(event) => onChange(event.target.value)} className="mt-2 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
    </label>
  )
}

function SettingsNumberInput({ label, value, onChange, suffix }) {
  return (
    <label className="flex min-w-0 flex-col text-sm font-bold text-slate-700">
      <span className="lg:min-h-10">{label}</span>
      <span className="relative mt-2 block">
        <input
          type="number"
          value={value ?? ''}
          onChange={(event) => onChange(event.target.value)}
          className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-4 pr-14 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
        />
        <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-xs font-semibold text-slate-500">{suffix}</span>
      </span>
    </label>
  )
}

function LanguageSelect({ label, value, onChange, t, alignedCard = false }) {
  const normalizedValue = value === 'es' ? 'es' : 'en'

  return (
    <label className={`${alignedCard ? 'flex min-h-28 flex-col rounded-2xl border border-slate-200 bg-slate-50 p-4' : 'block'} text-sm font-bold text-slate-700`}>
      {label}
      <select
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value === 'es' ? 'es' : 'en')}
        className={`${alignedCard ? 'mt-auto bg-white' : 'mt-2 bg-slate-50'} w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100`}
      >
        <option value="en">🇺🇸 {t('english')}</option>
        <option value="es">🇪🇸 {t('spanish')}</option>
      </select>
    </label>
  )
}

function PortalFeatureCheckbox({ label, checked, onChange }) {
  return (
    <label className={`flex min-h-11 cursor-pointer items-center gap-2.5 rounded-xl border px-3 py-2 text-sm font-semibold transition ${checked ? 'border-blue-200 bg-blue-50 text-blue-900' : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-white'}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="h-4 w-4 shrink-0 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
      />
      <span className="min-w-0">{label}</span>
    </label>
  )
}

function ToggleRow({ label, description = '', checked, onChange, t, alignedCard = false }) {
  return (
    <div className={`${alignedCard ? 'min-h-28' : ''} rounded-2xl border border-slate-200 bg-slate-50 p-4`}>
      <div className={`${alignedCard ? 'h-full min-h-20 flex-col items-start' : 'items-center justify-between'} flex gap-3`}>
        <div className="min-w-0">
          <span className="text-sm font-bold text-slate-700">{label}</span>
          {description ? <p className="mt-1 text-sm text-slate-500">{description}</p> : null}
        </div>
        <button onClick={() => onChange(!checked)} className={`${alignedCard ? 'mt-auto' : ''} rounded-full px-4 py-2 text-xs font-bold ${checked ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-700'}`} type="button">
          {checked ? t('yes') : t('no')}
        </button>
      </div>
    </div>
  )
}

function CompanyLogoPreview({ company, compact = false }) {
  const sizeClass = compact ? 'h-9 w-9 rounded-xl text-xs' : 'h-14 w-14 rounded-2xl text-lg'

  if (company.logo) {
    return <img src={company.logo} alt="" className={`${sizeClass} shrink-0 object-cover ring-1 ring-slate-200`} />
  }
  const initials = (company.name || 'Aymero').split(' ').map((part) => part[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div
      className={`${sizeClass} flex shrink-0 items-center justify-center font-bold text-white shadow-sm`}
      style={{ backgroundColor: normalizeBrandColor(company.primaryColor) }}
    >
      {initials}
    </div>
  )
}
