import { FileText } from 'lucide-react'
import { currency } from '../../utils/formatters'
import { getLanguageLocale } from '../../utils/language'
import { getDocumentDensityVariables } from '../../utils/documentDensity'
import {
  ensureNormalizedEstimateDocument,
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
} from '../../utils/estimateDocument'
import { getPaymentTermLabel } from '../../utils/paymentTerms'
import '../documents/documentDensity.css'

const colors = {
  white: '#ffffff',
  paper: '#fefefe',
  slate200: '#dbe4ee',
  slate300: '#cbd5e1',
  slate500: '#64748b',
  slate900: '#0f172a',
  ink: '#111111',
  teal700: '#0e7490',
}

function resolveCompanyAccentColor(company = {}) {
  const configuredColor = String(company?.primaryColor || company?.primary_color || '').trim()

  return /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(configuredColor)
    ? configuredColor
    : '#2563eb'
}

function formatDisplayDate(value, language = 'en') {
  if (!value) {
    return new Date().toLocaleDateString(getLanguageLocale(language), { month: 'long', day: 'numeric', year: 'numeric' })
  }

  const parsedDate = new Date(value)
  if (Number.isNaN(parsedDate.getTime())) {
    return String(value)
  }

  return parsedDate.toLocaleDateString(getLanguageLocale(language), { month: 'long', day: 'numeric', year: 'numeric' })
}

function HeaderPhoneIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={color}
        d="M6.62 10.79a15.54 15.54 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02z"
      />
    </svg>
  )
}

function HeaderMailIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={color}
        d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25zm1.9.1 6.47 4.53a1.1 1.1 0 0 0 1.26 0l6.47-4.53a.25.25 0 0 0-.14-.45H5.04a.25.25 0 0 0-.14.45"
      />
    </svg>
  )
}

function HeaderWebsiteIcon({ color }) {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={color}
        d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20m6.93 6h-3.17a15.7 15.7 0 0 0-1.35-3.16A8.05 8.05 0 0 1 18.93 8M12 4c.83 1.2 1.45 2.54 1.82 4h-3.64A13.5 13.5 0 0 1 12 4M4.26 14a7.8 7.8 0 0 1 0-4h3.4a16.5 16.5 0 0 0 0 4zm.81 2h3.17c.3 1.12.76 2.18 1.35 3.16A8.05 8.05 0 0 1 5.07 16M8.24 8H5.07a8.05 8.05 0 0 1 4.52-3.16A15.7 15.7 0 0 0 8.24 8M12 20a13.5 13.5 0 0 1-1.82-4h3.64A13.5 13.5 0 0 1 12 20m2.21-6H9.79a14.4 14.4 0 0 1 0-4h4.42a14.4 14.4 0 0 1 0 4m.2 5.16A15.7 15.7 0 0 0 15.76 16h3.17a8.05 8.05 0 0 1-4.52 3.16M16.34 14a16.5 16.5 0 0 0 0-4h3.4a7.8 7.8 0 0 1 0 4z"
      />
    </svg>
  )
}

function formatAddressLines(value) {
  const address = String(value || '').trim()
  if (!address) return []

  const commaIndex = address.indexOf(',')
  if (commaIndex === -1) {
    return [address]
  }

  const firstLine = address.slice(0, commaIndex).trim()
  const secondLine = address.slice(commaIndex + 1).trim()

  return [firstLine, secondLine].filter(Boolean)
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
        <img
          src={company.logo}
          alt=""
          style={{
            width: '70px',
            height: '70px',
            objectFit: 'contain',
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            width: '70px',
            height: '70px',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: '18px',
            backgroundColor: accentColor,
            color: colors.white,
            fontSize: '22px',
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          {initials}
        </div>
      )}
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: '19px', lineHeight: 1.15, fontWeight: 700, color: colors.ink }}>
          {company?.name || t('brandName')}
        </p>
        <div style={{ marginTop: '10px', display: 'flex', flexWrap: 'wrap', columnGap: '16px', rowGap: '6px' }}>
          {company?.phone ? (
            <CompanyContactItem icon={HeaderPhoneIcon} accentColor={accentColor}>{company.phone}</CompanyContactItem>
          ) : null}
          {company?.email ? (
            <CompanyContactItem icon={HeaderMailIcon} accentColor={accentColor}>{company.email}</CompanyContactItem>
          ) : null}
          {company?.website ? (
            <CompanyContactItem icon={HeaderWebsiteIcon} accentColor={accentColor}>{company.website}</CompanyContactItem>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SummaryBlock({ label, accentColor, children, align = 'left' }) {
  return (
    <div style={{ minWidth: 0 }}>
      <p
        style={{
          margin: 0,
          fontSize: '11px',
          lineHeight: 1.3,
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: accentColor,
          textAlign: align,
        }}
      >
        {label}
      </p>
      <div style={{ marginTop: 'var(--document-label-gap)', fontSize: '13px', lineHeight: 1.42, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word', textAlign: align }}>
        {children}
      </div>
    </div>
  )
}

function getMaterialsTagLabel(materialsStatus, t) {
  if (materialsStatus === ESTIMATE_OWNER_SUPPLIED_MATERIALS) {
    return t('ownerSuppliedMaterials')
  }

  if (materialsStatus === ESTIMATE_LABOR_ONLY) {
    return t('laborOnly')
  }

  return t('materialsIncludedTag')
}

function MaterialTag({ materialsStatus, accentColor, t }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        maxWidth: '100%',
        alignItems: 'center',
        border: `1px solid ${accentColor}`,
        borderRadius: '999px',
        padding: '2px 7px',
        color: accentColor,
        fontSize: '9px',
        lineHeight: 1.35,
        fontWeight: 650,
        overflowWrap: 'anywhere',
      }}
    >
      {getMaterialsTagLabel(materialsStatus, t)}
    </span>
  )
}

function RichWorkItemContent({ blocks = [], accentColor }) {
  return blocks.map((block, blockIndex) => {
    if (block?.type === 'lineBreak') {
      return <div key={`break-${blockIndex}`} style={{ height: '7px' }} aria-hidden="true" />
    }

    if (block?.type === 'bulletList') {
      return (
        <ul key={`bullets-${blockIndex}`} style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4px' }}>
          {(block.items || []).map((bullet, bulletIndex) => (
            <li key={`${blockIndex}-${bulletIndex}`} style={{ display: 'grid', gridTemplateColumns: '8px minmax(0,1fr)', gap: '7px', alignItems: 'start' }}>
              <span aria-hidden="true" style={{ width: '3px', height: '3px', marginTop: '6px', borderRadius: '999px', backgroundColor: accentColor }} />
              <span style={{ minWidth: 0, whiteSpace: 'pre-wrap', fontSize: '11.5px', lineHeight: 1.48, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                {bullet.text}
              </span>
            </li>
          ))}
        </ul>
      )
    }

    if (block?.type === 'paragraph') {
      return (
        <p key={`paragraph-${blockIndex}`} style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: '11.5px', lineHeight: 1.5, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          {block.text}
        </p>
      )
    }

    return null
  })
}

function formatEstimateQuantity(value, language) {
  const quantity = Number(value)
  if (!Number.isFinite(quantity)) return '0'

  return quantity.toLocaleString(getLanguageLocale(language), {
    maximumFractionDigits: 2,
  })
}

const workBreakdownGridColumns = '28px minmax(0,1fr) 44px 78px 86px'

function WorkBreakdownItem({ item, index, accentColor, language, t }) {
  const descriptionBlocks = Array.isArray(item?.descriptionBlocks) ? item.descriptionBlocks : []

  return (
    <div
      data-line-item-card="true"
      style={{
        display: 'grid',
        gridTemplateColumns: workBreakdownGridColumns,
        gap: '10px',
        alignItems: 'start',
        padding: '13px 0',
        borderTop: index === 0 ? 'none' : `1px solid ${colors.slate200}`,
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '24px',
          height: '24px',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '999px',
          border: `1px solid ${accentColor}`,
          backgroundColor: colors.white,
          color: accentColor,
          fontSize: '10px',
          fontWeight: 700,
          lineHeight: 1,
          marginTop: '2px',
        }}
      >
        {index + 1}
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '12.5px',
            lineHeight: 1.4,
            fontWeight: 700,
            color: colors.ink,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {item?.title || t('item')}
        </p>
        {descriptionBlocks.length ? (
          <div style={{ marginTop: '5px', display: 'grid', gap: '3px' }}>
            <RichWorkItemContent blocks={descriptionBlocks} accentColor={accentColor} />
          </div>
        ) : null}
        <div style={{ marginTop: descriptionBlocks.length ? '8px' : '5px' }}>
          <MaterialTag materialsStatus={item?.materialsStatus} accentColor={accentColor} t={t} />
        </div>
      </div>
      <div style={{ paddingTop: '3px', textAlign: 'right', fontSize: '11px', lineHeight: 1.4, color: colors.ink }}>
        {formatEstimateQuantity(item?.quantity, language)}
      </div>
      <div style={{ paddingTop: '3px', textAlign: 'right', fontSize: '11px', lineHeight: 1.4, color: colors.ink }}>
        {currency.format(Number(item?.rate || 0))}
      </div>
      <div style={{ paddingTop: '3px', textAlign: 'right', fontSize: '11.5px', lineHeight: 1.4, fontWeight: 700, color: colors.ink }}>
        {currency.format(Number(item?.total || 0))}
      </div>
    </div>
  )
}

export function EstimatePdfTemplate({
  company,
  lead,
  estimateNumber,
  estimateDate,
  scope,
  materialsIncluded,
  paymentTerms,
  total,
  lineItems = [],
  documentModel,
  language = 'en',
  t,
}) {
  const normalizedDocument = ensureNormalizedEstimateDocument(documentModel, {
    scope,
    lineItems,
    total,
    materialsIncluded,
  })
  const scopeText = normalizedDocument.scope.text
  const workItems = normalizedDocument.workItems
  const documentTotal = normalizedDocument.totals.total
  const hasScope = normalizedDocument.sections.scope.visible
  const hasLineItems = normalizedDocument.sections.workBreakdown.visible
  const accentColor = resolveCompanyAccentColor(company)
  const jobLocationLines = formatAddressLines(lead?.address || lead?.location || '')
  const projectTitle = lead?.projectTitle || lead?.projectType || t('projectTitle')

  return (
    <article
      className="document-sheet document-estimate"
      style={{
        ...getDocumentDensityVariables(),
        overflow: 'hidden',
        borderRadius: 'var(--document-card-radius)',
        border: `1px solid ${colors.slate200}`,
        backgroundColor: colors.paper,
        padding: 'var(--document-card-padding-y) var(--document-card-padding-x) var(--document-card-padding-y)',
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        color: colors.ink,
      }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
        <div style={{ flex: '1 1 430px', minWidth: 0 }}>
          <CompanyBadge company={company} accentColor={accentColor} t={t} />
        </div>
        <div
          style={{
            flex: '0 0 210px',
            minWidth: '210px',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'flex-end',
            textAlign: 'right',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: '36px',
              lineHeight: 1,
              fontWeight: 700,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              color: accentColor,
            }}
          >
            {t('estimate')}
          </h1>
          <p style={{ margin: '9px 0 0', maxWidth: '210px', fontSize: '12px', lineHeight: 1.35, fontWeight: 400, color: colors.slate500, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {estimateNumber}
          </p>
        </div>
      </header>

      <section
        data-estimate-summary="true"
        style={{
          marginTop: 'var(--document-section-gap)',
          borderRadius: '16px',
          border: `1px solid ${colors.slate200}`,
          backgroundColor: colors.white,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.05fr) minmax(0,1.35fr) minmax(112px,0.8fr) minmax(144px,1fr)', alignItems: 'stretch' }}>
          <div
            style={{
              minWidth: 0,
              padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)',
            }}
          >
            <SummaryBlock label={t('client')} accentColor={accentColor}>
              <div style={{ fontWeight: 700 }}>{lead?.client || ''}</div>
            </SummaryBlock>
          </div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}>
            <SummaryBlock label={t('jobLocation')} accentColor={accentColor}>
              {jobLocationLines.length ? (
                <div style={{ display: 'grid', gap: '1px' }}>
                  {jobLocationLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              ) : null}
            </SummaryBlock>
          </div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}>
            <SummaryBlock label={t('date')} accentColor={accentColor}>
              <div>{formatDisplayDate(estimateDate, language)}</div>
            </SummaryBlock>
          </div>
          <div
            style={{
              borderLeft: `1px solid ${colors.slate300}`,
              padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'right',
            }}
          >
            <SummaryBlock label={t('totalEstimate')} accentColor={accentColor} align="right">
              <div style={{ fontSize: '25px', lineHeight: 1, fontWeight: 700, letterSpacing: '-0.025em', color: colors.ink }}>
                {currency.format(documentTotal)}
              </div>
            </SummaryBlock>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0,1fr)', gap: '18px', borderTop: `1px solid ${colors.slate200}`, padding: '12px var(--document-summary-padding-x)', alignItems: 'start' }}>
          <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.35, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: accentColor }}>
            {t('project')}
          </p>
          <p style={{ margin: 0, minWidth: 0, whiteSpace: 'normal', fontSize: '13px', lineHeight: 1.45, fontWeight: 650, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {projectTitle}
          </p>
        </div>
      </section>

      {hasScope ? (
        <section data-estimate-section="true" style={{ marginTop: 'var(--document-section-gap)' }}>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.3,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: accentColor,
            }}
          >
            {t('scopeOfWork')}
          </p>
          <div
            style={{
              marginTop: 'var(--document-scope-gap)',
              border: `1px solid ${colors.slate200}`,
              borderRadius: '14px',
              backgroundColor: colors.white,
              padding: '13px 15px',
              whiteSpace: 'pre-wrap',
              fontSize: '12px',
              lineHeight: 1.5,
              color: colors.ink,
              overflowWrap: 'anywhere',
              wordBreak: 'break-word',
            }}
          >
            {scopeText}
          </div>
        </section>
      ) : null}

      {hasLineItems ? (
        <section data-estimate-section="true" style={{ marginTop: hasScope ? 'var(--document-card-section-gap)' : 'var(--document-section-gap)' }}>
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.3,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: accentColor,
            }}
          >
            {t('workBreakdown')}
          </p>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: workBreakdownGridColumns,
              gap: '10px',
              marginTop: 'var(--document-work-gap)',
              borderTop: `1px solid ${colors.slate200}`,
              borderBottom: `1px solid ${colors.slate200}`,
              padding: '7px 0',
              color: colors.slate500,
              fontSize: '9px',
              lineHeight: 1.3,
              fontWeight: 700,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
            }}
          >
            <span style={{ gridColumn: '1 / 3' }} aria-hidden="true" />
            <span style={{ textAlign: 'right' }}>{t('qty')}</span>
            <span style={{ textAlign: 'right' }}>{t('rate')}</span>
            <span style={{ textAlign: 'right' }}>{t('total')}</span>
          </div>
          <div>
            {workItems.map((item, index) => (
              <WorkBreakdownItem
                key={item?.id || `${item?.title || 'item'}-${index}`}
                item={item}
                index={index}
                accentColor={accentColor}
                language={language}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      <section
        data-estimate-section="true"
        style={{
          marginTop: 'var(--document-section-gap)',
          borderRadius: '16px',
          border: `1px solid ${colors.slate200}`,
          backgroundColor: colors.white,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 216px', alignItems: 'stretch' }}>
          <div
            style={{
              minWidth: 0,
              padding: 'var(--document-panel-padding-y) var(--document-panel-padding-x)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 'var(--document-panel-gap)',
            }}
          >
            <div
              style={{
                display: 'flex',
                width: '38px',
                height: '38px',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '999px',
                background: 'linear-gradient(135deg, #0891b2 0%, #0f766e 100%)',
                color: colors.white,
                flexShrink: 0,
              }}
            >
              <FileText size={17} strokeWidth={2.1} />
            </div>
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: '11px',
                  lineHeight: 1.3,
                  fontWeight: 700,
                  letterSpacing: '0.18em',
                  textTransform: 'uppercase',
                  color: colors.teal700,
                }}
              >
                {t('paymentTerms')}
              </p>
              <div
                style={{
                  marginTop: 'var(--document-panel-heading-gap)',
                  fontSize: '11px',
                  lineHeight: 1.32,
                  color: colors.slate900,
                  whiteSpace: 'pre-line',
                  overflowWrap: 'anywhere',
                  wordBreak: 'break-word',
                }}
              >
                {getPaymentTermLabel(paymentTerms, t)}
              </div>
            </div>
          </div>
          <div
            style={{
              borderLeft: `1px solid ${colors.slate300}`,
              padding: 'var(--document-panel-padding-y) var(--document-panel-padding-x)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              textAlign: 'center',
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: '18px',
                lineHeight: 1.1,
                color: colors.teal700,
                fontFamily: '"Brush Script MT", "Segoe Script", "Snell Roundhand", cursive',
              }}
            >
              {t('thankYou')}
            </p>
            <p style={{ margin: '4px 0 0', fontSize: '11px', lineHeight: 1.28, color: colors.slate900 }}>
              {t('weAppreciateYourBusiness')}
            </p>
          </div>
        </div>
      </section>
    </article>
  )
}

export default EstimatePdfTemplate
