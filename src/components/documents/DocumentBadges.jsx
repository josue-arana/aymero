export function DocumentItemMarker({ accentColor, accentTextColor, children }) {
  return (
    <div
      data-document-item-marker="true"
      style={{
        display: 'flex',
        width: '24px',
        height: '24px',
        flexShrink: 0,
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        borderRadius: '999px',
        border: `1px solid ${accentColor}`,
        backgroundColor: '#ffffff',
        color: accentTextColor,
        fontSize: '10px',
        fontWeight: 700,
        lineHeight: 1,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

export function DocumentMaterialBadge({ accentColor, accentTextColor, children }) {
  return (
    <span
      data-document-material-badge="true"
      style={{
        display: 'inline-flex',
        maxWidth: '100%',
        minHeight: '18px',
        alignItems: 'center',
        justifyContent: 'center',
        boxSizing: 'border-box',
        border: `1px solid ${accentColor}`,
        borderRadius: '999px',
        padding: '2px 7px',
        color: accentTextColor,
        fontSize: '9px',
        lineHeight: '12px',
        fontWeight: 650,
        textAlign: 'center',
        overflowWrap: 'anywhere',
        verticalAlign: 'top',
      }}
    >
      {children}
    </span>
  )
}
