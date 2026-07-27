import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { Bold, List, Underline } from 'lucide-react'
import {
  ESTIMATE_TEXT_SIZE_LARGE,
  ESTIMATE_TEXT_SIZE_SMALL,
  ESTIMATE_TEXT_SIZE_STANDARD,
  ESTIMATE_TEXT_SIZE_STEPS,
  parseEstimateSizedText,
  serializeEstimateSizedText,
} from '../../utils/estimateDocument'

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

function getSelectedLineRange(value, selectionStart = 0, selectionEnd = selectionStart) {
  const safeStart = Math.max(0, Math.min(selectionStart, value.length))
  const safeEnd = Math.max(safeStart, Math.min(selectionEnd, value.length))
  const endOffset = safeEnd > safeStart && value[safeEnd - 1] === '\n' ? safeEnd - 1 : safeEnd

  return {
    start: value.slice(0, safeStart).split('\n').length - 1,
    end: value.slice(0, endOffset).split('\n').length - 1,
  }
}

function reconcileLineSizes(previousValue, nextValue, previousSizes) {
  const previousLines = previousValue.split('\n')
  const nextLines = nextValue.split('\n')
  const nextSizes = Array.from(
    { length: nextLines.length },
    () => ESTIMATE_TEXT_SIZE_STANDARD
  )
  let prefixLength = 0

  while (
    prefixLength < previousLines.length
    && prefixLength < nextLines.length
    && previousLines[prefixLength] === nextLines[prefixLength]
  ) {
    nextSizes[prefixLength] = previousSizes[prefixLength] || ESTIMATE_TEXT_SIZE_STANDARD
    prefixLength += 1
  }

  let suffixLength = 0
  while (
    suffixLength < previousLines.length - prefixLength
    && suffixLength < nextLines.length - prefixLength
    && previousLines[previousLines.length - 1 - suffixLength] === nextLines[nextLines.length - 1 - suffixLength]
  ) {
    nextSizes[nextLines.length - 1 - suffixLength] = previousSizes[previousLines.length - 1 - suffixLength]
      || ESTIMATE_TEXT_SIZE_STANDARD
    suffixLength += 1
  }

  const previousMiddleLength = previousLines.length - prefixLength - suffixLength
  const inheritedIndex = previousMiddleLength === 0
    ? Math.max(0, prefixLength - 1)
    : Math.min(prefixLength, previousLines.length - 1)
  const inheritedSize = previousSizes[inheritedIndex]
    || previousSizes[Math.max(0, prefixLength - 1)]
    || ESTIMATE_TEXT_SIZE_STANDARD

  for (let index = prefixLength; index < nextLines.length - suffixLength; index += 1) {
    nextSizes[index] = inheritedSize
  }

  return nextSizes
}

function stepTextSize(size, direction) {
  const currentIndex = ESTIMATE_TEXT_SIZE_STEPS.indexOf(size)
  const nextIndex = Math.max(0, Math.min(
    ESTIMATE_TEXT_SIZE_STEPS.length - 1,
    (currentIndex === -1 ? 1 : currentIndex) + direction
  ))

  return ESTIMATE_TEXT_SIZE_STEPS[nextIndex]
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
  const textSizeDescriptionId = useId()
  const parsedValue = parseEstimateSizedText(value)
  const displayValue = parsedValue.text
  const lineSizes = parsedValue.lines.map((line) => line.size)
  const [activeFormats, setActiveFormats] = useState({ bold: false, underline: false })
  const [activeTextSize, setActiveTextSize] = useState({
    value: lineSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD,
    mixed: false,
    canDecrease: (lineSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD) !== ESTIMATE_TEXT_SIZE_SMALL,
    canIncrease: (lineSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD) !== ESTIMATE_TEXT_SIZE_LARGE,
  })

  useImperativeHandle(forwardedRef, () => textareaRef.current)

  function getSelectedSizes() {
    const textarea = textareaRef.current
    if (!textarea) return [lineSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD]

    const range = getSelectedLineRange(
      displayValue,
      textarea.selectionStart,
      textarea.selectionEnd
    )

    return lineSizes.slice(range.start, range.end + 1)
  }

  function updateActiveFormats() {
    const textarea = textareaRef.current
    const selectedSizes = getSelectedSizes()
    const uniqueSizes = [...new Set(selectedSizes)]
    const firstSize = selectedSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD

    setActiveFormats({
      bold: selectionHasMarker(textarea, inlineMarkers.bold),
      underline: selectionHasMarker(textarea, inlineMarkers.underline),
    })
    setActiveTextSize({
      value: firstSize,
      mixed: uniqueSizes.length > 1,
      canDecrease: selectedSizes.some((size) => size !== ESTIMATE_TEXT_SIZE_SMALL),
      canIncrease: selectedSizes.some((size) => size !== ESTIMATE_TEXT_SIZE_LARGE),
    })
  }

  useEffect(() => {
    updateActiveFormats()
    // The controlled value is the authoritative source for persisted sizes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emitDisplayValue(nextDisplayValue, nextLineSizes, textarea = textareaRef.current) {
    onChange(serializeEstimateSizedText(nextDisplayValue, nextLineSizes), textarea)
  }

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

    const currentValue = displayValue
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

      emitDisplayValue(nextValue, lineSizes, textarea)
      restoreSelection(start, start + nextSelection.length)
      return
    }

    const selectionIncludesMarkers = selectedText.startsWith(marker) && selectedText.endsWith(marker)
    const selectionIsWrapped = currentValue.slice(start - marker.length, start) === marker
      && currentValue.slice(end, end + marker.length) === marker

    if (selectionIncludesMarkers) {
      const unwrappedText = selectedText.slice(marker.length, -marker.length)
      const nextValue = `${currentValue.slice(0, start)}${unwrappedText}${currentValue.slice(end)}`
      emitDisplayValue(nextValue, lineSizes, textarea)
      restoreSelection(start, start + unwrappedText.length)
      return
    }

    if (selectionIsWrapped) {
      const nextValue = `${currentValue.slice(0, start - marker.length)}${selectedText}${currentValue.slice(end + marker.length)}`
      emitDisplayValue(nextValue, lineSizes, textarea)
      restoreSelection(start - marker.length, end - marker.length)
      return
    }

    const nextValue = `${currentValue.slice(0, start)}${marker}${selectedText}${marker}${currentValue.slice(end)}`
    emitDisplayValue(nextValue, lineSizes, textarea)
    restoreSelection(start + marker.length, end + marker.length)
  }

  function addBullet() {
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = displayValue
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

      emitDisplayValue(nextValue, lineSizes, textarea)
      restoreSelection(lineStart, lineStart + bulletedLines.length)
      return
    }

    const prefix = currentValue.slice(0, start)
    const suffix = currentValue.slice(end)
    const needsLeadingBreak = prefix.length > 0 && !prefix.endsWith('\n')
    const bulletText = `${needsLeadingBreak ? '\n' : ''}- `
    const nextValue = `${prefix}${bulletText}${suffix}`
    const nextSizes = reconcileLineSizes(currentValue, nextValue, lineSizes)

    emitDisplayValue(nextValue, nextSizes, textarea)
    restoreSelection(prefix.length + bulletText.length)
  }

  function changeTextSize(direction) {
    const textarea = textareaRef.current
    if (!textarea) return

    const range = getSelectedLineRange(
      displayValue,
      textarea.selectionStart,
      textarea.selectionEnd
    )
    const nextSizes = [...lineSizes]

    for (let index = range.start; index <= range.end; index += 1) {
      nextSizes[index] = stepTextSize(
        nextSizes[index] || ESTIMATE_TEXT_SIZE_STANDARD,
        direction
      )
    }

    emitDisplayValue(displayValue, nextSizes, textarea)
    restoreSelection(textarea.selectionStart, textarea.selectionEnd)
  }

  function handleKeyDown(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return

    const key = event.key.toLowerCase()
    if (key === 'b' || key === 'u') {
      event.preventDefault()
      applyInlineFormat(key === 'b' ? 'bold' : 'underline')
    }
  }

  function handleChange(event) {
    const nextDisplayValue = event.target.value
    const nextSizes = reconcileLineSizes(displayValue, nextDisplayValue, lineSizes)

    emitDisplayValue(nextDisplayValue, nextSizes, event.target)
  }

  const toolbarButtonClasses = (active, disabled = false) => [
    'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border text-slate-600 transition',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
    disabled
      ? 'cursor-not-allowed border-transparent bg-transparent text-slate-300'
      : active
        ? 'border-blue-200 bg-blue-50 text-blue-700'
        : 'border-transparent bg-transparent hover:border-slate-200 hover:bg-white hover:text-slate-900',
  ].join(' ')

  const activeSizeLabel = activeTextSize.mixed
    ? t('mixedTextSize')
    : t(`${activeTextSize.value}TextSize`)

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
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
        <button
          type="button"
          aria-label={`${t('decreaseTextSize')}. ${t('currentTextSize')}: ${activeSizeLabel}`}
          title={t('decreaseTextSize')}
          aria-describedby={textSizeDescriptionId}
          disabled={!activeTextSize.canDecrease}
          className={toolbarButtonClasses(false, !activeTextSize.canDecrease)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => changeTextSize(-1)}
        >
          <span aria-hidden="true" className="text-sm font-bold tracking-tight">A−</span>
        </button>
        <span
          id={textSizeDescriptionId}
          className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-xs font-semibold text-slate-500"
          title={`${t('currentTextSize')}: ${activeSizeLabel}`}
          aria-live="polite"
        >
          <span
            aria-hidden="true"
            className={activeTextSize.mixed
              ? 'text-sm'
              : activeTextSize.value === ESTIMATE_TEXT_SIZE_SMALL
                ? 'text-xs'
                : activeTextSize.value === ESTIMATE_TEXT_SIZE_LARGE
                  ? 'text-lg'
                  : 'text-sm'}
          >
            A
          </span>
          <span className="sr-only">{`${t('currentTextSize')}: ${activeSizeLabel}`}</span>
        </span>
        <button
          type="button"
          aria-label={`${t('increaseTextSize')}. ${t('currentTextSize')}: ${activeSizeLabel}`}
          title={t('increaseTextSize')}
          aria-describedby={textSizeDescriptionId}
          disabled={!activeTextSize.canIncrease}
          className={toolbarButtonClasses(false, !activeTextSize.canIncrease)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => changeTextSize(1)}
        >
          <span aria-hidden="true" className="text-base font-bold tracking-tight">A+</span>
        </button>
      </div>
      <textarea
        ref={textareaRef}
        value={displayValue}
        onChange={handleChange}
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
