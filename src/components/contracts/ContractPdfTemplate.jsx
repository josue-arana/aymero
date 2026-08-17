import { currency } from '../../utils/formatters'
import {
  hasContractWorkBreakdown,
  normalizeContractWorkBreakdown,
  shouldRenderContractScopeText,
} from '../../utils/contractDocument'
import {
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
  getEstimateTextSizeCss,
  normalizeEstimateRichText,
} from '../../utils/estimateDocument'
import { EstimateInlineText, EstimateRichTextBlocks } from '../estimates/EstimatePdfTemplate'
import { resolveDocumentBrandTokens } from '../../data/brandColors'
import { getDocumentDensityVariables } from '../../utils/documentDensity'
import {
  ESTIMATE_DOCUMENT_BORDER_WIDTH,
  ESTIMATE_DOCUMENT_HORIZONTAL_PADDING,
  ESTIMATE_RICH_CONTENT_BORDER_WIDTH,
  ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING,
} from '../../utils/estimatePagination'
import '../documents/documentDensity.css'
import './contractDocument.css'

const colors = {
  white: '#ffffff',
  paper: '#fefefe',
  slate200: '#dbe4ee',
  slate300: '#cbd5e1',
  slate500: '#64748b',
  slate900: '#0f172a',
  ink: '#111111',
}

function HeaderPhoneIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path fill={color} d="M6.62 10.79a15.54 15.54 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02z" />
    </svg>
  )
}

function HeaderMailIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path fill={color} d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25zm1.9.1 6.47 4.53a1.1 1.1 0 0 0 1.26 0l6.47-4.53a.25.25 0 0 0-.14-.45H5.04a.25.25 0 0 0-.14.45" />
    </svg>
  )
}

function HeaderWebsiteIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path fill={color} d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m6.93 6h-3.17a15.7 15.7 0 0 0-1.35-3.16A8.05 8.05 0 0 1 18.93 8M12 4c.83 1.2 1.45 2.54 1.82 4h-3.64A13.5 13.5 0 0 1 12 4M4.26 14a7.8 7.8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.81 2h3.17c.3 1.12.76 2.18 1.35 3.16A8.05 8.05 0 0 1 5.07 16M8.24 8H5.07a8.05 8.05 0 0 1 4.52-3.16A15.7 15.7 0 0 0 8.24 8M12 20a13.5 13.5 0 0 1-1.82-4h3.64A13.5 13.5 0 0 1 12 20m2.21-6H9.79a14.4 14.4 0 0 1 0-4h4.42a14.4 14.4 0 0 1 0 4m.2 5.16A15.7 15.7 0 0 0 15.76 16h3.17a8.05 8.05 0 0 1-4.52 3.16M16.34 14a16.5 16.5 0 0 0 0-4h3.4a7.8 7.8 0 0 1 0 4z" />
    </svg>
  )
}

function CompanyContactItem({ icon: Icon, accentColor, children }) {
  return (
    <div style={{ display: 'flex', minWidth: 0, alignItems: 'center', gap: '7px', color: colors.ink }}>
      <Icon color={accentColor} />
      <span style={{ minWidth: 0, fontSize: '11px', lineHeight: 1.35, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{children}</span>
    </div>
  )
}

function CompanyBadge({ company = {}, accentColor, t }) {
  const initials = (company?.name || t('brandName'))
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('') || t('brandInitials')

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--document-company-gap)', minWidth: 0 }}>
      {company?.logo ? (
        <img src={company.logo} alt="" style={{ width: '70px', height: '70px', objectFit: 'contain', flexShrink: 0 }} />
      ) : (
        <div style={{ display: 'flex', width: '70px', height: '70px', alignItems: 'center', justifyContent: 'center', borderRadius: '18px', backgroundColor: colors.slate900, color: colors.white, fontSize: '22px', fontWeight: 700, flexShrink: 0 }}>
          {initials}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '19px', lineHeight: 1.15, fontWeight: 700, color: colors.ink }}>
          {company?.name || t('brandName')}
        </p>
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '6px' }}>
          {company?.phone ? <CompanyContactItem icon={HeaderPhoneIcon} accentColor={accentColor}>{company.phone}</CompanyContactItem> : null}
          {company?.email ? <CompanyContactItem icon={HeaderMailIcon} accentColor={accentColor}>{company.email}</CompanyContactItem> : null}
          {company?.website ? <CompanyContactItem icon={HeaderWebsiteIcon} accentColor={accentColor}>{company.website}</CompanyContactItem> : null}
        </div>
      </div>
    </div>
  )
}

function formatAddressLines(value) {
  const address = String(value || '').trim()
  if (!address) return []
  const commaIndex = address.indexOf(',')
  if (commaIndex === -1) return [address]
  return [address.slice(0, commaIndex).trim(), address.slice(commaIndex + 1).trim()].filter(Boolean)
}

function buildBillToLines(lead = {}, t) {
  const lines = [lead?.client, lead?.phone, lead?.email].filter(Boolean)
  return lines.length ? lines : [t('notAdded')]
}

function buildWorkLines(lead = {}, t) {
  const lines = formatAddressLines(lead?.address || lead?.location || '')
  return lines.length ? lines : [t('unknownAddress')]
}

function buildLicenseLines(company = {}, t) {
  return company?.licenseNumber ? [company.licenseNumber] : [t('notAdded')]
}

function SummaryBlock({ label, children, align = 'left' }) {
  return (
    <div style={{ minWidth: 0, textAlign: align }}>
      <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.ink }}>{label}</p>
      <div style={{ marginTop: 'var(--document-label-gap)', fontSize: '13px', lineHeight: 1.42, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{children}</div>
    </div>
  )
}

function SectionHeading({ children }) {
  return (
    <p data-contract-section-heading="true" style={{ margin: 0, fontSize: '11px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: colors.ink }}>
      {children}
    </p>
  )
}

function getMaterialTagLabel(item, t) {
  if (item?.materialsStatus === ESTIMATE_OWNER_SUPPLIED_MATERIALS) return t('ownerSuppliedMaterials')
  if (item?.materialsStatus === ESTIMATE_LABOR_ONLY || item?.materialsIncluded === false) return t('laborOnly')
  return t('materialsIncludedTag')
}

function MaterialTag({ item, accentColor, accentTextColor, t }) {
  if (!item?.materialsStatus && typeof item?.materialsIncluded !== 'boolean') return null
  return (
    <span style={{ display: 'inline-flex', maxWidth: '100%', alignItems: 'center', border: `1px solid ${accentColor}`, borderRadius: '999px', padding: '2px 7px', color: accentTextColor, fontSize: '9px', lineHeight: 1.35, fontWeight: 650, overflowWrap: 'anywhere' }}>
      {getMaterialTagLabel(item, t)}
    </span>
  )
}

const workBreakdownGridColumns = '24px minmax(0,1fr) 88px'
const workBreakdownColumnGap = '8px'

function ContractWorkBreakdownItem({ item, index, accentColor, accentTextColor, t }) {
  return (
    <div data-line-item-card="true" data-contract-keep-together="true" style={{ display: 'grid', gridTemplateColumns: workBreakdownGridColumns, gap: workBreakdownColumnGap, alignItems: 'start', padding: '13px 0', borderTop: index === 0 ? 'none' : `1px solid ${colors.slate200}`, breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', width: '24px', height: '24px', alignItems: 'center', justifyContent: 'center', borderRadius: '999px', border: `1px solid ${accentColor}`, backgroundColor: colors.white, color: accentTextColor, fontSize: '10px', fontWeight: 700, lineHeight: 1, marginTop: '2px' }}>
        {index + 1}
      </div>
      <div style={{ minWidth: 0 }}>
        <p data-contract-flow-text="true" style={{ margin: 0, fontSize: getEstimateTextSizeCss(item?.titleSize), lineHeight: 1.4, fontWeight: 700, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {item.title ? <EstimateInlineText segments={item.titleSegments} /> : t('item')}
        </p>
        {item.descriptionBlocks?.length ? <div style={{ marginTop: '5px', display: 'grid', gap: '3px' }}><EstimateRichTextBlocks blocks={item.descriptionBlocks} flowTextAttribute="data-contract-flow-text" /></div> : null}
        <div style={{ marginTop: item.descriptionBlocks?.length ? '8px' : '5px' }}>
          <MaterialTag item={item} accentColor={accentColor} accentTextColor={accentTextColor} t={t} />
        </div>
      </div>
      <div style={{ paddingTop: '3px', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '11.5px', lineHeight: 1.4, fontWeight: 700, color: colors.ink }}>
        {currency.format(Number(item?.amount || 0))}
      </div>
    </div>
  )
}

function ProjectScopeSection({ scope, workBreakdown, t }) {
  if (!shouldRenderContractScopeText(scope, workBreakdown)) return null
  return (
    <section data-contract-section="true" style={{ marginTop: 'var(--document-section-gap)' }}>
      <SectionHeading>{t('projectScope')}</SectionHeading>
      <div style={{ marginTop: 'var(--document-scope-gap)', borderRadius: '14px', backgroundColor: colors.white, width: '100%', minWidth: 0, boxSizing: 'border-box', border: `${ESTIMATE_RICH_CONTENT_BORDER_WIDTH}px solid ${colors.slate200}`, padding: `13px ${ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING}px` }}>
        <div style={{ display: 'grid', gap: '5px', minWidth: 0 }}>
          <EstimateRichTextBlocks blocks={normalizeEstimateRichText(scope).blocks} flowTextAttribute="data-contract-flow-text" />
        </div>
      </div>
    </section>
  )
}

function WorkBreakdownSection({ workBreakdown, hasScope, accentColor, accentTextColor, t }) {
  if (!hasContractWorkBreakdown(workBreakdown)) return null
  return (
    <section data-contract-section="true" style={{ marginTop: hasScope ? 'var(--document-card-section-gap)' : 'var(--document-section-gap)' }}>
      <div data-contract-work-heading="true">
        <SectionHeading>{t('workBreakdown')}</SectionHeading>
        <div style={{ display: 'grid', gridTemplateColumns: workBreakdownGridColumns, gap: workBreakdownColumnGap, marginTop: 'var(--document-work-gap)', borderTop: `1px solid ${colors.slate200}`, borderBottom: `1px solid ${colors.slate200}`, padding: '7px 0', color: colors.slate500, fontSize: '9px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
          <span style={{ gridColumn: '1 / 3' }} aria-hidden="true" />
          <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{t('amount')}</span>
        </div>
      </div>
      <div>{workBreakdown.map((item, index) => <ContractWorkBreakdownItem key={item.id || `${item.title}-${index}`} item={item} index={index} accentColor={accentColor} accentTextColor={accentTextColor} t={t} />)}</div>
    </section>
  )
}

function NotesAndTermsSection({ items, t }) {
  if (!Array.isArray(items) || items.length === 0) return null
  const contentItems = items.slice(0, 2).filter(Boolean)
  return (
    <section data-contract-notes="true" data-contract-section="true" style={{ marginTop: 'var(--document-section-gap)', border: `1px solid ${colors.slate200}`, borderRadius: '14px', backgroundColor: colors.white, padding: '14px', breakInside: 'auto', pageBreakInside: 'auto' }}>
      <SectionHeading>{t('notesAndTerms')}</SectionHeading>
      <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: 'minmax(0,1fr)', gap: 0 }}>
        {contentItems.map((item, index) => (
          <div data-contract-notes-item="true" key={item.title} style={{ minWidth: 0, marginTop: index ? '10px' : 0, paddingTop: index ? '10px' : 0, borderTop: index ? `1px solid ${colors.slate200}` : 'none' }}>
            <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.3, fontWeight: 700, color: colors.ink }}>{item.title}</p>
            <div style={{ marginTop: '4px', display: 'grid', gap: '4px', minWidth: 0 }}>
              <EstimateRichTextBlocks blocks={normalizeEstimateRichText(item.content).blocks} flowTextAttribute="data-contract-flow-text" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

function SignatureField({ label, isNameLabel = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ minHeight: '36px', borderBottom: `1px solid ${colors.slate300}` }} />
      <p style={{ margin: '5px 0 0', fontSize: isNameLabel ? '11px' : '10px', lineHeight: 1.25, fontWeight: isNameLabel ? 600 : 700, color: isNameLabel ? colors.ink : colors.slate500, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{label}</p>
    </div>
  )
}

function SignatureSection({ contractorName, clientName, t }) {
  return (
    <section data-contract-signatures="true" data-contract-keep-together="true" style={{ marginTop: 'var(--document-section-gap)', border: `1px solid ${colors.slate200}`, borderRadius: '14px', backgroundColor: colors.white, padding: '14px', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '0.8fr 1.2fr 0.8fr 1.2fr', gap: '14px' }}>
        <SignatureField label={t('contractorDate')} />
        <SignatureField label={contractorName || t('contractor')} isNameLabel />
        <SignatureField label={t('clientDate')} />
        <SignatureField label={clientName || t('client')} isNameLabel />
      </div>
    </section>
  )
}

export function ContractPdfTemplate({ company, lead, contractNumber, contractDate, notesAndTermsItems = [], scope, workBreakdown = [], total, t }) {
  const billToLines = buildBillToLines(lead, t)
  const workLines = buildWorkLines(lead, t)
  const licenseLines = buildLicenseLines(company, t)
  const projectTitle = lead?.projectTitle || lead?.projectType || t('projectScope')
  const normalizedWorkBreakdown = normalizeContractWorkBreakdown(workBreakdown)
  const hasScope = shouldRenderContractScopeText(scope, normalizedWorkBreakdown)
  const { accentColor, accentTextColor } = resolveDocumentBrandTokens(company)

  return (
    <article className="document-sheet document-contract" data-contract-document="true" style={{ ...getDocumentDensityVariables(), '--document-card-padding-x': `${ESTIMATE_DOCUMENT_HORIZONTAL_PADDING}px`, overflow: 'hidden', borderRadius: 'var(--document-card-radius)', border: `${ESTIMATE_DOCUMENT_BORDER_WIDTH}px solid ${colors.slate200}`, backgroundColor: colors.paper, padding: 'var(--document-card-padding-y) var(--document-card-padding-x)', boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)', fontFamily: 'ui-sans-serif, system-ui, sans-serif', color: colors.ink }}>
      <header data-contract-keep-together="true" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
        <div style={{ flex: '1 1 430px', minWidth: 0 }}><CompanyBadge company={company} accentColor={accentColor} t={t} /></div>
        <div style={{ flex: '0 0 210px', minWidth: '210px', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', textAlign: 'right' }}>
          <h1 style={{ margin: 0, fontSize: '36px', lineHeight: 1, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: colors.ink }}>{t('contract')}</h1>
          <p style={{ margin: '9px 0 0', maxWidth: '210px', fontSize: '12px', lineHeight: 1.35, fontWeight: 400, color: accentTextColor, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{contractNumber}</p>
          {contractDate ? <p style={{ margin: '4px 0 0', maxWidth: '210px', fontSize: '10px', lineHeight: 1.35, fontWeight: 400, color: colors.slate500 }}>{contractDate}</p> : null}
        </div>
      </header>

      <section data-contract-summary="true" data-contract-keep-together="true" style={{ marginTop: 'var(--document-section-gap)', borderRadius: '16px', border: `1px solid ${colors.slate200}`, backgroundColor: colors.white, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.35fr) minmax(112px,0.8fr) minmax(144px,1fr)', alignItems: 'stretch' }}>
          <div style={{ minWidth: 0, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}><SummaryBlock label={t('billTo')}><div style={{ display: 'grid', gap: '1px' }}>{billToLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div></SummaryBlock></div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}><SummaryBlock label={t('jobLocation')}><div style={{ display: 'grid', gap: '1px' }}>{workLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div></SummaryBlock></div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}><SummaryBlock label={t('licenseInfo')}><div style={{ display: 'grid', gap: '1px' }}>{licenseLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}</div></SummaryBlock></div>
          <div style={{ borderLeft: `1px solid ${colors.slate300}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)', display: 'flex', flexDirection: 'column', justifyContent: 'center', textAlign: 'right' }}><SummaryBlock label={t('projectTotal')} align="right"><div style={{ fontSize: '25px', lineHeight: 1, fontWeight: 700, letterSpacing: '-0.025em', color: colors.ink }}>{currency.format(Number(total || 0))}</div></SummaryBlock></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0,1fr)', gap: '18px', borderTop: `1px solid ${colors.slate200}`, padding: '12px var(--document-summary-padding-x)', alignItems: 'start' }}>
          <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.35, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.ink }}>{t('project')}</p>
          <p style={{ margin: 0, minWidth: 0, fontSize: '13px', lineHeight: 1.45, fontWeight: 650, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{projectTitle}</p>
        </div>
      </section>

      <ProjectScopeSection scope={scope} workBreakdown={normalizedWorkBreakdown} t={t} />
      <WorkBreakdownSection workBreakdown={normalizedWorkBreakdown} hasScope={hasScope} accentColor={accentColor} accentTextColor={accentTextColor} t={t} />
      <NotesAndTermsSection items={notesAndTermsItems} t={t} />
      <SignatureSection contractorName={company?.ownerName || company?.name || t('brandName')} clientName={lead?.client || ''} t={t} />
    </article>
  )
}

export default ContractPdfTemplate
