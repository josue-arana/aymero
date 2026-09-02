import {
  forwardRef,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Bold, List, Underline } from 'lucide-react'
import {
  ESTIMATE_TEXT_SIZE_LARGE,
  ESTIMATE_TEXT_SIZE_SMALL,
  ESTIMATE_TEXT_SIZE_STANDARD,
  ESTIMATE_TEXT_SIZE_STEPS,
  hasMeaningfulEstimateFormattedText,
  normalizeEstimateFormattedTextForStorage,
  normalizeEstimateTextSize,
  parseEstimateSizedText,
  sanitizeEstimatePastedContent,
  serializeEstimateSizedText,
} from '../../utils/estimateDocument'

const inlineMarkers = {
  bold: '**',
  underline: '++',
}

// These screen-oriented values share the document's Small / Standard / Large
// semantics without changing the exact point sizes used by PDF output.
const editorTextSizeClasses = {
  [ESTIMATE_TEXT_SIZE_SMALL]: 'text-[0.9em] leading-[1.55]',
  [ESTIMATE_TEXT_SIZE_STANDARD]: 'text-[1em] leading-[1.5]',
  [ESTIMATE_TEXT_SIZE_LARGE]: 'text-[1.15em] leading-[1.45]',
}

const editorLineBaseClasses = 'min-h-[1.5em] min-w-0 whitespace-pre-wrap break-words [overflow-wrap:anywhere]'
const editorBulletClasses = 'pl-[1.1em] indent-[-1.1em]'

function selectionHasMarker(value, selectionStart, selectionEnd, marker) {
  if (selectionStart === selectionEnd) return false

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
  const nextSizes = Array.from({ length: nextLines.length }, () => ESTIMATE_TEXT_SIZE_STANDARD)
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

function getEditorLines(editor) {
  return editor
    ? Array.from(editor.children).filter((child) => child.hasAttribute('data-estimate-editor-line'))
    : []
}

function setEditorLinePresentation(lineElement, size, text) {
  const normalizedSize = normalizeEstimateTextSize(size)
  lineElement.dataset.textSize = normalizedSize
  lineElement.className = [
    editorLineBaseClasses,
    editorTextSizeClasses[normalizedSize],
    /^\s*[-*•]\s+/.test(text) ? editorBulletClasses : '',
  ].filter(Boolean).join(' ')
}

function renderEditorValue(editor, value) {
  if (!editor) return

  const ownerDocument = editor.ownerDocument
  const fragment = ownerDocument.createDocumentFragment()
  const parsedValue = parseEstimateSizedText(value)

  parsedValue.lines.forEach((line) => {
    const lineElement = ownerDocument.createElement('div')
    lineElement.setAttribute('data-estimate-editor-line', 'true')
    setEditorLinePresentation(lineElement, line.size, line.text)

    if (line.text) {
      lineElement.textContent = line.text
    } else {
      lineElement.appendChild(ownerDocument.createElement('br'))
    }
    fragment.appendChild(lineElement)
  })

  if (!parsedValue.lines.length) {
    const emptyLine = ownerDocument.createElement('div')
    emptyLine.setAttribute('data-estimate-editor-line', 'true')
    setEditorLinePresentation(emptyLine, ESTIMATE_TEXT_SIZE_STANDARD, '')
    emptyLine.appendChild(ownerDocument.createElement('br'))
    fragment.appendChild(emptyLine)
  }

  editor.replaceChildren(fragment)
}

function readEditorValue(editor) {
  const lines = getEditorLines(editor)
  if (!lines.length) return ''

  const displayValue = lines.map((line) => line.textContent || '').join('\n')
  const sizes = lines.map((line) => normalizeEstimateTextSize(line.dataset.textSize))
  return serializeEstimateSizedText(displayValue, sizes)
}

function editorDomNeedsNormalization(editor) {
  const lines = getEditorLines(editor)
  if (!editor || lines.length !== editor.children.length || lines.length !== editor.childNodes.length) return true

  return lines.some((line) => Array.from(line.childNodes).some((node) => (
    node.nodeType !== 3
    && !(node.nodeType === 1 && node.tagName === 'BR' && line.childNodes.length === 1)
  )))
}

function getPointOffsetWithinLine(lineElement, container, offset) {
  if (container === lineElement) {
    return Array.from(lineElement.childNodes)
      .slice(0, offset)
      .reduce((length, node) => length + (node.textContent || '').length, 0)
  }

  try {
    const range = lineElement.ownerDocument.createRange()
    range.selectNodeContents(lineElement)
    range.setEnd(container, offset)
    return range.toString().length
  } catch {
    return 0
  }
}

function getEditorPointOffset(editor, container, offset) {
  const lines = getEditorLines(editor)
  if (!lines.length) return 0

  if (container === editor) {
    if (offset >= editor.childNodes.length) {
      return lines.reduce((length, line, index) => (
        length + (line.textContent || '').length + (index < lines.length - 1 ? 1 : 0)
      ), 0)
    }

    const targetChild = editor.childNodes[offset]
    const targetLineIndex = lines.findIndex((line) => line === targetChild || line.contains(targetChild))
    if (targetLineIndex === -1) return 0
    return lines.slice(0, targetLineIndex).reduce((length, line) => length + (line.textContent || '').length + 1, 0)
  }

  const lineIndex = lines.findIndex((line) => line === container || line.contains(container))
  if (lineIndex === -1) return 0

  const precedingLength = lines.slice(0, lineIndex)
    .reduce((length, line) => length + (line.textContent || '').length + 1, 0)
  return precedingLength + getPointOffsetWithinLine(lines[lineIndex], container, offset)
}

function getEditorSelection(editor, fallback = { start: 0, end: 0 }) {
  const selection = editor?.ownerDocument?.getSelection?.()
  if (
    !selection
    || !selection.anchorNode
    || !selection.focusNode
    || !editor.contains(selection.anchorNode)
    || !editor.contains(selection.focusNode)
  ) {
    return fallback
  }

  const anchorOffset = getEditorPointOffset(editor, selection.anchorNode, selection.anchorOffset)
  const focusOffset = getEditorPointOffset(editor, selection.focusNode, selection.focusOffset)

  return {
    start: Math.min(anchorOffset, focusOffset),
    end: Math.max(anchorOffset, focusOffset),
  }
}

function getDomPointForOffset(editor, targetOffset) {
  const lines = getEditorLines(editor)
  let remainingOffset = Math.max(0, targetOffset)

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const lineLength = (line.textContent || '').length
    if (remainingOffset <= lineLength) {
      const walker = line.ownerDocument.createTreeWalker(line, globalThis.NodeFilter?.SHOW_TEXT || 4)
      let textNode = walker.nextNode()
      let textOffset = remainingOffset

      while (textNode) {
        const nodeLength = textNode.nodeValue?.length || 0
        if (textOffset <= nodeLength) return { node: textNode, offset: textOffset }
        textOffset -= nodeLength
        textNode = walker.nextNode()
      }

      return { node: line, offset: 0 }
    }

    remainingOffset -= lineLength
    if (index < lines.length - 1) remainingOffset = Math.max(0, remainingOffset - 1)
  }

  const finalLine = lines[lines.length - 1] || editor
  return { node: finalLine, offset: finalLine.childNodes.length }
}

function setEditorSelection(editor, start, end = start) {
  if (!editor?.ownerDocument) return

  const selection = editor.ownerDocument.getSelection?.()
  if (!selection) return

  const startPoint = getDomPointForOffset(editor, start)
  const endPoint = getDomPointForOffset(editor, end)
  const range = editor.ownerDocument.createRange()

  try {
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    selection.removeAllRanges()
    selection.addRange(range)
  } catch {
    // A browser composition update can briefly invalidate a DOM point.
  }
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
  const editorRef = useRef(null)
  const selectionRef = useRef({ start: 0, end: 0 })
  const editorId = useId()
  const textSizeDescriptionId = useId()
  const parsedValue = parseEstimateSizedText(value)
  const displayValue = parsedValue.text
  const initialSize = parsedValue.lines[0]?.size || ESTIMATE_TEXT_SIZE_STANDARD
  const [activeFormats, setActiveFormats] = useState({ bold: false, underline: false, bullet: false })
  const [activeTextSize, setActiveTextSize] = useState({
    value: initialSize,
    mixed: false,
    canDecrease: initialSize !== ESTIMATE_TEXT_SIZE_SMALL,
    canIncrease: initialSize !== ESTIMATE_TEXT_SIZE_LARGE,
  })

  useImperativeHandle(forwardedRef, () => editorRef.current)

  function resizeEditor(editor = editorRef.current) {
    if (!editor) return

    const resolvedMinHeight = Number(minHeight) || Math.max(104, rows * 24 + 32)
    editor.style.height = 'auto'
    const nextHeight = Math.min(Math.max(editor.scrollHeight, resolvedMinHeight), maxHeight)
    editor.style.height = `${nextHeight}px`
    editor.style.overflowY = editor.scrollHeight > maxHeight ? 'auto' : 'hidden'
  }

  function getCurrentState() {
    const editor = editorRef.current
    const storedValue = editor ? readEditorValue(editor) : value
    const parsed = parseEstimateSizedText(storedValue)
    const selection = getEditorSelection(editor, selectionRef.current)
    selectionRef.current = selection

    return {
      editor,
      storedValue,
      displayValue: parsed.text,
      lineSizes: parsed.lines.map((line) => line.size),
      selection,
    }
  }

  function updateActiveFormats() {
    const { displayValue: currentValue, lineSizes, selection } = getCurrentState()
    const range = getSelectedLineRange(currentValue, selection.start, selection.end)
    const selectedSizes = lineSizes.slice(range.start, range.end + 1)
    const uniqueSizes = [...new Set(selectedSizes)]
    const firstSize = selectedSizes[0] || ESTIMATE_TEXT_SIZE_STANDARD

    setActiveFormats({
      bold: selectionHasMarker(currentValue, selection.start, selection.end, inlineMarkers.bold)
        || markerIsActiveAtPosition(currentValue, selection.start, inlineMarkers.bold),
      underline: selectionHasMarker(currentValue, selection.start, selection.end, inlineMarkers.underline)
        || markerIsActiveAtPosition(currentValue, selection.start, inlineMarkers.underline),
      bullet: selectionUsesBullets(currentValue, selection.start, selection.end),
    })
    setActiveTextSize({
      value: firstSize,
      mixed: uniqueSizes.length > 1,
      canDecrease: selectedSizes.some((size) => size !== ESTIMATE_TEXT_SIZE_SMALL),
      canIncrease: selectedSizes.some((size) => size !== ESTIMATE_TEXT_SIZE_LARGE),
    })
  }

  useLayoutEffect(() => {
    const editor = editorRef.current
    if (!editor) return

    const currentValue = readEditorValue(editor)
    const hasLines = getEditorLines(editor).length > 0
    if (!hasLines || currentValue !== value) {
      const selection = getEditorSelection(editor, selectionRef.current)
      renderEditorValue(editor, value)
      if (editor.ownerDocument.activeElement === editor) {
        setEditorSelection(editor, selection.start, selection.end)
      }
    }
    resizeEditor(editor)
    // The controlled storage value is synchronized without React reconciling
    // editable child nodes, which keeps native selection stable while typing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, maxHeight, minHeight, rows])

  useEffect(() => {
    updateActiveFormats()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function emitDisplayValue(nextDisplayValue, nextLineSizes, editor = editorRef.current) {
    const nextStoredValue = serializeEstimateSizedText(nextDisplayValue, nextLineSizes)
    renderEditorValue(editor, nextStoredValue)
    resizeEditor(editor)
    onChange(nextStoredValue, editor)
  }

  function restoreSelection(start, end = start) {
    selectionRef.current = { start, end }
    requestAnimationFrame(() => {
      const editor = editorRef.current
      if (!editor) return

      editor.focus({ preventScroll: true })
      setEditorSelection(editor, start, end)
      resizeEditor(editor)
      onInput?.(editor)
      updateActiveFormats()
    })
  }

  function applyInlineFormat(format) {
    const { editor, displayValue: currentValue, lineSizes, selection } = getCurrentState()
    const marker = inlineMarkers[format]
    if (!editor || !marker || selection.start === selection.end) {
      editor?.focus({ preventScroll: true })
      return
    }

    const { start, end } = selection
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

      emitDisplayValue(nextValue, lineSizes, editor)
      restoreSelection(start, start + nextSelection.length)
      return
    }

    const selectionIncludesMarkers = selectedText.startsWith(marker) && selectedText.endsWith(marker)
    const selectionIsWrapped = currentValue.slice(start - marker.length, start) === marker
      && currentValue.slice(end, end + marker.length) === marker

    if (selectionIncludesMarkers) {
      const unwrappedText = selectedText.slice(marker.length, -marker.length)
      emitDisplayValue(`${currentValue.slice(0, start)}${unwrappedText}${currentValue.slice(end)}`, lineSizes, editor)
      restoreSelection(start, start + unwrappedText.length)
      return
    }

    if (selectionIsWrapped) {
      emitDisplayValue(`${currentValue.slice(0, start - marker.length)}${selectedText}${currentValue.slice(end + marker.length)}`, lineSizes, editor)
      restoreSelection(start - marker.length, end - marker.length)
      return
    }

    emitDisplayValue(`${currentValue.slice(0, start)}${marker}${selectedText}${marker}${currentValue.slice(end)}`, lineSizes, editor)
    restoreSelection(start + marker.length, end + marker.length)
  }

  function toggleBullet() {
    const { editor, displayValue: currentValue, lineSizes, selection } = getCurrentState()
    if (!editor) return

    const { start, end } = selection
    const range = getSelectedLineRange(currentValue, start, end)
    const lineStart = getLineOffsets(currentValue, range.start).start
    const lineEnd = getLineOffsets(currentValue, range.end).end
    const selectedLines = currentValue.slice(lineStart, lineEnd).split('\n')
    const removeBullets = selectionUsesBullets(currentValue, start, end)
    const nextLines = selectedLines.map((line) => {
      if (!line.trim()) return removeBullets || start !== end ? '' : '- '
      if (removeBullets) return line.replace(/^\s*[-*•]\s+/, '')
      return /^\s*[-*•]\s+/.test(line) ? line.replace(/^\s*[-*•]\s+/, '- ') : `- ${line}`
    })
    const replacement = nextLines.join('\n')
    const nextValue = `${currentValue.slice(0, lineStart)}${replacement}${currentValue.slice(lineEnd)}`
    const nextSizes = reconcileLineSizes(currentValue, nextValue, lineSizes)

    emitDisplayValue(nextValue, nextSizes, editor)
    const currentLineBulletPrefixLength = selectedLines[0]?.match(/^\s*[-*•]\s+/)?.[0]?.length || 0
    const collapsedCursor = start + (removeBullets ? -currentLineBulletPrefixLength : 2)
    restoreSelection(
      start === end ? Math.max(lineStart, collapsedCursor) : lineStart,
      start === end ? Math.max(lineStart, collapsedCursor) : lineStart + replacement.length
    )
  }

  function changeTextSize(direction) {
    const { editor, displayValue: currentValue, lineSizes, selection } = getCurrentState()
    if (!editor) return

    const range = getSelectedLineRange(currentValue, selection.start, selection.end)
    const nextSizes = [...lineSizes]
    for (let index = range.start; index <= range.end; index += 1) {
      nextSizes[index] = stepTextSize(nextSizes[index] || ESTIMATE_TEXT_SIZE_STANDARD, direction)
    }

    emitDisplayValue(currentValue, nextSizes, editor)
    restoreSelection(selection.start, selection.end)
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

    const { editor, displayValue: currentValue, lineSizes, selection } = getCurrentState()
    if (!editor) return

    const { start, end } = selection
    const range = getSelectedLineRange(currentValue, start, end)
    const offsets = getLineOffsets(currentValue, range.start)
    const currentLine = currentValue.slice(offsets.start, offsets.end)
    const bulletMatch = currentLine.match(/^(\s*[-*•]\s+)(.*)$/)

    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()

      if (bulletMatch && !hasMeaningfulEstimateFormattedText(bulletMatch[2])) {
        const nextValue = `${currentValue.slice(0, offsets.start)}${currentValue.slice(offsets.end)}`
        emitDisplayValue(nextValue, reconcileLineSizes(currentValue, nextValue, lineSizes), editor)
        restoreSelection(offsets.start)
        return
      }

      const insertion = bulletMatch ? '\n- ' : '\n\n'
      const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`
      emitDisplayValue(nextValue, reconcileLineSizes(currentValue, nextValue, lineSizes), editor)
      restoreSelection(start + insertion.length)
      return
    }

    if (event.key === 'Enter' && event.shiftKey) {
      event.preventDefault()
      const insertion = '\n'
      const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`
      emitDisplayValue(nextValue, reconcileLineSizes(currentValue, nextValue, lineSizes), editor)
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
      const nextValue = `${currentValue.slice(0, offsets.start)}${currentValue.slice(offsets.end)}`
      emitDisplayValue(nextValue, reconcileLineSizes(currentValue, nextValue, lineSizes), editor)
      restoreSelection(offsets.start)
    }
  }

  function handleInput(event) {
    const editor = event.currentTarget
    const nextStoredValue = readEditorValue(editor)
    selectionRef.current = getEditorSelection(editor, selectionRef.current)
    if (editorDomNeedsNormalization(editor)) {
      renderEditorValue(editor, nextStoredValue)
      setEditorSelection(editor, selectionRef.current.start, selectionRef.current.end)
    }
    resizeEditor(editor)
    onChange(nextStoredValue, editor)
    onInput?.(editor)
    updateActiveFormats()
  }

  function handlePaste(event) {
    const { editor, displayValue: currentValue, lineSizes, selection } = getCurrentState()
    const clipboardData = event.clipboardData
    if (!editor || !clipboardData) return

    const pastedValue = sanitizeEstimatePastedContent({
      html: clipboardData.getData('text/html'),
      text: clipboardData.getData('text/plain'),
    })
    event.preventDefault()
    if (!pastedValue) return

    const parsedPaste = parseEstimateSizedText(pastedValue)
    const nextValue = `${currentValue.slice(0, selection.start)}${parsedPaste.text}${currentValue.slice(selection.end)}`
    const nextSizes = reconcileLineSizes(currentValue, nextValue, lineSizes)
    const pastedLineStart = getSelectedLineRange(currentValue, selection.start, selection.start).start
    const pastedStorageLines = pastedValue.split('\n')

    parsedPaste.lines.forEach((line, index) => {
      const hasExplicitSize = /^\[\[aymero-size:(?:small|large)\]\]/.test(pastedStorageLines[index] || '')
      if (index > 0 || hasExplicitSize) nextSizes[pastedLineStart + index] = line.size
    })

    emitDisplayValue(nextValue, nextSizes, editor)
    restoreSelection(selection.start + parsedPaste.text.length)
  }

  function handleBlur(event) {
    const currentStoredValue = readEditorValue(event.currentTarget)
    const normalizedValue = normalizeEstimateFormattedTextForStorage(currentStoredValue)
    if (normalizedValue !== currentStoredValue) {
      renderEditorValue(event.currentTarget, normalizedValue)
      resizeEditor(event.currentTarget)
      onChange(normalizedValue, event.currentTarget)
    }
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
  const isVisiblyEmpty = displayValue.length === 0

  return (
    <div className="relative min-w-0 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 focus-within:border-blue-500 focus-within:ring-4 focus-within:ring-blue-100">
      <div
        role="toolbar"
        aria-label={t('textFormatting')}
        aria-controls={editorId}
        className="relative z-10 flex min-w-0 flex-wrap items-center gap-0.5 border-b border-slate-200 bg-white/80 px-1 py-1.5 sm:gap-1 sm:px-2"
      >
        <button type="button" aria-label={t('bold')} title={t('bold')} aria-pressed={activeFormats.bold} className={toolbarButtonClasses(activeFormats.bold)} onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormat('bold')}>
          <Bold aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" aria-label={t('underline')} title={t('underline')} aria-pressed={activeFormats.underline} className={toolbarButtonClasses(activeFormats.underline)} onMouseDown={(event) => event.preventDefault()} onClick={() => applyInlineFormat('underline')}>
          <Underline aria-hidden="true" className="h-4 w-4" />
        </button>
        <button type="button" aria-label={t('toggleBulletList')} title={t('toggleBulletList')} aria-pressed={activeFormats.bullet} className={toolbarButtonClasses(activeFormats.bullet)} onMouseDown={(event) => event.preventDefault()} onClick={toggleBullet}>
          <List aria-hidden="true" className="h-4 w-4" />
        </button>
        <span aria-hidden="true" className="mx-1 h-6 w-px bg-slate-200" />
        <button type="button" aria-label={`${t('decreaseTextSize')}. ${t('currentTextSize')}: ${activeSizeLabel}`} title={t('decreaseTextSize')} aria-describedby={textSizeDescriptionId} disabled={!activeTextSize.canDecrease} className={toolbarButtonClasses(false, !activeTextSize.canDecrease)} onMouseDown={(event) => event.preventDefault()} onClick={() => changeTextSize(-1)}>
          <span aria-hidden="true" className="text-sm font-bold tracking-tight">A−</span>
        </button>
        <span id={textSizeDescriptionId} className="inline-flex h-8 w-7 shrink-0 items-center justify-center text-xs font-semibold text-slate-500" title={`${t('currentTextSize')}: ${activeSizeLabel}`} aria-live="polite">
          <span aria-hidden="true" className={activeTextSize.mixed ? 'text-sm' : activeTextSize.value === ESTIMATE_TEXT_SIZE_SMALL ? 'text-xs' : activeTextSize.value === ESTIMATE_TEXT_SIZE_LARGE ? 'text-lg' : 'text-sm'}>A</span>
          <span className="sr-only">{`${t('currentTextSize')}: ${activeSizeLabel}`}</span>
        </span>
        <button type="button" aria-label={`${t('increaseTextSize')}. ${t('currentTextSize')}: ${activeSizeLabel}`} title={t('increaseTextSize')} aria-describedby={textSizeDescriptionId} disabled={!activeTextSize.canIncrease} className={toolbarButtonClasses(false, !activeTextSize.canIncrease)} onMouseDown={(event) => event.preventDefault()} onClick={() => changeTextSize(1)}>
          <span aria-hidden="true" className="text-base font-bold tracking-tight">A+</span>
        </button>
      </div>
      <div className="relative min-w-0">
        {isVisiblyEmpty && placeholder ? (
          <span aria-hidden="true" className={`pointer-events-none absolute inset-0 z-0 text-slate-400 ${className}`.trim()}>
            {placeholder}
          </span>
        ) : null}
        <div
          ref={editorRef}
          id={editorId}
          role="textbox"
          aria-multiline="true"
          aria-label={ariaLabel}
          aria-placeholder={placeholder}
          contentEditable
          suppressContentEditableWarning
          spellCheck
          onInput={handleInput}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          onSelect={updateActiveFormats}
          onKeyUp={updateActiveFormats}
          onClick={updateActiveFormats}
          onFocus={updateActiveFormats}
          className={`relative z-[1] block w-full overflow-x-hidden border-0 bg-transparent outline-none focus:ring-0 ${className}`.trim()}
          style={{
            minHeight: `${Number(minHeight) || Math.max(104, rows * 24 + 32)}px`,
            maxHeight: `${maxHeight}px`,
          }}
        />
      </div>
    </div>
  )
})
