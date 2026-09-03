import { currency } from '../../utils/formatters'
import { getLanguageLocale } from '../../utils/language'
import { getDocumentDensityVariables } from '../../utils/documentDensity'
import {
  ensureNormalizedEstimateDocument,
  ESTIMATE_LABOR_ONLY,
  ESTIMATE_OWNER_SUPPLIED_MATERIALS,
  getEstimateTextSizeCss,
} from '../../utils/estimateDocument'
import { getAcceptedPaymentMethodLabels } from '../../utils/acceptedPaymentMethods'
import { getPaymentTermLabel } from '../../utils/paymentTerms'
import { resolveDocumentBrandTokens } from '../../data/brandColors'
import {
  ESTIMATE_DOCUMENT_BORDER_WIDTH,
  ESTIMATE_DOCUMENT_HORIZONTAL_PADDING,
  ESTIMATE_RICH_CONTENT_BORDER_WIDTH,
  ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING,
} from '../../utils/estimatePagination'
import '../documents/documentDensity.css'
import './estimateDocument.css'

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

function resolveValidUntil(value, estimateDate) {
  if (value) return value

  const parsedDate = new Date(estimateDate)
  if (Number.isNaN(parsedDate.getTime())) return ''

  parsedDate.setDate(parsedDate.getDate() + 30)
  return parsedDate.toISOString()
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

function CalendarIcon({ color }) {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path fill={color} d="M7 2a1 1 0 0 1 1 1v1h8V3a1 1 0 1 1 2 0v1h1a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H5a3 3 0 0 1-3-3V7a3 3 0 0 1 3-3h1V3a1 1 0 0 1 1-1m12 8H5v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1z" />
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
            backgroundColor: colors.slate900,
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

function SummaryBlock({ label, children, align = 'left' }) {
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
          color: colors.ink,
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

function MaterialTag({ materialsStatus, accentColor, accentTextColor, t }) {
  return (
    <span
      data-estimate-material-tag="true"
      style={{
        display: 'inline-block',
        maxWidth: '100%',
        boxSizing: 'border-box',
        border: `1px solid ${accentColor}`,
        borderRadius: '999px',
        padding: '0 7px',
        color: accentTextColor,
        fontSize: '9px',
        lineHeight: '16px',
        fontWeight: 650,
        overflowWrap: 'anywhere',
        verticalAlign: 'top',
      }}
    >
      {getMaterialsTagLabel(materialsStatus, t)}
    </span>
  )
}

export function EstimateInlineText({ segments = [] }) {
  return segments.map((segment, index) => (
    <span
      key={index}
      style={{
        fontWeight: segment.bold ? 700 : 'inherit',
        textDecoration: segment.underline ? 'underline' : 'none',
        textDecorationThickness: segment.underline ? '1px' : undefined,
        textUnderlineOffset: segment.underline ? '2px' : undefined,
      }}
    >
      {segment.text}
    </span>
  ))
}

export function EstimateRichTextBlocks({ blocks = [], flowTextAttribute = 'data-estimate-flow-text' }) {
  return blocks.map((block, blockIndex) => {
    if (block?.type === 'lineBreak') {
      return <div key={`break-${blockIndex}`} style={{ height: '7px' }} aria-hidden="true" />
    }

    if (block?.type === 'bulletList') {
      return (
        <ul
          key={`bullets-${blockIndex}`}
          data-estimate-rich-list="true"
          style={{ width: '100%', maxWidth: 'none', minWidth: 0, margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: '4px' }}
        >
          {(block.items || []).map((bullet, bulletIndex) => (
            <li key={`${blockIndex}-${bulletIndex}`} style={{ display: 'grid', width: '100%', minWidth: 0, gridTemplateColumns: '5px minmax(0,1fr)', gap: '6px', alignItems: 'start' }}>
              <span aria-hidden="true" style={{ width: '3px', height: '3px', marginTop: '6px', borderRadius: '999px', backgroundColor: colors.ink }} />
              <span {...{ [flowTextAttribute]: 'true' }} style={{ minWidth: 0, whiteSpace: 'pre-wrap', fontSize: getEstimateTextSizeCss(bullet?.size), lineHeight: 1.48, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                <EstimateInlineText segments={bullet.segments} />
              </span>
            </li>
          ))}
        </ul>
      )
    }

    if (block?.type === 'paragraph') {
      return (
        <p {...{ [flowTextAttribute]: 'true' }} key={`paragraph-${blockIndex}`} style={{ width: '100%', maxWidth: 'none', minWidth: 0, margin: 0, whiteSpace: 'pre-wrap', fontSize: getEstimateTextSizeCss(block?.size), lineHeight: 1.5, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
          <EstimateInlineText segments={block.segments} />
        </p>
      )
    }

    return null
  })
}

const workBreakdownColumnGap = '8px'

function getWorkBreakdownGridColumns(showQuantity) {
  return showQuantity
    ? '24px minmax(0,1fr) 48px 88px'
    : '24px minmax(0,1fr) 88px'
}

function WorkBreakdownItem({ item, index, accentColor, accentTextColor, showQuantity, t }) {
  const descriptionBlocks = Array.isArray(item?.descriptionBlocks) ? item.descriptionBlocks : []
  const workBreakdownGridColumns = getWorkBreakdownGridColumns(showQuantity)

  return (
    <div
      data-line-item-card="true"
      data-estimate-keep-together="true"
      style={{
        display: 'grid',
        gridTemplateColumns: workBreakdownGridColumns,
        gap: workBreakdownColumnGap,
        alignItems: 'stretch',
        padding: '13px 0',
        borderTop: index === 0 ? 'none' : `1px solid ${colors.slate200}`,
        breakInside: 'avoid',
        pageBreakInside: 'avoid',
      }}
    >
      <div data-estimate-item-marker-cell="true" style={{ display: 'flex', minHeight: 0, alignItems: 'center', justifyContent: 'center' }}>
        <div
          data-estimate-item-marker="true"
          style={{
            display: 'block',
            width: '24px',
            height: '24px',
            flexShrink: 0,
            boxSizing: 'border-box',
            borderRadius: '999px',
            border: `1px solid ${accentColor}`,
            backgroundColor: colors.white,
            color: accentTextColor,
            fontSize: '10px',
            fontWeight: 700,
            lineHeight: '22px',
            textAlign: 'center',
          }}
        >
          {index + 1}
        </div>
      </div>
      <div data-estimate-item-content="true" style={{ width: '100%', maxWidth: 'none', minWidth: 0 }}>
        <p
          data-estimate-flow-text="true"
          style={{
            margin: 0,
            fontSize: getEstimateTextSizeCss(item?.titleSize),
            lineHeight: 1.4,
            fontWeight: 700,
            color: colors.ink,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {item?.title
            ? <EstimateInlineText segments={item?.titleSegments} />
            : t('item')}
        </p>
        {descriptionBlocks.length ? (
          <div style={{ width: '100%', maxWidth: 'none', minWidth: 0, marginTop: '5px', display: 'grid', gap: '3px' }}>
            <EstimateRichTextBlocks blocks={descriptionBlocks} />
          </div>
        ) : null}
        <div style={{ marginTop: descriptionBlocks.length ? '8px' : '5px' }}>
          <MaterialTag materialsStatus={item?.materialsStatus} accentColor={accentColor} accentTextColor={accentTextColor} t={t} />
        </div>
      </div>
      {showQuantity ? (
        <div data-estimate-item-quantity="true" style={{ display: 'flex', minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '11.5px', lineHeight: 1.4, fontWeight: 650, color: colors.ink }}>
          {Number(item?.quantity) > 0 ? item.quantity : ''}
        </div>
      ) : null}
      <div data-estimate-item-amount="true" style={{ display: 'flex', minHeight: 0, alignItems: 'center', justifyContent: 'flex-end', textAlign: 'right', whiteSpace: 'nowrap', fontSize: '11.5px', lineHeight: 1.4, fontWeight: 700, color: colors.ink }}>
        {currency.format(Number(item?.amount || 0))}
      </div>
    </div>
  )
}

function LowerSectionHeading({ children }) {
  return (
    <p
      style={{
        margin: 0,
        fontSize: '10px',
        lineHeight: 1.3,
        fontWeight: 700,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: colors.ink,
      }}
    >
      {children}
    </p>
  )
}

function ValidUntilHeading({ children, accentColor, accentTextColor }) {
  return (
    <p style={{ margin: 0, color: accentTextColor, fontSize: '10px', lineHeight: 1.3, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
      <span data-estimate-validity-icon="true" aria-hidden="true" style={{ display: 'inline-block', width: '11px', height: '11px', marginRight: '5px', verticalAlign: '-1px' }}>
        <CalendarIcon color={accentColor} />
      </span>
      {children}
    </p>
  )
}

function EstimateTotalRow({ label, value, emphasized = false, accentTextColor }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '18px' }}>
      <span
        style={{
          fontSize: emphasized ? '11px' : '10.5px',
          lineHeight: 1.4,
          fontWeight: emphasized ? 700 : 500,
          color: emphasized ? accentTextColor : colors.slate500,
        }}
      >
        {label}
      </span>
      <span
        style={{
          textAlign: 'right',
          fontSize: emphasized ? '18px' : '11px',
          lineHeight: 1.3,
          fontWeight: emphasized ? 750 : 650,
          color: colors.ink,
          whiteSpace: 'nowrap',
        }}
      >
        {currency.format(Number(value || 0))}
      </span>
    </div>
  )
}

export function EstimatePdfTemplate({
  company,
  lead,
  estimateNumber,
  estimateDate,
  pricingMode,
  scope,
  materialsIncluded,
  paymentTerms,
  total,
  subtotal,
  discountAmount,
  taxAmount,
  messageFromContractor,
  validUntil,
  lineItems = [],
  documentModel,
  language = 'en',
  t,
}) {
  const normalizedDocument = ensureNormalizedEstimateDocument(documentModel, {
    pricingMode,
    scope,
    lineItems,
    total,
    subtotal,
    discountAmount,
    taxAmount,
    materialsIncluded,
    messageFromContractor,
    validUntil,
  })
  const scopeContentBlocks = normalizedDocument.scope.contentBlocks
  const workItems = normalizedDocument.workItems
  const contractorMessage = normalizedDocument.messageFromContractor
  const documentTotal = normalizedDocument.totals.total
  const documentSubtotal = normalizedDocument.totals.subtotal
  const documentDiscount = normalizedDocument.totals.discountAmount
  const documentTax = normalizedDocument.totals.taxAmount
  const hasScope = normalizedDocument.sections.scope.visible
  const hasLineItems = normalizedDocument.sections.workBreakdown.visible
  const hasQuantity = workItems.some((item) => Number(item?.quantity) > 0)
  const workBreakdownGridColumns = getWorkBreakdownGridColumns(hasQuantity)
  const hasContractorMessage = normalizedDocument.sections.messageFromContractor.visible
  const { accentColor, accentTextColor } = resolveDocumentBrandTokens(company)
  const acceptedPaymentMethods = getAcceptedPaymentMethodLabels(company?.acceptedPaymentMethods, t)
  const displayValidUntil = resolveValidUntil(normalizedDocument.validUntil, estimateDate)
  const jobLocationLines = formatAddressLines(lead?.address || lead?.location || '')
  const projectTitle = lead?.projectTitle || lead?.projectType || t('projectTitle')

  return (
    <article
      className="document-sheet document-estimate"
      data-estimate-document="true"
      style={{
        ...getDocumentDensityVariables(),
        '--document-card-padding-x': `${ESTIMATE_DOCUMENT_HORIZONTAL_PADDING}px`,
        overflow: 'hidden',
        borderRadius: 'var(--document-card-radius)',
        border: `${ESTIMATE_DOCUMENT_BORDER_WIDTH}px solid ${colors.slate200}`,
        backgroundColor: colors.paper,
        padding: 'var(--document-card-padding-y) var(--document-card-padding-x) var(--document-card-padding-y)',
        boxShadow: '0 18px 48px rgba(15, 23, 42, 0.08)',
        fontFamily: 'ui-sans-serif, system-ui, sans-serif',
        color: colors.ink,
      }}
    >
      <header data-estimate-keep-together="true" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '24px' }}>
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
              color: colors.ink,
            }}
          >
            {t('estimate')}
          </h1>
          <p style={{ margin: '9px 0 0', maxWidth: '210px', fontSize: '12px', lineHeight: 1.35, fontWeight: 400, color: accentTextColor, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
            {estimateNumber}
          </p>
        </div>
      </header>

      <section
        data-estimate-summary="true"
        data-estimate-keep-together="true"
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
            <SummaryBlock label={t('client')}>
              <div style={{ fontWeight: 700 }}>{lead?.client || ''}</div>
            </SummaryBlock>
          </div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}>
            <SummaryBlock label={t('jobLocation')}>
              {jobLocationLines.length ? (
                <div style={{ display: 'grid', gap: '1px' }}>
                  {jobLocationLines.map((line, index) => <div key={`${line}-${index}`}>{line}</div>)}
                </div>
              ) : null}
            </SummaryBlock>
          </div>
          <div style={{ minWidth: 0, borderLeft: `1px solid ${colors.slate200}`, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)' }}>
            <SummaryBlock label={t('date')}>
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
            <SummaryBlock label={t('totalEstimate')} align="right">
              <div style={{ fontSize: '25px', lineHeight: 1, fontWeight: 700, letterSpacing: '-0.025em', color: colors.ink }}>
                {currency.format(documentTotal)}
              </div>
            </SummaryBlock>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '118px minmax(0,1fr)', gap: '18px', borderTop: `1px solid ${colors.slate200}`, padding: '12px var(--document-summary-padding-x)', alignItems: 'center' }}>
          <p style={{ margin: 0, fontSize: '11px', lineHeight: 1.35, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: colors.ink }}>
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
            data-estimate-section-heading="true"
            style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.3,
              fontWeight: 700,
              letterSpacing: '0.22em',
              textTransform: 'uppercase',
              color: colors.ink,
            }}
          >
            {t('scopeOfWork')}
          </p>
          <div
            data-estimate-scope-box="true"
            style={{
              marginTop: 'var(--document-scope-gap)',
              borderRadius: '14px',
              backgroundColor: colors.white,
              width: '100%',
              maxWidth: 'none',
              minWidth: 0,
              boxSizing: 'border-box',
              border: `${ESTIMATE_RICH_CONTENT_BORDER_WIDTH}px solid ${colors.slate200}`,
              padding: `13px ${ESTIMATE_RICH_CONTENT_HORIZONTAL_PADDING}px`,
              display: 'block',
            }}
          >
            <div
              data-estimate-scope-rich-content="true"
              style={{
                width: '100%',
                maxWidth: 'none',
                minWidth: 0,
                margin: 0,
                padding: 0,
                paddingInline: 0,
                boxSizing: 'border-box',
                display: 'grid',
                gridTemplateColumns: 'minmax(0, 1fr)',
                gap: '5px',
                overflow: 'visible',
              }}
            >
              <EstimateRichTextBlocks blocks={scopeContentBlocks} />
            </div>
          </div>
        </section>
      ) : null}

      {hasLineItems ? (
        <section data-estimate-section="true" style={{ marginTop: hasScope ? 'var(--document-card-section-gap)' : 'var(--document-section-gap)' }}>
          <div data-estimate-work-heading="true">
            <p
              data-estimate-section-heading="true"
              style={{
                margin: 0,
                fontSize: '11px',
                lineHeight: 1.3,
                fontWeight: 700,
                letterSpacing: '0.22em',
                textTransform: 'uppercase',
                color: colors.ink,
              }}
            >
              {t('workBreakdown')}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: workBreakdownGridColumns,
                gap: workBreakdownColumnGap,
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
              {hasQuantity ? <span data-estimate-quantity-column="true" style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{t('quantity')}</span> : null}
              <span style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{t('amount')}</span>
            </div>
          </div>
          <div>
            {workItems.map((item, index) => (
              <WorkBreakdownItem
                key={item?.id || `${item?.title || 'item'}-${index}`}
                item={item}
                index={index}
                accentColor={accentColor}
                accentTextColor={accentTextColor}
                showQuantity={hasQuantity}
                t={t}
              />
            ))}
          </div>
        </section>
      ) : null}

      <div data-estimate-closing-group="true">
        <section
          data-estimate-section="true"
          data-estimate-footer-section="true"
          style={{
            marginTop: 'var(--document-section-gap)',
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1.35fr) minmax(210px, 0.65fr)',
            gap: '20px',
            alignItems: 'start',
            breakInside: 'auto',
            pageBreakInside: 'auto',
          }}
        >
        <div style={{ minWidth: 0, borderTop: `1px solid ${colors.slate300}` }}>
          <div style={{ padding: '14px 0' }}>
            <LowerSectionHeading>{t('paymentTerms')}</LowerSectionHeading>
            <div data-estimate-flow-text="true" style={{ width: '100%', maxWidth: 'none', minWidth: 0, marginTop: '6px', whiteSpace: 'pre-line', fontSize: '11px', lineHeight: 1.48, color: colors.ink, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
              {getPaymentTermLabel(paymentTerms, t)}
            </div>
          </div>

          {hasContractorMessage ? (
            <div style={{ borderTop: `1px solid ${colors.slate200}`, padding: '14px 0' }}>
              <LowerSectionHeading>{t('messageFromContractor')}</LowerSectionHeading>
              <div style={{ width: '100%', maxWidth: 'none', minWidth: 0, marginTop: '7px', display: 'grid', gap: '3px' }}>
                <EstimateRichTextBlocks blocks={contractorMessage.contentBlocks} />
              </div>
            </div>
          ) : null}

          {acceptedPaymentMethods.length ? (
            <div style={{ borderTop: `1px solid ${colors.slate200}`, padding: '14px 0 0' }}>
              <LowerSectionHeading>{t('acceptedPaymentMethods')}</LowerSectionHeading>
              <ul
                style={{
                  margin: '8px 0 0',
                  padding: 0,
                  display: 'grid',
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                  columnGap: '18px',
                  rowGap: '5px',
                  listStyle: 'none',
                }}
              >
                {acceptedPaymentMethods.map((method) => (
                  <li key={method} style={{ display: 'grid', gridTemplateColumns: '6px minmax(0,1fr)', gap: '7px', alignItems: 'start', fontSize: '10.5px', lineHeight: 1.4, color: colors.ink }}>
                    <span data-estimate-payment-bullet="true" aria-hidden="true" style={{ color: accentColor, fontSize: '10.5px', lineHeight: 1.4, textAlign: 'center' }}>•</span>
                    <span data-estimate-flow-text="true" style={{ overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{method}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        <div style={{ display: 'grid', minWidth: 0, gap: '10px' }}>
          <div
            data-estimate-totals="true"
            data-estimate-keep-together="true"
            style={{
              border: `1px solid ${colors.slate200}`,
              borderRadius: '14px',
              backgroundColor: colors.white,
              padding: '14px',
            }}
          >
            <div style={{ display: 'grid', gap: '8px' }}>
              <EstimateTotalRow label={t('subtotal')} value={documentSubtotal} accentTextColor={accentTextColor} />
              {documentDiscount > 0 ? <EstimateTotalRow label={t('discount')} value={-documentDiscount} accentTextColor={accentTextColor} /> : null}
              {documentTax > 0 ? <EstimateTotalRow label={t('salesTax')} value={documentTax} accentTextColor={accentTextColor} /> : null}
            </div>
            <div style={{ marginTop: '10px', borderTop: `1px solid ${colors.slate300}`, paddingTop: '10px' }}>
              <EstimateTotalRow label={t('totalEstimate')} value={documentTotal} emphasized accentTextColor={accentTextColor} />
            </div>
          </div>

          <div
            data-estimate-validity="true"
            data-estimate-keep-together="true"
            style={{
              border: `1px solid ${colors.slate200}`,
              borderRadius: '14px',
              backgroundColor: colors.white,
              padding: '12px 14px',
              textAlign: 'center',
            }}
          >
            <ValidUntilHeading accentColor={accentColor} accentTextColor={accentTextColor}>{t('validUntil')}</ValidUntilHeading>
            <p style={{ margin: '6px 0 0', fontSize: '11.5px', lineHeight: 1.4, fontWeight: 700, color: colors.ink }}>
              {formatDisplayDate(displayValidUntil, language)}
            </p>
          </div>
        </div>
        </section>

        <footer
          data-estimate-footer="true"
          style={{
            marginTop: '18px',
            borderTop: `1px solid ${colors.slate300}`,
            paddingTop: '14px',
            textAlign: 'center',
            breakInside: 'avoid',
            pageBreakInside: 'avoid',
          }}
        >
          <p style={{ margin: 0, fontSize: '12px', lineHeight: 1.4, fontWeight: 700, color: accentTextColor }}>
            {t('thankYouForEstimateOpportunity')}
          </p>
          <p style={{ margin: '4px 0 0', fontSize: '10.5px', lineHeight: 1.35, fontWeight: 650, color: colors.ink }}>
            {company?.name || t('brandName')}
          </p>
        </footer>
      </div>
    </article>
  )
}

export default EstimatePdfTemplate
