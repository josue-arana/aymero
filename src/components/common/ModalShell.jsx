import { useEffect, useRef } from 'react'

const focusableSelector = [
  'a[href]',
  'button:not(:disabled)',
  'input:not(:disabled)',
  'select:not(:disabled)',
  'textarea:not(:disabled)',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

export function ModalShell({ isOpen, children, className = '', panelClassName = '', onBackdropClick, ariaLabelledBy, ariaDescribedBy }) {
  const panelRef = useRef(null)
  const onBackdropClickRef = useRef(onBackdropClick)
  onBackdropClickRef.current = onBackdropClick

  useEffect(() => {
    if (!isOpen) return undefined

    const previouslyFocused = document.activeElement
    const focusFrame = window.requestAnimationFrame(() => {
      const firstFocusable = panelRef.current?.querySelector(focusableSelector)
      ;(firstFocusable || panelRef.current)?.focus()
    })

    function handleKeyDown(event) {
      if (event.key === 'Escape' && onBackdropClickRef.current) {
        event.preventDefault()
        onBackdropClickRef.current()
        return
      }

      if (event.key !== 'Tab' || !panelRef.current) return
      const focusableElements = Array.from(panelRef.current.querySelectorAll(focusableSelector))
      if (!focusableElements.length) {
        event.preventDefault()
        panelRef.current.focus()
        return
      }

      const firstFocusable = focusableElements[0]
      const lastFocusable = focusableElements.at(-1)
      if (event.shiftKey && document.activeElement === firstFocusable) {
        event.preventDefault()
        lastFocusable.focus()
      } else if (!event.shiftKey && document.activeElement === lastFocusable) {
        event.preventDefault()
        firstFocusable.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus()
      }
    }
  }, [isOpen])

  if (!isOpen) return null

  return (
    <div
      className={`fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/50 pb-[max(1.5rem,env(safe-area-inset-bottom))] pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] pt-[max(6rem,env(safe-area-inset-top))] backdrop-blur-sm sm:pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:pl-[max(1.5rem,env(safe-area-inset-left))] sm:pr-[max(1.5rem,env(safe-area-inset-right))] sm:pt-[max(1.5rem,env(safe-area-inset-top))] ${className}`}
      onClick={onBackdropClick}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        tabIndex={-1}
        className={`min-w-0 max-h-[calc(100dvh-7.5rem)] w-full max-w-full overflow-x-hidden overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl outline-none sm:max-h-[85vh] sm:p-6 ${panelClassName}`}
        onClick={(event) => event.stopPropagation()}
      >
        {children}
      </div>
    </div>
  )
}
