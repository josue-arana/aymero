import { normalizeEstimateRichText } from '../../utils/estimateDocument'

function InlineFormattedText({ segments = [] }) {
  return segments.map((segment, index) => {
    const content = segment.bold ? <strong>{segment.text}</strong> : segment.text

    return segment.underline
      ? <span key={index} className="underline decoration-1 underline-offset-2">{content}</span>
      : <span key={index}>{content}</span>
  })
}

export function EstimateFormattedText({ value, className = '' }) {
  const { blocks } = normalizeEstimateRichText(value)

  return (
    <div className={`space-y-2 break-words ${className}`.trim()}>
      {blocks.map((block, blockIndex) => {
        if (block.type === 'lineBreak') {
          return <div key={`break-${blockIndex}`} className="h-1" aria-hidden="true" />
        }

        if (block.type === 'bulletList') {
          return (
            <ul key={`bullets-${blockIndex}`} className="list-disc space-y-1 pl-5">
              {block.items.map((item, itemIndex) => (
                <li key={`${blockIndex}-${itemIndex}`}>
                  <InlineFormattedText segments={item.segments} />
                </li>
              ))}
            </ul>
          )
        }

        if (block.type === 'paragraph') {
          return (
            <p key={`paragraph-${blockIndex}`} className="whitespace-pre-wrap">
              <InlineFormattedText segments={block.segments} />
            </p>
          )
        }

        return null
      })}
    </div>
  )
}
