import { forwardRef, useImperativeHandle, useRef, useState } from 'react'
import { Bold, List, Underline } from 'lucide-react'

const inlineMarkers = {
  bold: '**',
  underline: '++',
}

function selectionHasMarker(textarea, marker) {
  if (!textarea || textarea.selectionStart === textarea.selectionEnd) return false

  const { selectionStart, selectionEnd, value } = textarea
  return (
    value.slice(selectionStart, selectionStart + marker.length) === marker
    && value.slice(selectionEnd - marker.length, selectionEnd) === marker
  ) || (
    value.slice(selectionStart - marker.length, selectionStart) === marker
    && value.slice(selectionEnd, selectionEnd + marker.length) === marker
  )
}

export const LightweightFormattedTextarea = forwardRef(function LightweightFormattedTextarea({
  value = '',
  onChange,
  onBlur,
  onInput,
  placeholder,
  rows = 4,
  ariaLabel,
  t,
  className = '',
}, forwardedRef) {
  const textareaRef = useRef(null)
  const [activeFormats, setActiveFormats] = useState({ bold: false, underline: false })

  useImperativeHandle(forwardedRef, () => textareaRef.current)

  function restoreSelection(start, end = start) {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.focus()
      textarea.setSelectionRange(start, end)
      onInput?.(textarea)
      updateActiveFormats()
    })
  }

  function updateActiveFormats() {
    const textarea = textareaRef.current
    setActiveFormats({
      bold: selectionHasMarker(textarea, inlineMarkers.bold),
      underline: selectionHasMarker(textarea, inlineMarkers.underline),
    })
  }

  function applyInlineFormat(format) {
    const textarea = textareaRef.current
    const marker = inlineMarkers[format]
    if (!textarea || !marker) return

    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    if (start === end) {
      textarea.focus()
      return
    }

    const currentValue = String(value || '')
    const selectedText = currentValue.slice(start, end)

    if (selectedText.includes('\n')) {
      const formattedLines = selectedText.split('\n').map((line) => {
        if (!line.trim()) return line

        const bulletMatch = line.match(/^(\s*[-*•]\s+)(.*)$/)
        const prefix = bulletMatch?.[1] || ''
        const content = bulletMatch?.[2] ?? line
        const isWrapped = content.startsWith(marker) && content.endsWith(marker)

        return `${prefix}${isWrapped ? content.slice(marker.length, -marker.length) : `${marker}${content}${marker}`}`
      })
      const nextSelection = formattedLines.join('\n')
      const nextValue = `${currentValue.slice(0, start)}${nextSelection}${currentValue.slice(end)}`

      onChange(nextValue, textarea)
      restoreSelection(start, start + nextSelection.length)
      return
    }

    const selectionIncludesMarkers = selectedText.startsWith(marker) && selectedText.endsWith(marker)
    const selectionIsWrapped = currentValue.slice(start - marker.length, start) === marker
      && currentValue.slice(end, end + marker.length) === marker

    if (selectionIncludesMarkers) {
      const unwrappedText = selectedText.slice(marker.length, -marker.length)
      const nextValue = `${currentValue.slice(0, start)}${unwrappedText}${currentValue.slice(end)}`
      onChange(nextValue, textarea)
      restoreSelection(start, start + unwrappedText.length)
      return
    }

    if (selectionIsWrapped) {
      const nextValue = `${currentValue.slice(0, start - marker.length)}${selectedText}${currentValue.slice(end + marker.length)}`
      onChange(nextValue, textarea)
      restoreSelection(start - marker.length, end - marker.length)
      return
    }

    const nextValue = `${currentValue.slice(0, start)}${marker}${selectedText}${marker}${currentValue.slice(end)}`
    onChange(nextValue, textarea)
    restoreSelection(start + marker.length, end + marker.length)
  }

  function addBullet() {
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = String(value || '')
    const start = textarea.selectionStart ?? currentValue.length
    const end = textarea.selectionEnd ?? start

    if (start !== end) {
      const lineStart = currentValue.lastIndexOf('\n', start - 1) + 1
      const nextLineBreak = currentValue.indexOf('\n', end)
      const lineEnd = nextLineBreak === -1 ? currentValue.length : nextLineBreak
      const selectedLines = currentValue.slice(lineStart, lineEnd)
      const bulletedLines = selectedLines
        .split('\n')
        .map((line) => (line.trim() && !/^\s*[-*•]\s/.test(line) ? `- ${line}` : line))
        .join('\n')
      const nextValue = `${currentValue.slice(0, lineStart)}${bulletedLines}${currentValue.slice(lineEnd)}`

      onChange(nextValue, textarea)
      restoreSelection(lineStart, lineStart + bulletedLines.length)
      return
    }

    const prefix = currentValue.slice(0, start)
    const suffix = currentValue.slice(end)
    const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n')
    const bulletText = `${needsLeadingBreak ? '\n' : ''}- `
    const nextValue = `${prefix}${bulletText}${suffix}`

    onChange(nextValue, textarea)
    restoreSelection(prefix.length + bulletText.length)
  }

  function handleKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return

    const key = event.key.toLowerCase()
    if (key === 'b' || key === 'u') {
      event.preventDefault()
      applyInlineFormat(key === 'b' ? 'bold' : 'underline')
    }
  }

  const toolbarButtonClasses = (active) => [
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-slate-600 transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    active
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white hover:text-slate-900',
  ].join(' ')

  return (
    <div className="min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
      <div
        role="toolbar"
        aria-label={t('textFormatting')}
        className="flex min-w-0 flex-wrap items-center gap-1 border-b border-slate-200 bg-white/80 px-2 py-1.5"
      >
        <button
          type="button"
          aria-label={t('bold')}
          title={t('bold')}
          aria-pressed={activeFormats.bold}
          className={toolbarButtonClasses(activeFormats.bold)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyInlineFormat('bold')}
        >
          <Bold aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t('underline')}
          title={t('underline')}
          aria-pressed={activeFormats.underline}
          className={toolbarButtonClasses(activeFormats.underline)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => applyInlineFormat('underline')}
        >
          <Underline aria-hidden="true" className="h-4 w-4" />
        </button>
        <button
          type="button"
          aria-label={t('addBullet')}
          title={t('addBullet')}
          className={toolbarButtonClasses(false)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={addBullet}
        >
          <List aria-hidden="true" className="h-4 w-4" />
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(event) => onChange(event.target.value, event.target)}
        onBlur={onBlur}
        onInput={(event) => onInput?.(event.currentTarget)}
        onKeyDown={handleKeyDown}
        onSelect={updateActiveFormats}
        onKeyUp={updateActiveFormats}
        onClick={updateActiveFormats}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        className={`w-full border-0 bg-transparent outline-none placeholder:text-slate-400 focus:ring-0 ${className}`.trim()}
      />
    </div>
  )
})
