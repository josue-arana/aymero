import { forwardRef, useEffect, useId, useImperativeHandle, useRef, useState } from 'react'
import { Bold, List, Underline } from 'lucide-react'
import {
  ESTIMATE_TEXT_SIZE_LARGE,
  ESTIMATE_TEXT_SIZE_SMALL,
  ESTIMATE_TEXT_SIZE_STANDARD,
  ESTIMATE_TEXT_SIZE_STEPS,
  hasMeaningfulEstimateFormattedText,
  normalizeEstimateFormattedTextForStorage,
  parseEstimateSizedText,
  sanitizeEstimatePastedContent,
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

function markerIsActiveAtPosition(value, position, marker) {
  const lineStart = value.lastIndexOf('\n', Math.max(0, position - 1)) + 1
  const textBeforeCaret = value.slice(lineStart, position)
  let markerCount = 0
  let searchIndex = 0

  while ((searchIndex = textBeforeCaret.indexOf(marker, searchIndex)) !== -1) {
    markerCount += 1
    searchIndex += marker.length
  }

  return markerCount % 2 === 1
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

function getLineOffsets(value, lineIndex) {
  const lines = value.split('\n')
  const start = lines.slice(0, lineIndex).reduce((offset, line) => offset + line.length + 1, 0)

  return {
    start,
    end: start + (lines[lineIndex]?.length || 0),
  }
}

function getSelectedLines(value, selectionStart, selectionEnd) {
  const range = getSelectedLineRange(value, selectionStart, selectionEnd)
  return value.split('\n').slice(range.start, range.end + 1)
}

function selectionUsesBullets(value, selectionStart, selectionEnd) {
  const candidateLines = getSelectedLines(value, selectionStart, selectionEnd)
    .filter((line) => line.trim())

  return candidateLines.length > 0
    && candidateLines.every((line) => /^\s*[-*•]\s+/.test(line))
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
  minHeight,
  maxHeight = 480,
}, forwardedRef) {
  const textareaRef = useRef(null)
  const editorId = useId()
  const textSizeDescriptionId = useId()
  const parsedValue = parseEstimateSizedText(value)
  const displayValue = parsedValue.text
  const lineSizes = parsedValue.lines.map((line) => line.size)
  const [activeFormats, setActiveFormats] = useState({ bold: false, underline: false, bullet: false })
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
    const selectionStart = textarea?.selectionStart ?? 0
    const selectionEnd = textarea?.selectionEnd ?? selectionStart

    setActiveFormats({
      bold: selectionHasMarker(textarea, inlineMarkers.bold)
        || markerIsActiveAtPosition(displayValue, selectionStart, inlineMarkers.bold),
      underline: selectionHasMarker(textarea, inlineMarkers.underline)
        || markerIsActiveAtPosition(displayValue, selectionStart, inlineMarkers.underline),
      bullet: selectionUsesBullets(displayValue, selectionStart, selectionEnd),
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

  function resizeEditor(textarea = textareaRef.current) {
    if (!textarea) return

    const resolvedMinHeight = Number(minHeight) || Math.max(104, rows * 24 + 32)
    textarea.style.height = 'auto'
    const nextHeight = Math.min(Math.max(textarea.scrollHeight, resolvedMinHeight), maxHeight)
    textarea.style.height = `${nextHeight}px`
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  useEffect(() => {
    resizeEditor()
    // Height follows the controlled content and shared sizing constraints.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [displayValue, maxHeight, minHeight, rows])

  function emitDisplayValue(nextDisplayValue, nextLineSizes, textarea = textareaRef.current) {
    onChange(serializeEstimateSizedText(nextDisplayValue, nextLineSizes), textarea)
  }

  function restoreSelection(start, end = start) {
    requestAnimationFrame(() => {
      const textarea = textareaRef.current
      if (!textarea) return

      textarea.focus()
      textarea.setSelectionRange(start, end)
      resizeEditor(textarea)
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

  function toggleBullet() {
    const textarea = textareaRef.current
    if (!textarea) return

    const currentValue = displayValue
    const start = textarea.selectionStart ?? currentValue.length
    const end = textarea.selectionEnd ?? start
    const range = getSelectedLineRange(currentValue, start, end)
    const lineStart = getLineOffsets(currentValue, range.start).start
    const lineEnd = getLineOffsets(currentValue, range.end).end
    const selectedLines = currentValue.slice(lineStart, lineEnd).split('\n')
    const removeBullets = selectionUsesBullets(currentValue, start, end)
    const nextLines = selectedLines.map((line) => {
      if (!line.trim()) return removeBullets || start !== end ? '' : '- '
      if (removeBullets) return line.replace(/^\s*[-*•]\s+/, '')
      return /^\s*[-*•]\s+/.test(line)
        ? line.replace(/^\s*[-*•]\s+/, '- ')
        : `- ${line}`
    })
    const replacement = nextLines.join('\n')
    const nextValue = `${currentValue.slice(0, lineStart)}${replacement}${currentValue.slice(lineEnd)}`
    const nextSizes = reconcileLineSizes(currentValue, nextValue, lineSizes)

    emitDisplayValue(nextValue, nextSizes, textarea)
    const currentLineBulletPrefixLength = selectedLines[0]?.match(/^\s*[-*•]\s+/)?.[0]?.length || 0
    const collapsedCursor = start + (removeBullets ? -currentLineBulletPrefixLength : 2)
    restoreSelection(
      start === end ? Math.max(lineStart, collapsedCursor) : lineStart,
      start === end ? Math.max(lineStart, collapsedCursor) : lineStart + replacement.length
    )
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
    if (event.isComposing || event.nativeEvent?.isComposing) return

    if ((event.ctrlKey || event.metaKey) && !event.altKey) {
      const key = event.key.toLowerCase()
      if (key === 'b' || key === 'u') {
        event.preventDefault()
        applyInlineFormat(key === 'b' ? 'bold' : 'underline')
      }
      return
    }

    const textarea = textareaRef.current
    if (!textarea) return
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    const range = getSelectedLineRange(displayValue, start, end)
    const offsets = getLineOffsets(displayValue, range.start)
    const currentLine = displayValue.slice(offsets.start, offsets.end)
    const bulletMatch = currentLine.match(/^(\s*[-*•]\s+)(.*)$/)

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (bulletMatch && !hasMeaningfulEstimateFormattedText(bulletMatch[2])) {
        const nextValue = `${displayValue.slice(0, offsets.start)}${displayValue.slice(offsets.end)}`
        emitDisplayValue(nextValue, reconcileLineSizes(displayValue, nextValue, lineSizes), textarea)
        restoreSelection(offsets.start)
        return
      }

      const insertion = bulletMatch ? '\n- ' : '\n\n'
      const nextValue = `${displayValue.slice(0, start)}${insertion}${displayValue.slice(end)}`
      emitDisplayValue(nextValue, reconcileLineSizes(displayValue, nextValue, lineSizes), textarea)
      restoreSelection(start + insertion.length)
      return
    }

    if (
      event.key === 'Backspace'
      && start === end
      && bulletMatch
      && !hasMeaningfulEstimateFormattedText(bulletMatch[2])
      && start >= offsets.start + bulletMatch[1].length
    ) {
      event.preventDefault()
      const nextValue = `${displayValue.slice(0, offsets.start)}${displayValue.slice(offsets.end)}`
      emitDisplayValue(nextValue, reconcileLineSizes(displayValue, nextValue, lineSizes), textarea)
      restoreSelection(offsets.start)
    }
  }

  function handleChange(event) {
    const nextDisplayValue = event.target.value
    const nextSizes = reconcileLineSizes(displayValue, nextDisplayValue, lineSizes)

    emitDisplayValue(nextDisplayValue, nextSizes, event.target)
  }

  function handlePaste(event) {
    const textarea = textareaRef.current
    const clipboardData = event.clipboardData
    if (!textarea || !clipboardData) return

    const pastedValue = sanitizeEstimatePastedContent({
      html: clipboardData.getData('text/html'),
      text: clipboardData.getData('text/plain'),
    })
    if (!pastedValue) {
      event.preventDefault()
      return
    }

    event.preventDefault()
    const start = textarea.selectionStart ?? 0
    const end = textarea.selectionEnd ?? start
    const parsedPaste = parseEstimateSizedText(pastedValue)
    const nextValue = `${displayValue.slice(0, start)}${parsedPaste.text}${displayValue.slice(end)}`
    const nextSizes = reconcileLineSizes(displayValue, nextValue, lineSizes)
    const pastedLineStart = getSelectedLineRange(displayValue, start, start).start

    const pastedStorageLines = pastedValue.split('\n')
    parsedPaste.lines.forEach((line, index) => {
      const hasExplicitSize = /^\[\[aymero-size:(?:small|large)\]\]/.test(pastedStorageLines[index] || '')
      if (index > 0 || hasExplicitSize) {
        nextSizes[pastedLineStart + index] = line.size
      }
    })

    emitDisplayValue(nextValue, nextSizes, textarea)
    restoreSelection(start + parsedPaste.text.length)
  }

  function handleBlur(event) {
    const normalizedValue = normalizeEstimateFormattedTextForStorage(value)
    if (normalizedValue !== value) onChange(normalizedValue, event.currentTarget)
    onBlur?.(event)
  }

  const toolbarButtonClasses = (active, disabled = false) => [
    'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border text-slate-600 transition sm:h-10 sm:w-10',
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
        aria-controls={editorId}
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
          aria-label={t('toggleBulletList')}
          title={t('toggleBulletList')}
          aria-pressed={activeFormats.bullet}
          className={toolbarButtonClasses(activeFormats.bullet)}
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleBullet}
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
        id={editorId}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        onInput={(event) => {
          resizeEditor(event.currentTarget)
          onInput?.(event.currentTarget)
        }}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onSelect={updateActiveFormats}
        onKeyUp={updateActiveFormats}
        onClick={updateActiveFormats}
        placeholder={placeholder}
        rows={rows}
        aria-label={ariaLabel}
        spellCheck="true"
        className={`block w-full resize-none overflow-x-hidden border-0 bg-transparent outline-none placeholder:text-slate-400 focus:ring-0 ${className}`.trim()}
        style={{
          minHeight: `${Number(minHeight) || Math.max(104, rows * 24 + 32)}px`,
          maxHeight: `${maxHeight}px`,
        }}
      />
    </div>
  )
})
