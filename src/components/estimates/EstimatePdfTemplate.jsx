import { Check, FileText } from 'lucide-react'
import { currency } from '../../utils/formatters'
import { getLanguageLocale } from '../../utils/language'
import { getDocumentDensityVariables } from '../../utils/documentDensity'
import { ensureNormalizedEstimateDocument } from '../../utils/estimateDocument'
import { getPaymentTermLabel } from '../../utils/paymentTerms'
import '../documents/documentDensity.css'

const colors = {
  white: '#ffffff',
  paper: '#fefefe',
  slate50: '#f8fafc',
  slate100: '#f1f5f9',
  slate200: '#dbe4ee',
  slate300: '#cbd5e1',
  slate500: '#64748b',
  slate700: '#334155',
  slate900: '#0f172a',
  teal50: '#ecfeff',
  teal100: '#cffafe',
  teal300: '#67e8f9',
  teal600: '#0891b2',
  teal700: '#0e7490',
  emerald600: '#16a34a',
}

const layout = {
  numberColumn: '40px',
  titleColumn: '208px',
  detailColumn: 'minmax(0, 1fr)',
  amountColumn: '88px',
  rowGap: '14px',
  summaryLeadColumn: 'calc(40px + 14px + 208px)',
  summaryTotalColumn: '152px',
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

function HeaderPhoneIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={colors.teal600}
        d="M6.62 10.79a15.54 15.54 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.37 2.33.57 3.57.57a1 1 0 0 1 1 1V20a1 1 0 0 1-1 1C10.07 21 3 13.93 3 5a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.24.2 2.45.57 3.57a1 1 0 0 1-.24 1.02z"
      />
    </svg>
  )
}

function HeaderMailIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" aria-hidden="true" style={{ display: 'block', flexShrink: 0 }}>
      <path
        fill={colors.teal600}
        d="M3 6.75A1.75 1.75 0 0 1 4.75 5h14.5A1.75 1.75 0 0 1 21 6.75v10.5A1.75 1.75 0 0 1 19.25 19H4.75A1.75 1.75 0 0 1 3 17.25zm1.9.1 6.47 4.53a1.1 1.1 0 0 0 1.26 0l6.47-4.53a.25.25 0 0 0-.14-.45H5.04a.25.25 0 0 0-.14.45"
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

function CompanyBadge({ company = {}, t }) {
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
            borderRadius: '20px',
            background: 'linear-gradient(145deg, #22d3ee 0%, #0f766e 100%)',
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
        <p style={{ margin: 0, fontSize: '18px', lineHeight: 1.15, fontWeight: 700, color: colors.slate900 }}>
          {company?.name || t('brandName')}
        </p>
        <div style={{ marginTop: '8px', display: 'grid', gap: '5px' }}>
          {company?.phone ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, color: colors.slate900 }}>
              <HeaderPhoneIcon />
              <span style={{ fontSize: '12px', lineHeight: 1.35 }}>{company.phone}</span>
            </div>
          ) : null}
          {company?.email ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, color: colors.slate900 }}>
              <HeaderMailIcon />
              <span style={{ fontSize: '12px', lineHeight: 1.35, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>{company.email}</span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function SummaryBlock({ label, children }) {
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
          color: colors.teal700,
        }}
      >
        {label}
      </p>
      <div style={{ marginTop: 'var(--document-label-gap)', fontSize: '14px', lineHeight: 1.38, color: colors.slate900, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
        {children}
      </div>
    </div>
  )
}

function MaterialsIndicator({ included, t }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: colors.slate700 }}>
      <Check size={14} color={colors.emerald600} strokeWidth={2.8} />
      <span style={{ fontSize: '10.5px', lineHeight: 1.25 }}>
        {included ? t('includesMaterials') : t('materialsNotIncluded')}
      </span>
    </div>
  )
}

function WorkBreakdownItem({ item, index, t }) {
  const details = Array.isArray(item?.detailLines) ? item.detailLines : []
  const includesMaterials = Boolean(item?.materialsIncluded)

  return (
    <div
      data-line-item-card="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `${layout.numberColumn} minmax(180px, ${layout.titleColumn}) ${layout.detailColumn} ${layout.amountColumn}`,
        gap: 'var(--document-work-row-gap)',
        alignItems: 'start',
        padding: 'var(--document-work-row-padding) 0',
        borderTop: index === 0 ? 'none' : `1px solid ${colors.slate200}`,
      }}
    >
      <div
        style={{
          display: 'flex',
          width: '36px',
          height: '36px',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '999px',
          background: 'linear-gradient(135deg, #0891b2 0%, #0f766e 100%)',
          color: colors.white,
          fontSize: '15px',
          fontWeight: 700,
          lineHeight: 1,
          marginTop: '1px',
        }}
      >
        {index + 1}
      </div>
      <div style={{ minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: '13px',
            lineHeight: 1.2,
            fontWeight: 700,
            color: colors.slate900,
            overflowWrap: 'anywhere',
            wordBreak: 'break-word',
          }}
        >
          {item?.title || t('item')}
        </p>
        <div style={{ marginTop: '5px' }}>
          <MaterialsIndicator included={includesMaterials} t={t} />
        </div>
      </div>
      <div style={{ minWidth: 0 }}>
        {details.length > 0 ? (
          <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'grid', gap: 'var(--document-work-bullet-gap)' }}>
            {details.map((line, lineIndex) => (
              <li key={`${index}-${lineIndex}`} style={{ display: 'grid', gridTemplateColumns: '10px minmax(0,1fr)', gap: '8px', alignItems: 'start' }}>
                <span
                  aria-hidden="true"
                  style={{
                    display: 'block',
                    width: '4px',
                    height: '4px',
                    marginTop: '6px',
                    borderRadius: '999px',
                    backgroundColor: colors.teal600,
                  }}
                />
                <span style={{ fontSize: '12px', lineHeight: 1.3, color: colors.slate900, overflowWrap: 'anywhere', wordBreak: 'break-word' }}>
                  {line}
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div style={{ paddingTop: '2px', textAlign: 'right' }}>
        <p style={{ margin: 0, fontSize: '15px', lineHeight: 1.15, fontWeight: 700, color: colors.teal600 }}>
          {currency.format(Number(item?.total || 0))}
        </p>
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
  const clientAddressLines = formatAddressLines(lead?.address || lead?.location || '')
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
        color: colors.slate900,
      }}
    >
      <header style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 'var(--document-header-gap)' }}>
        <div style={{ flex: '2 2 420px', minWidth: 0 }}>
          <CompanyBadge company={company} t={t} />
        </div>
        <div
          style={{
            flex: '0 0 178px',
            minWidth: '178px',
            alignSelf: 'stretch',
            borderLeft: `1px solid ${colors.slate300}`,
            paddingLeft: '14px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            textAlign: 'right',
          }}
        >
          <p
            style={{
              margin: 0,
              fontSize: '11px',
              lineHeight: 1.3,
              fontWeight: 700,
              letterSpacing: '0.38em',
              textTransform: 'uppercase',
              color: colors.teal700,
            }}
          >
            {t('estimate')}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: '15px', lineHeight: 1.1, fontWeight: 700, color: colors.slate900, whiteSpace: 'nowrap' }}>
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
        <div style={{ display: 'grid', gridTemplateColumns: `${layout.summaryLeadColumn} ${layout.detailColumn} ${layout.summaryTotalColumn}`, alignItems: 'stretch' }}>
          <div
            style={{
              minWidth: 0,
              padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)',
            }}
          >
            <SummaryBlock label={t('client')}>
              <div style={{ fontWeight: 700 }}>{lead?.client || ''}</div>
              {clientAddressLines.length > 0 ? (
                <div style={{ marginTop: '3px', display: 'grid', gap: '1px' }}>
                  {clientAddressLines.map((line) => (
                    <div key={line}>{line}</div>
                  ))}
                </div>
              ) : null}
            </SummaryBlock>
          </div>
          <div style={{ minWidth: 0, padding: 'var(--document-summary-padding-y) var(--document-summary-padding-x)', display: 'grid', gap: 'var(--document-summary-inner-gap)' }}>
            <SummaryBlock label={t('date')}>
              <div>{formatDisplayDate(estimateDate, language)}</div>
            </SummaryBlock>
            <SummaryBlock label={t('project')}>
              <div style={{ maxWidth: '240px', whiteSpace: 'normal', wordBreak: 'normal', overflowWrap: 'break-word' }}>{projectTitle}</div>
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
              {t('totalAmount')}
            </p>
            <p style={{ margin: '6px 0 0', fontSize: '28px', lineHeight: 1, fontWeight: 700, color: colors.slate900 }}>
              {currency.format(documentTotal)}
            </p>
          </div>
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
              color: colors.teal700,
            }}
          >
            {t('scopeOfWork')}
          </p>
          <div
            style={{
              marginTop: 'var(--document-scope-gap)',
              borderTop: `1px solid ${colors.slate200}`,
              paddingTop: 'var(--document-scope-padding-top)',
              whiteSpace: 'pre-line',
              fontSize: '12px',
              lineHeight: 1.38,
              color: colors.slate900,
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
              color: colors.teal700,
            }}
          >
            {t('workBreakdown')}
          </p>
          <div style={{ marginTop: 'var(--document-work-gap)', borderTop: `1px solid ${colors.slate200}` }}>
            {workItems.map((item, index) => (
              <WorkBreakdownItem
                key={item?.id || `${item?.title || 'item'}-${index}`}
                item={item}
                index={index}
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
