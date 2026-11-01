export function DocumentItemNumber({ accentTextColor, children }) {
  return (
    <span
      data-document-item-number="true"
      style={{
        display: 'block',
        color: accentTextColor,
        fontSize: '10px',
        lineHeight: 1.3,
        fontWeight: 700,
        whiteSpace: 'nowrap',
      }}
    >
      {children}.
    </span>
  )
}

export function DocumentMaterialLabel({ accentTextColor, children }) {
  return (
    <span
      data-document-material-label="true"
      style={{
        color: accentTextColor,
        fontSize: '10.25pt',
        lineHeight: 1.4,
        fontWeight: 500,
        overflowWrap: 'anywhere',
      }}
    >
      {children}
    </span>
  )
}
