import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, MapPin, Phone } from 'lucide-react'
import { useParams } from 'react-router-dom'
import { PortalSummary } from '../components/portal/PortalSummary'
import { usePortalProjectData } from '../hooks/usePortalProjectData'
import './customerPortalPage.css'
import heroBackground from '../assets/portal/blue-bg.png'
import dataProvider from '../services/dataProvider'
import { currency } from '../utils/formatters'
import { dedupeById, resolveLinkedProjectId } from '../utils/projectIdentity'

function normalizePortalPhoto(photo = {}, fallbackProjectId = '', fallbackContractorId = '', fallbackClientId = null) {
  const previewUrl = photo.previewUrl || photo.url || ''
  const filePath = photo.filePath || photo.file_path || ''
  const fileName = photo.fileName || photo.file_name || filePath.split('/').pop() || ''
  const label = photo.label || fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || photo.caption || photo.description || ''

  return {
    ...photo,
    id: photo.id || filePath || previewUrl || label,
    contractorId: photo.contractorId || photo.contractor_id || fallbackContractorId,
    contractor_id: photo.contractorId || photo.contractor_id || fallbackContractorId,
    clientId: photo.clientId || photo.client_id || fallbackClientId,
    client_id: photo.clientId || photo.client_id || fallbackClientId,
    projectId: photo.projectId || photo.project_id || fallbackProjectId,
    project_id: photo.projectId || photo.project_id || fallbackProjectId,
    filePath,
    file_path: filePath,
    fileName,
    file_name: fileName,
    fileSize: Number(photo.fileSize || photo.file_size || 0) || 0,
    file_size: Number(photo.fileSize || photo.file_size || 0) || 0,
    mimeType: photo.mimeType || photo.mime_type || '',
    mime_type: photo.mimeType || photo.mime_type || '',
    caption: photo.caption || photo.description || '',
    description: photo.caption || photo.description || '',
    label: label || 'Project Photo',
    previewUrl,
    url: previewUrl,
    createdAt: photo.createdAt || photo.created_at || '',
    created_at: photo.createdAt || photo.created_at || '',
    source: photo.source || 'portal',
  }
}

function dedupePortalPhotos(photos = [], fallbackProjectId = '', fallbackContractorId = '', fallbackClientId = null) {
  return dedupeById(
    photos
      .map((photo) => normalizePortalPhoto(photo, fallbackProjectId, fallbackContractorId, fallbackClientId))
      .filter((photo) => Boolean(photo.previewUrl || photo.url)),
    ['filePath', 'url', 'label']
  )
}

function logPortalPhotoLoadError(error, meta = {}) {
  if (!import.meta.env.DEV) return

  // eslint-disable-next-line no-console
  console.error('[dev] CustomerPortalPage failed to load project photos.', {
    error,
    ...meta,
  })
}

function ClientPortalPageContainer({ children, loading = false }) {
  return (
    <main className={`client-portal-page${loading ? ' client-portal-page--loading' : ''}`}>
      <div className={`client-portal-page__container${loading ? ' client-portal-page__container--loading' : ''}`}>
        {children}
      </div>
    </main>
  )
}

function CustomerPortalNotFound({ onBack, canGoBack = false, isUnavailable = false, t }) {
  return (
    <ClientPortalPageContainer>
      <section className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-bold text-slate-950">{t(isUnavailable ? 'clientPortalUnavailable' : 'clientPortalNotFound')}</h1>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-slate-500">{t(isUnavailable ? 'clientPortalUnavailableHelp' : 'clientPortalNotFoundHelp')}</p>
        {canGoBack ? (
          <button type="button" onClick={onBack} className="mt-6 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-bold text-white hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2">
            {t('back')}
          </button>
        ) : null}
      </section>
    </ClientPortalPageContainer>
  )
}

function CustomerPortalLoading({ t }) {
  return (
    <ClientPortalPageContainer loading>
      <div className="client-portal-loader" role="status" aria-live="polite">
        <span className="client-portal-loader__mark" aria-hidden="true">
          <span className="client-portal-loader__core" />
        </span>
        <div>
          <h1 className="client-portal-loader__title">{t('loadingClientPortal')}</h1>
          <p className="client-portal-loader__message">{t('loadingClientPortalHelp')}</p>
        </div>
      </div>
    </ClientPortalPageContainer>
  )
}

export function CustomerPortalPage({ projects = [], clients = [], onBack, t, language, setLanguage, companySettings }) {
  const { portalId, id, leadId } = useParams()
  const resolvedPortalId = portalId || id || leadId || ''
  const {
    project,
    client,
    estimate,
    contract,
    paymentSummary,
    scheduleEvents,
    upcomingEvents,
    isLoading,
    notFound,
    contractorId,
    publicCompanySettings,
    publicPortalPhotos,
    portalVisibility,
    portalLoadError,
  } = usePortalProjectData({
    portalId: resolvedPortalId,
    projects,
    clients,
  })
  const [projectPhotos, setProjectPhotos] = useState([])
  const [isLoadingPhotos, setIsLoadingPhotos] = useState(false)
  const [photosLoadFailed, setPhotosLoadFailed] = useState(false)
  const hasAppliedPublicLanguage = useRef(false)
  const resolvedCompanySettings = publicCompanySettings || companySettings
  const showPayments = portalVisibility?.showPayments ?? resolvedCompanySettings?.portal?.showPayments ?? true
  const showPhotos = portalVisibility?.showPhotos ?? resolvedCompanySettings?.portal?.showPhotos ?? true
  const showDocuments = portalVisibility?.showDocuments ?? resolvedCompanySettings?.portal?.showDocuments ?? true

  useEffect(() => {
    const publicLanguage = publicCompanySettings?.portal?.defaultLanguage
    if (hasAppliedPublicLanguage.current || !publicLanguage) return

    hasAppliedPublicLanguage.current = true
    if (publicLanguage !== language) setLanguage(publicLanguage)
  }, [language, publicCompanySettings?.portal?.defaultLanguage, setLanguage])

  const resolvedProjectId = useMemo(
    () => resolveLinkedProjectId(project, resolvedPortalId),
    [project, resolvedPortalId]
  )
  const resolvedContractorId = useMemo(
    () => project?.contractorId || project?.contractor_id || contractorId || '',
    [contractorId, project]
  )
  const resolvedClientId = useMemo(
    () => client?.id || project?.clientId || project?.client_id || null,
    [client, project]
  )
  const fallbackProjectPhotos = useMemo(() => dedupePortalPhotos([
    ...(Array.isArray(project?.photos) ? project.photos : []),
    ...(Array.isArray(project?.portal?.photos) ? project.portal.photos : []),
  ], resolvedProjectId, resolvedContractorId, resolvedClientId), [project?.photos, project?.portal?.photos, resolvedClientId, resolvedContractorId, resolvedProjectId])

  useEffect(() => {
    let isCancelled = false

    async function loadProjectPhotos() {
      if (!showPhotos) {
        setProjectPhotos([])
        setPhotosLoadFailed(false)
        setIsLoadingPhotos(false)
        return
      }

      if (project?.publicPortalData) {
        setProjectPhotos(dedupePortalPhotos(publicPortalPhotos, resolvedProjectId, '', resolvedClientId))
        setPhotosLoadFailed(false)
        setIsLoadingPhotos(false)
        return
      }

      if (!resolvedProjectId || !resolvedContractorId) {
        setProjectPhotos(fallbackProjectPhotos)
        setPhotosLoadFailed(false)
        setIsLoadingPhotos(false)
        return
      }

      setIsLoadingPhotos(true)
      setPhotosLoadFailed(false)

      try {
        const response = await dataProvider.photos.listProjectPhotos({
          contractorId: resolvedContractorId,
          projectId: resolvedProjectId,
        })

        if (isCancelled) return

        if (response?.error) {
          setProjectPhotos(fallbackProjectPhotos)
          setPhotosLoadFailed(true)
          logPortalPhotoLoadError(response.error, {
            contractorId: resolvedContractorId,
            projectId: resolvedProjectId,
            clientId: resolvedClientId,
          })
          return
        }

        const persistedPhotos = Array.isArray(response?.data) ? response.data : []
        const nextPhotos = response?.skipped ? [...persistedPhotos, ...fallbackProjectPhotos] : persistedPhotos

        setProjectPhotos(dedupePortalPhotos(
          nextPhotos,
          resolvedProjectId,
          resolvedContractorId,
          resolvedClientId
        ))
      } catch (error) {
        if (!isCancelled) {
          setProjectPhotos(fallbackProjectPhotos)
          setPhotosLoadFailed(true)
          logPortalPhotoLoadError(error, {
            contractorId: resolvedContractorId,
            projectId: resolvedProjectId,
            clientId: resolvedClientId,
          })
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingPhotos(false)
        }
      }
    }

    loadProjectPhotos()

    return () => {
      isCancelled = true
    }
  }, [fallbackProjectPhotos, project?.publicPortalData, publicPortalPhotos, resolvedClientId, resolvedContractorId, resolvedProjectId, showPhotos])

  if (isLoading) {
    return <CustomerPortalLoading t={t} />
  }

  if (notFound) {
    const canGoBack = typeof document !== 'undefined' && Boolean(document.referrer)
    return <CustomerPortalNotFound onBack={() => onBack?.(resolvedPortalId)} canGoBack={canGoBack} isUnavailable={Boolean(portalLoadError && portalLoadError.code !== 'PORTAL_NOT_FOUND')} t={t} />
  }

  const clientName = client?.displayName || client?.name || project?.client || project?.clientName || t('notAdded')
  const projectTitle = project?.projectTitle || project?.projectType || t('notAdded')
  const projectAddress = project?.address || project?.location || ''
  const projectValue = Number(paymentSummary?.projectValue ?? project?.value ?? project?.contractValue ?? project?.estimatedValue)
  const amountPaid = Number(paymentSummary?.totalPaid ?? 0)
  const balanceDue = Number(paymentSummary?.outstandingBalance ?? 0)
  const projectPhone = client?.phone || project?.phone || ''
  const isPublicTokenPortal = project?.publicPortalData === true

  return (
    <ClientPortalPageContainer>
      <div className={`flex items-center gap-3 ${isPublicTokenPortal ? 'justify-end' : 'justify-between'}`}>
        {!isPublicTokenPortal ? (
          <button onClick={() => onBack?.(project?.id || project?.projectId || resolvedPortalId)} className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-950">
            <ArrowLeft className="h-4 w-4" /> {t('back')}
          </button>
        ) : null}
        <button onClick={() => setLanguage(language === 'en' ? 'es' : 'en')} className="rounded-2xl border border-slate-200 bg-white px-4 py-3 text-xs font-bold text-slate-700 hover:bg-slate-50">{language === 'en' ? '🇪🇸 Español' : '🇺🇸 English'}</button>
      </div>

      <div className="client-portal-page__sections">
        <section className="overflow-hidden rounded-[2rem] border border-slate-200 bg-white shadow-sm">
          <div
            className="relative overflow-hidden bg-slate-950 text-white"
            style={{
              backgroundImage: `linear-gradient(135deg, rgba(2, 6, 23, 0.75), rgba(15, 23, 42, 0.25)), url(${heroBackground})`,
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          >
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/45 via-slate-950/20 to-transparent" />
            <div className="relative p-6 sm:p-7 lg:p-8">
              <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                <div className="min-w-0 max-w-3xl flex-1">
                  <div className="mb-4 flex items-center gap-3">
                    {resolvedCompanySettings?.company?.logo ? <img src={resolvedCompanySettings.company.logo} alt="" className="h-12 w-12 rounded-2xl object-cover ring-1 ring-white/20" /> : <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/10 text-sm font-bold text-white ring-1 ring-white/20">{t('brandInitials')}</div>}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-white">{resolvedCompanySettings?.company?.name || t('brandName')}</p>
                      <p className="text-xs font-semibold uppercase tracking-[0.24em] text-blue-200">{t('customerPortal')}</p>
                    </div>
                  </div>

                  <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{projectTitle}</h1>

                  <div className="mt-4 space-y-2 text-sm text-slate-200 sm:text-base">
                    <p className="font-semibold text-white">{clientName}</p>
                    {projectAddress ? (
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                        <span>{projectAddress}</span>
                      </p>
                    ) : null}
                    {projectPhone ? (
                      <p className="flex items-start gap-2">
                        <Phone className="mt-0.5 h-4 w-4 shrink-0 text-blue-200" />
                        <span>{projectPhone}</span>
                      </p>
                    ) : null}
                  </div>
                </div>

                <dl className="client-portal-hero__metrics">
                  <div className="client-portal-hero__metric">
                    <dt>{t('projectValue')}</dt>
                    <dd>{currency.format(Number.isFinite(projectValue) ? projectValue : 0)}</dd>
                  </div>
                  <div className="client-portal-hero__metric">
                    <dt>{t('amountPaid')}</dt>
                    <dd>{currency.format(Number.isFinite(amountPaid) ? amountPaid : 0)}</dd>
                  </div>
                  <div className="client-portal-hero__metric">
                    <dt>{t('balanceDue')}</dt>
                    <dd>{currency.format(Number.isFinite(balanceDue) ? balanceDue : 0)}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        </section>

        <PortalSummary
          project={project}
          client={client}
          estimate={estimate}
          contract={contract}
          paymentSummary={paymentSummary}
          scheduleEvents={scheduleEvents}
          upcomingEvents={upcomingEvents}
          projectPhotos={projectPhotos}
          isLoadingPhotos={isLoadingPhotos}
          photosLoadFailed={photosLoadFailed}
          company={resolvedCompanySettings?.company}
          showPayments={showPayments}
          showPhotos={showPhotos}
          showDocuments={showDocuments}
          t={t}
        />
      </div>
    </ClientPortalPageContainer>
  )
}
