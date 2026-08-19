import { NavLink } from 'react-router-dom'
import { appRoutes } from '../../config/appRoutes'
import { LanguageToggleButton } from '../common/LanguageToggleButton'

export function AuthPageShell({ eyebrow, title, description, alternateLabel, alternatePath, alternateActionLabel, children, t, language, setLanguage }) {
  return (
    <div className="min-h-screen min-h-dvh bg-slate-50 pb-[max(2rem,env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pt-[max(2rem,env(safe-area-inset-top))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] lg:pl-[max(2rem,env(safe-area-inset-left))] lg:pr-[max(2rem,env(safe-area-inset-right))]">
      <div className="mx-auto grid max-w-5xl gap-6 lg:grid-cols-[1.05fr,0.95fr]">
        <section className="rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-2xl sm:p-8">
          <div className="flex items-start justify-between gap-4">
            <NavLink to={appRoutes.dashboard} className="inline-flex shrink-0">
              <img
                src="/AymeroLogo_h.png"
                alt={t('brandName')}
                className="block h-auto w-[clamp(11.5rem,45vw,18rem)] object-contain object-left drop-shadow-[0_10px_30px_rgba(15,23,42,0.35)]"
              />
            </NavLink>
            <LanguageToggleButton language={language} setLanguage={setLanguage} t={t} className="border-white/80 bg-white text-slate-900 shadow-sm hover:bg-slate-100" />
          </div>
          <p className="mt-5 text-sm font-medium tracking-[0.08em] text-slate-300 sm:text-base">{t('brandSlogan')}</p>
          <p className="mt-8 text-sm font-semibold uppercase tracking-[0.25em] text-blue-200">{eyebrow}</p>
          <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">{title}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-slate-300">{description}</p>

          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-200">{t('mobileFirst')}</p>
              <p className="mt-2 text-sm font-semibold text-white">{t('authMobileReadyHelp')}</p>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs font-bold uppercase tracking-wide text-blue-200">{t('bilingual')}</p>
              <p className="mt-2 text-sm font-semibold text-white">{t('authBilingualHelp')}</p>
            </div>
          </div>
        </section>

        <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {children}
          <div className="mt-6 border-t border-slate-100 pt-6">
            <p className="text-sm text-slate-500">{alternateLabel}</p>
            <NavLink to={alternatePath} className="mt-2 inline-flex min-h-11 items-center rounded-2xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
              {alternateActionLabel}
            </NavLink>
          </div>
        </section>
      </div>
    </div>
  )
}
