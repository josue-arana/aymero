import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Building2, Check, CheckCircle2, Clock3, Database, ImageUp, LoaderCircle, Palette, PartyPopper, SlidersHorizontal, X } from 'lucide-react'
import { BrandLogo } from '../components/common/BrandLogo'
import { LanguageToggleButton } from '../components/common/LanguageToggleButton'
import { useToast } from '../components/common/ToastProvider'
import { useAuth } from '../contexts/AuthContext'
import { normalizeBrandColor } from '../data/brandColors'
import { createDefaultCompanySettings } from '../data/defaultCompanySettings'
import { getPaymentTermOptions } from '../utils/paymentTerms'

const TOTAL_STEPS = 5

function readStoredDraft(storageKey) {
  if (typeof window === 'undefined') return null

  try {
    return JSON.parse(window.localStorage.getItem(storageKey) || 'null')
  } catch {
    return null
  }
}

function buildDraft(settings, user, storedDraft) {
  const defaults = createDefaultCompanySettings(settings)
  const exampleCompany = createDefaultCompanySettings().company
  const hasExistingCompany = Boolean(settings?.contractorId)
  const storedCompany = storedDraft?.company || {}
  const legacyExampleCompany = { address: 'Baltimore, MD 21201' }
  const firstTimePaymentTerms = settings?.contractorId ? defaults.defaults.paymentTerms : 'net_7'

  function resolveCompanyValue(field, accountValue = '') {
    const storedValue = storedCompany[field]
    const isStaleExampleValue = !hasExistingCompany && (
      storedValue === exampleCompany[field]
      || storedValue === legacyExampleCompany[field]
    )

    if (storedValue !== undefined && storedValue !== null && !isStaleExampleValue) {
      return storedValue
    }

    if (hasExistingCompany) {
      return settings?.company?.[field] || ''
    }

    return accountValue || ''
  }

  return createDefaultCompanySettings({
    ...defaults,
    ...(storedDraft || {}),
    company: {
      ...defaults.company,
      ...storedCompany,
      name: resolveCompanyValue('name', user?.user_metadata?.company_name),
      ownerName: resolveCompanyValue('ownerName', user?.user_metadata?.full_name),
      phone: resolveCompanyValue('phone'),
      email: resolveCompanyValue('email', user?.email),
      address: resolveCompanyValue('address'),
      website: resolveCompanyValue('website'),
      licenseNumber: resolveCompanyValue('licenseNumber'),
    },
    defaults: {
      ...defaults.defaults,
      paymentTerms: firstTimePaymentTerms,
      ...(storedDraft?.defaults || {}),
    },
    onboarding: {
      ...defaults.onboarding,
      ...(storedDraft?.onboarding || {}),
    },
  })
}

function clampStep(value) {
  return Math.min(TOTAL_STEPS, Math.max(1, Number(value) || 1))
}

export function AuthOnboardingPage({
  t,
  language,
  setLanguage,
  settings,
  onPersist,
  onClose,
  onCreateClient,
  onAddSampleData,
  onGoToDashboard,
  isReopen = false,
}) {
  const { completeContractorOnboarding, contractor, user } = useAuth()
  const { showToast } = useToast()
  const storageKey = `aymero.onboarding.${user?.id || 'anonymous'}`
  const storedState = useMemo(() => readStoredDraft(storageKey), [storageKey])
  const [draft, setDraft] = useState(() => buildDraft(settings, user, storedState?.draft))
  const [step, setStep] = useState(() => (
    isReopen && settings?.onboarding?.completed ? 2 : clampStep(storedState?.step || settings?.onboarding?.step || 1)
  ))
  const [resolvedContractorId, setResolvedContractorId] = useState(contractor?.contractorId || settings?.contractorId || '')
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [saveStatus, setSaveStatus] = useState('')
  const [sampleDataState, setSampleDataState] = useState({ mode: 'idle', progress: null })
  const sampleDataActionGuardRef = useRef(false)
  const headingRef = useRef(null)
  const autosaveTimerRef = useRef(null)
  const hasEditedRef = useRef(false)
  const onPersistRef = useRef(onPersist)
  const wasCompletedAtStartRef = useRef(Boolean(settings?.contractorId && settings?.onboarding?.completed))

  useEffect(() => {
    onPersistRef.current = onPersist
  }, [onPersist])

  useEffect(() => {
    if (contractor?.contractorId) setResolvedContractorId(contractor.contractorId)
  }, [contractor?.contractorId])

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ step, draft }))
    } catch {
      // Remote autosave remains authoritative when browser storage is full or unavailable.
    }
  }, [draft, step, storageKey])

  useEffect(() => {
    headingRef.current?.focus()
  }, [step])

  useEffect(() => {
    if (!hasEditedRef.current || !resolvedContractorId || step < 2 || step > 4) return undefined

    window.clearTimeout(autosaveTimerRef.current)
    autosaveTimerRef.current = window.setTimeout(async () => {
      setSaveStatus('saving')
      const result = await onPersistRef.current?.(draft, resolvedContractorId)
      setSaveStatus(result?.error ? 'error' : 'saved')
    }, 700)

    return () => window.clearTimeout(autosaveTimerRef.current)
  }, [draft, resolvedContractorId, step])

  function updateCompany(field, value) {
    hasEditedRef.current = true
    setDraft((current) => ({
      ...current,
      company: { ...current.company, [field]: value },
    }))
  }

  function updateDefaults(field, value) {
    hasEditedRef.current = true
    setDraft((current) => ({
      ...current,
      defaults: { ...current.defaults, [field]: value },
    }))
  }

  function withOnboardingState(currentDraft, onboarding) {
    return createDefaultCompanySettings({
      ...currentDraft,
      onboarding: {
        ...currentDraft.onboarding,
        ...onboarding,
      },
    })
  }

  async function ensureContractorProfile(sourceDraft = draft) {
    if (resolvedContractorId) return { contractorId: resolvedContractorId, error: null }

    const result = await completeContractorOnboarding({
      companyName: sourceDraft.company.name,
      ownerName: sourceDraft.company.ownerName || user?.user_metadata?.full_name || user?.email,
      phone: sourceDraft.company.phone,
      businessEmail: sourceDraft.company.email || user?.email,
      businessAddress: sourceDraft.company.address,
    })

    if (result.error && !result.skipped) {
      return { contractorId: '', error: result.error }
    }

    const contractorId = result.data?.contractorId || contractor?.contractorId || ''
    setResolvedContractorId(contractorId)
    return { contractorId, error: null }
  }

  async function persistStep(nextStep, onboardingOverrides = {}, sourceDraft = draft) {
    const nextDraft = withOnboardingState(sourceDraft, {
      completed: wasCompletedAtStartRef.current,
      dismissed: sourceDraft?.onboarding?.dismissed === true,
      step: nextStep,
      ...onboardingOverrides,
    })
    const profileResult = await ensureContractorProfile(nextDraft)

    if (profileResult.error || !profileResult.contractorId) {
      return { error: profileResult.error || new Error(t('onboardingSaveError')) }
    }

    const result = await onPersistRef.current?.(nextDraft, profileResult.contractorId)

    if (result?.error) return result
    setDraft(result?.data || nextDraft)
    return { ...result, data: result?.data || nextDraft }
  }

  function validateCompany() {
    return Boolean(
      draft.company.name.trim()
      && draft.company.phone.trim()
      && draft.company.email.trim()
    )
  }

  async function continueFlow() {
    if (isSaving) return

    if (step === 1) {
      setStep(2)
      return
    }

    if (step === 2 && !validateCompany()) {
      setErrorMessage(t('onboardingRequiredFieldsError'))
      headingRef.current?.focus()
      return
    }

    setIsSaving(true)
    setErrorMessage('')
    const nextStep = Math.min(TOTAL_STEPS, step + 1)
    const result = await persistStep(nextStep, step === 4
      ? { completed: true, dismissed: false }
      : {})
    setIsSaving(false)

    if (result?.error) {
      setErrorMessage(t('onboardingSaveError'))
      showToast(t('onboardingSaveError'), 'error')
      return
    }

    setSaveStatus('saved')
    setStep(nextStep)

    if (nextStep === TOTAL_STEPS) {
      window.localStorage.removeItem(storageKey)
      showToast(t('onboardingCompleteToast'))
    }
  }

  async function skipForNow() {
    if (isSaving) return
    setIsSaving(true)
    setErrorMessage('')

    const fallbackDraft = createDefaultCompanySettings({
      ...draft,
      company: {
        ...draft.company,
        name: draft.company.name || user?.user_metadata?.company_name || user?.email,
        ownerName: draft.company.ownerName || user?.user_metadata?.full_name || user?.email,
        email: draft.company.email || user?.email,
      },
    })
    const result = await persistStep(step, { completed: false, dismissed: true }, fallbackDraft)
    setIsSaving(false)

    if (result?.error) {
      setErrorMessage(t('onboardingSaveError'))
      showToast(t('onboardingSaveError'), 'error')
      return
    }

    window.localStorage.removeItem(storageKey)
    onClose?.()
  }

  function goBack() {
    if (step <= 1 || isSaving) return
    const previousStep = step - 1
    setStep(previousStep)

    if (resolvedContractorId) {
      void persistStep(previousStep)
    }
  }

  function handleLogoUpload(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (file.size > 2 * 1024 * 1024) {
      showToast(t('onboardingLogoTooLarge'), 'error')
      event.target.value = ''
      return
    }

    const reader = new FileReader()
    reader.onload = () => updateCompany('logo', reader.result)
    reader.readAsDataURL(file)
  }

  async function addSampleData() {
    if (sampleDataActionGuardRef.current || sampleDataState.mode === 'loading') return
    sampleDataActionGuardRef.current = true
    setSampleDataState({ mode: 'loading', progress: { current: 0, total: 8, key: 'sampleDataChecking' } })

    try {
      const result = await onAddSampleData?.((progress) => {
        setSampleDataState({ mode: 'loading', progress })
      })

      if (result?.upgradeRequired || result?.success !== true || result?.installed !== true) {
        setSampleDataState({ mode: 'error', progress: null })
        return
      }

      // Close confirmation and clear any stale retry state before optional UI
      // work such as toasts and navigation runs.
      setSampleDataState({ mode: 'idle', progress: null })

      try {
        showToast(t('sampleDataReadyToast'))
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] Sample workspace installed; the onboarding success toast failed.', {
            failingFunction: 'showToast',
            code: error?.code || 'SAMPLE_DATA_SUCCESS_TOAST_FAILED',
            message: error?.message || null,
          })
        }
      }

      try {
        await onGoToDashboard?.()
      } catch (error) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn('[dev] Sample workspace installed; onboarding navigation failed.', {
            failingFunction: 'onGoToDashboard',
            code: error?.code || 'SAMPLE_DATA_NAVIGATION_FAILED',
            message: error?.message || null,
          })
        }
      }
    } catch (error) {
      setSampleDataState({ mode: 'error', progress: null })
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.error('[dev] Sample workspace installation caller failed before returning a result.', {
          failingFunction: 'onAddSampleData',
          code: error?.code || 'SAMPLE_DATA_CREATE_FAILED',
          message: error?.message || null,
        })
      }
    } finally {
      sampleDataActionGuardRef.current = false
    }
  }

  const stepMeta = [
    { label: t('onboardingStepWelcome'), icon: PartyPopper },
    { label: t('onboardingStepCompany'), icon: Building2 },
    { label: t('onboardingStepBranding'), icon: Palette },
    { label: t('onboardingStepDefaults'), icon: SlidersHorizontal },
    { label: t('onboardingStepReady'), icon: CheckCircle2 },
  ]
  const StepIcon = stepMeta[step - 1].icon
  const progress = (step / TOTAL_STEPS) * 100

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.16),_transparent_28%),linear-gradient(145deg,_#f8fafc_0%,_#eff6ff_50%,_#ecfeff_100%)] text-slate-950">
      <header className="border-b border-white/80 bg-white/75 px-4 py-3.5 backdrop-blur-xl sm:px-6 lg:px-10">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <BrandLogo
            variant="horizontal"
            alt={t('loginBrandAlt')}
            className="h-[3.15rem] w-[12.6rem] overflow-hidden sm:h-14 sm:w-56"
            imageClassName="!object-cover object-center"
          />
          <div className="flex items-center gap-2">
            {saveStatus ? (
              <span aria-live="polite" className="hidden text-xs font-semibold text-slate-500 sm:inline">
                {saveStatus === 'saving' ? t('onboardingSaving') : saveStatus === 'saved' ? t('onboardingSaved') : t('onboardingSaveError')}
              </span>
            ) : null}
            <LanguageToggleButton language={language} setLanguage={setLanguage} t={t} />
            {isReopen ? (
              <button type="button" onClick={onClose} aria-label={t('close')} className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 focus:outline-none focus:ring-4 focus:ring-blue-100">
                <X className="h-5 w-5" />
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="mx-auto grid min-h-[calc(100vh-79px)] max-w-7xl sm:min-h-[calc(100vh-85px)] lg:grid-cols-[300px_1fr]">
        <aside className="hidden border-r border-white/70 px-8 py-10 lg:block">
          <p className="text-xs font-bold uppercase tracking-[0.24em] text-blue-700">{t('onboardingWorkspaceSetup')}</p>
          <ol className="mt-8 space-y-3" aria-label={t('onboardingProgressLabel')}>
            {stepMeta.map(({ label, icon: Icon }, index) => {
              const itemStep = index + 1
              const isActive = itemStep === step
              const isComplete = itemStep < step
              return (
                <li key={label} aria-current={isActive ? 'step' : undefined} className={`flex items-center gap-3 rounded-2xl px-3 py-3 text-sm font-semibold ${isActive ? 'bg-white text-blue-700 shadow-sm ring-1 ring-blue-100' : 'text-slate-500'}`}>
                  <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${isComplete ? 'bg-emerald-100 text-emerald-700' : isActive ? 'bg-blue-600 text-white' : 'bg-white/70 text-slate-400'}`}>
                    {isComplete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  {label}
                </li>
              )
            })}
          </ol>
        </aside>

        <main className="flex min-w-0 flex-col px-4 py-6 sm:px-8 sm:py-10 lg:px-14 lg:py-12">
          <div className="mx-auto flex w-full max-w-3xl flex-1 flex-col">
            <div>
              <div className="flex items-center justify-between gap-4 text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                <span>{t('onboardingStepCount', { current: step, total: TOTAL_STEPS })}</span>
                <span>{stepMeta[step - 1].label}</span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-white shadow-inner" role="progressbar" aria-label={t('onboardingProgressLabel')} aria-valuemin={1} aria-valuemax={TOTAL_STEPS} aria-valuenow={step}>
                <div className="h-full rounded-full bg-gradient-to-r from-blue-600 to-cyan-500 transition-[width] duration-500" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <section key={step} className="onboarding-step-enter flex flex-1 flex-col justify-center py-8 sm:py-12">
              <div className="mb-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg shadow-blue-500/25">
                <StepIcon className="h-7 w-7" />
              </div>
              <StepContent
                step={step}
                draft={draft}
                updateCompany={updateCompany}
                updateDefaults={updateDefaults}
                handleLogoUpload={handleLogoUpload}
                headingRef={headingRef}
                errorMessage={errorMessage}
                t={t}
              />
            </section>

            {step < TOTAL_STEPS ? (
              <footer className="sticky bottom-0 -mx-4 flex flex-col-reverse gap-3 border-t border-white/80 bg-white/85 px-4 py-4 backdrop-blur-xl sm:static sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:border-0 sm:bg-transparent sm:px-0 sm:py-0">
                <div>
                  {step > 1 ? (
                    <button type="button" onClick={goBack} disabled={isSaving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-2xl px-5 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50 sm:w-auto">
                      <ArrowLeft className="h-4 w-4" /> {t('back')}
                    </button>
                  ) : (
                    <button type="button" onClick={skipForNow} disabled={isSaving} className="min-h-12 w-full rounded-2xl px-5 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50 sm:w-auto">
                      {t('onboardingSkipForNow')}
                    </button>
                  )}
                </div>
                <div className="flex flex-col-reverse gap-3 sm:flex-row">
                  {step === 3 ? (
                    <button type="button" onClick={continueFlow} disabled={isSaving} className="min-h-12 rounded-2xl px-5 text-sm font-bold text-slate-600 hover:bg-white disabled:opacity-50">
                      {t('onboardingSkipBranding')}
                    </button>
                  ) : null}
                  <button type="button" onClick={continueFlow} disabled={isSaving} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-950 px-6 text-sm font-bold text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-blue-700 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-60">
                    {isSaving ? t('onboardingSaving') : step === 1 ? t('onboardingGetStarted') : t('continue')}
                    {!isSaving ? <ArrowRight className="h-4 w-4" /> : null}
                  </button>
                </div>
              </footer>
            ) : sampleDataState.mode === 'idle' ? (
              <footer className="grid gap-3 sm:grid-cols-2">
                <button type="button" onClick={onCreateClient} className="min-h-12 rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700">
                  {t('onboardingCreateFirstClient')}
                </button>
                <button type="button" onClick={() => setSampleDataState({ mode: 'confirm', progress: null })} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-blue-200 bg-blue-50 px-6 text-sm font-bold text-blue-700 hover:bg-blue-100">
                  <Database className="h-4 w-4" /> {t('sampleDataExploreAction')}
                </button>
                <button type="button" onClick={onGoToDashboard} className="min-h-12 rounded-2xl px-6 text-sm font-bold text-slate-600 hover:bg-white sm:col-span-2">
                  {t('onboardingGoToDashboard')}
                </button>
              </footer>
            ) : (
              <footer className="rounded-3xl border border-blue-200 bg-white p-5 shadow-lg shadow-slate-950/5" role="status" aria-live="polite">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-blue-100 text-blue-700">
                    {sampleDataState.mode === 'loading' ? <LoaderCircle className="h-5 w-5 animate-spin" /> : <Database className="h-5 w-5" />}
                  </span>
                  <div>
                    <h2 className="font-bold text-slate-950">{t(sampleDataState.mode === 'duplicate' ? 'sampleDataDuplicateTitle' : sampleDataState.mode === 'error' ? 'sampleDataErrorTitle' : sampleDataState.mode === 'loading' ? 'sampleDataCreatingTitle' : 'sampleDataConfirmTitle')}</h2>
                    <p className="mt-1 text-sm leading-6 text-slate-600">
                      {sampleDataState.mode === 'loading'
                        ? t(sampleDataState.progress?.key || 'sampleDataCreating')
                        : t(sampleDataState.mode === 'duplicate' ? 'sampleDataDuplicateBody' : sampleDataState.mode === 'error' ? 'sampleDataErrorBody' : 'sampleDataConfirmBody')}
                    </p>
                    {sampleDataState.mode === 'loading' ? <p className="mt-2 text-xs font-bold text-blue-700">{t('sampleDataProgress', { current: sampleDataState.progress?.current || 0, total: sampleDataState.progress?.total || 8 })}</p> : null}
                  </div>
                </div>
                <div className="mt-5 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                  {sampleDataState.mode !== 'loading' ? <button type="button" onClick={() => setSampleDataState({ mode: 'idle', progress: null })} className="min-h-11 rounded-2xl border border-slate-200 px-4 text-sm font-bold text-slate-700 hover:bg-slate-50">{t('cancel')}</button> : null}
                  {sampleDataState.mode === 'confirm' || sampleDataState.mode === 'error' ? <button type="button" onClick={addSampleData} disabled={sampleDataActionGuardRef.current} className="min-h-11 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60">{t('sampleDataAddAction')}</button> : null}
                  {sampleDataState.mode === 'duplicate' ? <button type="button" onClick={onGoToDashboard} className="min-h-11 rounded-2xl bg-blue-600 px-5 text-sm font-bold text-white hover:bg-blue-700">{t('onboardingGoToDashboard')}</button> : null}
                </div>
              </footer>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}

function StepContent({ step, draft, updateCompany, updateDefaults, handleLogoUpload, headingRef, errorMessage, t }) {
  const company = draft.company
  const defaults = draft.defaults

  if (step === 1) {
    return (
      <div>
        <h1 ref={headingRef} tabIndex="-1" className="max-w-2xl text-4xl font-bold tracking-tight outline-none sm:text-5xl">{t('onboardingWelcomeTitle')}</h1>
        <p className="mt-5 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">{t('onboardingWelcomeSubtitle')}</p>
        <div className="mt-8 inline-flex items-center gap-3 rounded-2xl border border-blue-100 bg-white px-4 py-3 text-sm font-semibold text-slate-600 shadow-sm">
          <Clock3 className="h-5 w-5 text-blue-600" /> {t('onboardingEstimatedTime')}
        </div>
      </div>
    )
  }

  if (step === 2) {
    return (
      <div>
        <h1 ref={headingRef} tabIndex="-1" className="text-3xl font-bold tracking-tight outline-none sm:text-4xl">{t('onboardingCompanyTitle')}</h1>
        <p className="mt-3 text-slate-600">{t('onboardingCompanySubtitle')}</p>
        {errorMessage ? <p role="alert" className="mt-5 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">{errorMessage}</p> : null}
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <OnboardingInput id="onboarding-company" label={t('companyName')} value={company.name} onChange={(value) => updateCompany('name', value)} required />
          <OnboardingInput id="onboarding-phone" type="tel" label={t('phoneNumber')} value={company.phone} onChange={(value) => updateCompany('phone', value)} placeholder={t('onboardingPhonePlaceholder')} required />
          <OnboardingInput id="onboarding-email" type="email" label={t('businessEmailLabel')} value={company.email} onChange={(value) => updateCompany('email', value)} required />
          <OnboardingInput id="onboarding-website" type="url" label={t('onboardingWebsiteOptional')} value={company.website} onChange={(value) => updateCompany('website', value)} placeholder={t('onboardingWebsitePlaceholder')} />
          <div className="sm:col-span-2">
            <OnboardingInput id="onboarding-license" label={t('onboardingLicenseOptional')} value={company.licenseNumber} onChange={(value) => updateCompany('licenseNumber', value)} placeholder={t('onboardingLicensePlaceholder')} />
          </div>
        </div>
      </div>
    )
  }

  if (step === 3) {
    const initials = (company.name || 'Aymero').split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()
    const onboardingBrandColor = normalizeBrandColor(company.primaryColor)
    return (
      <div>
        <h1 ref={headingRef} tabIndex="-1" className="text-3xl font-bold tracking-tight outline-none sm:text-4xl">{t('onboardingBrandingTitle')}</h1>
        <p className="mt-3 text-slate-600">{t('onboardingBrandingSubtitle')}</p>
        <div className="mt-7 grid gap-5 md:grid-cols-[1fr_260px]">
          <div className="space-y-4">
            <label htmlFor="onboarding-logo" className="flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-3xl border-2 border-dashed border-slate-300 bg-white px-5 text-center transition hover:border-blue-400 hover:bg-blue-50/40 focus-within:ring-4 focus-within:ring-blue-100">
              <ImageUp className="h-6 w-6 text-blue-600" />
              <span className="mt-3 text-sm font-bold text-slate-800">{t('uploadCompanyLogo')}</span>
              <span className="mt-1 text-xs text-slate-500">{t('onboardingLogoHelp')}</span>
              <input id="onboarding-logo" type="file" accept="image/png,image/jpeg,image/webp" onChange={handleLogoUpload} className="sr-only" />
            </label>
            <label htmlFor="onboarding-color" className="block text-sm font-bold text-slate-700">
              {t('onboardingPrimaryColorOptional')}
              <div className="mt-2 flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
                <input id="onboarding-color" type="color" value={onboardingBrandColor} onChange={(event) => updateCompany('primaryColor', normalizeBrandColor(event.target.value))} className="h-10 w-14 cursor-pointer rounded-lg border-0 bg-transparent" />
                <span className="font-mono text-sm text-slate-600">{onboardingBrandColor}</span>
              </div>
            </label>
          </div>
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-xl shadow-slate-950/5">
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">{t('onboardingLivePreview')}</p>
            <div className="mt-6 flex items-center gap-3">
              {company.logo ? <img src={company.logo} alt={t('onboardingLogoPreviewAlt')} className="h-14 w-14 rounded-2xl object-cover ring-1 ring-slate-200" /> : <span className="flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ backgroundColor: onboardingBrandColor }}>{initials}</span>}
              <div className="min-w-0"><p className="truncate font-bold text-slate-950">{company.name || t('brandName')}</p><p className="text-sm text-slate-500">{t('onboardingWorkspacePreview')}</p></div>
            </div>
            <div className="mt-7 h-2 rounded-full" style={{ backgroundColor: onboardingBrandColor }} />
          </div>
        </div>
      </div>
    )
  }

  if (step === 4) {
    const paymentTermOptions = getPaymentTermOptions(t, defaults.paymentTerms)

    return (
      <div>
        <h1 ref={headingRef} tabIndex="-1" className="text-3xl font-bold tracking-tight outline-none sm:text-4xl">{t('onboardingDefaultsTitle')}</h1>
        <p className="mt-3 text-slate-600">{t('onboardingDefaultsSubtitle')}</p>
        <div className="mt-7 grid gap-4 sm:grid-cols-2">
          <OnboardingInput id="onboarding-tax" type="number" min="0" max="100" step="0.001" label={t('onboardingDefaultTaxRate')} helper={t('onboardingTaxRateHelper')} value={defaults.taxRate} onChange={(value) => updateDefaults('taxRate', Math.min(100, Math.max(0, Number(value || 0))))} suffix="%" />
          <OnboardingSelect id="onboarding-terms" label={t('onboardingDefaultPaymentTerms')} helper={t('onboardingPaymentTermsHelper')} value={defaults.paymentTerms} onChange={(value) => updateDefaults('paymentTerms', value)} options={paymentTermOptions} />
          <OnboardingSelect id="onboarding-expiration" label={t('onboardingEstimateExpiration')} helper={t('onboardingEstimateExpirationHelper')} value={String(defaults.estimateExpirationDays)} onChange={(value) => updateDefaults('estimateExpirationDays', Number(value))} options={[
            ['7', t('onboardingDays', { count: 7 })], ['14', t('onboardingDays', { count: 14 })], ['30', t('onboardingDays', { count: 30 })], ['60', t('onboardingDays', { count: 60 })],
          ]} />
          <OnboardingSelect id="onboarding-currency" label={t('onboardingCurrency')} helper={t('onboardingCurrencyHelper')} value={defaults.currency} onChange={(value) => updateDefaults('currency', value)} options={[
            ['USD', t('onboardingCurrencyUsd')], ['CAD', t('onboardingCurrencyCad')], ['MXN', t('onboardingCurrencyMxn')],
          ]} />
        </div>
      </div>
    )
  }

  return (
    <div className="text-center">
      <div className="mx-auto flex h-24 w-24 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 shadow-[0_0_0_14px_rgba(16,185,129,0.08)]">
        <Check className="h-12 w-12" strokeWidth={2.5} />
      </div>
      <h1 ref={headingRef} tabIndex="-1" className="mt-9 text-4xl font-bold tracking-tight outline-none sm:text-5xl">{t('onboardingSuccessTitle')}</h1>
      <p className="mx-auto mt-5 max-w-xl text-base leading-7 text-slate-600 sm:text-lg">{t('onboardingSuccessSubtitle')}</p>
    </div>
  )
}

function OnboardingInput({ id, label, helper = '', value, onChange, required = false, suffix = '', ...inputProps }) {
  return (
    <div className="flex h-full flex-col text-sm text-slate-700">
      <label htmlFor={id} className="font-bold">{label}{required ? <span aria-hidden="true" className="ml-1 text-rose-500">*</span> : null}</label>
      {helper ? <p id={`${id}-helper`} className="mt-1 text-xs font-normal leading-5 text-slate-500">{helper}</p> : null}
      <span className="relative mt-auto block pt-2">
        <input id={id} value={value ?? ''} onChange={(event) => onChange(event.target.value)} required={required} aria-required={required} aria-describedby={helper ? `${id}-helper` : undefined} className={`w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100 ${suffix ? 'pr-10' : ''}`} {...inputProps} />
        {suffix ? <span className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm font-bold text-slate-400">{suffix}</span> : null}
      </span>
    </div>
  )
}

function OnboardingSelect({ id, label, helper = '', value, onChange, options }) {
  return (
    <div className="flex h-full flex-col text-sm text-slate-700">
      <label htmlFor={id} className="font-bold">{label}</label>
      {helper ? <p id={`${id}-helper`} className="mt-1 text-xs font-normal leading-5 text-slate-500">{helper}</p> : null}
      <span className="mt-auto block pt-2">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={helper ? `${id}-helper` : undefined} className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-sm outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
          {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
        </select>
      </span>
    </div>
  )
}

export default AuthOnboardingPage
