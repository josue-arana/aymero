import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { calculateActionMenuPosition, getActionMenuViewport } from '../../utils/actionMenuPosition'
import './actionMenu.css'

const baseMenuItemClasses = 'flex min-h-11 w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-sm font-semibold text-slate-700 transition-colors duration-150 hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 active:bg-slate-100'
const baseButtonClasses = 'inline-flex min-h-[58px] items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm font-bold text-slate-800 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2'
const initialPosition = { left: 16, top: 16, maxHeight: 0, maxWidth: 0, placement: 'bottom-end', ready: false }

export function ActionMenu({ label, items = [], align = 'right', ariaLabel, buttonClassName = '', containerClassName = '', menuClassName = '', showChevron = true, buttonDisabled = false }) {
  const [isOpen, setIsOpen] = useState(false)
  const [position, setPosition] = useState(initialPosition)
  const triggerRef = useRef(null)
  const menuRef = useRef(null)
  const focusTargetRef = useRef('first')
  const reactId = useId()
  const triggerId = `action-menu-trigger-${reactId.replaceAll(':', '')}`
  const menuId = `action-menu-${reactId.replaceAll(':', '')}`
  const visibleItems = items.filter((item) => item && item.hidden !== true)

  function focusTrigger() {
    window.requestAnimationFrame(() => triggerRef.current?.focus())
  }

  function closeMenu({ restoreFocus = true } = {}) {
    setIsOpen(false)
    setPosition(initialPosition)
    if (restoreFocus) focusTrigger()
  }

  function openMenu(focusTarget = 'first') {
    focusTargetRef.current = focusTarget
    setPosition(initialPosition)
    setIsOpen(true)
  }

  function getEnabledMenuItems() {
    return Array.from(menuRef.current?.querySelectorAll('[role="menuitem"]:not(:disabled)') || [])
  }

  useLayoutEffect(() => {
    if (!isOpen || !triggerRef.current || !menuRef.current) return undefined

    function updatePosition() {
      if (!triggerRef.current || !menuRef.current) return

      const nextPosition = calculateActionMenuPosition({
        triggerRect: triggerRef.current.getBoundingClientRect(),
        menuRect: menuRef.current.getBoundingClientRect(),
        viewport: getActionMenuViewport(),
        align,
      })
      setPosition({ ...nextPosition, ready: true })
    }

    updatePosition()
    const animationFrame = window.requestAnimationFrame(updatePosition)
    const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(updatePosition) : null
    resizeObserver?.observe(triggerRef.current)
    resizeObserver?.observe(menuRef.current)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    window.visualViewport?.addEventListener('resize', updatePosition)
    window.visualViewport?.addEventListener('scroll', updatePosition)

    return () => {
      window.cancelAnimationFrame(animationFrame)
      resizeObserver?.disconnect()
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
      window.visualViewport?.removeEventListener('resize', updatePosition)
      window.visualViewport?.removeEventListener('scroll', updatePosition)
    }
  }, [align, isOpen])

  useEffect(() => {
    if (!isOpen || !position.ready) return
    const enabledItems = getEnabledMenuItems()
    const target = focusTargetRef.current === 'last' ? enabledItems.at(-1) : enabledItems[0]
    target?.focus()
  }, [isOpen, position.ready])

  useEffect(() => {
    if (!isOpen) return undefined

    function handleClickOutside(event) {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        closeMenu({ restoreFocus: false })
      }
    }

    function handleDocumentKeyDown(event) {
      if (event.key !== 'Escape') return
      event.preventDefault()
      closeMenu()
    }

    document.addEventListener('pointerdown', handleClickOutside, true)
    document.addEventListener('keydown', handleDocumentKeyDown)

    return () => {
      document.removeEventListener('pointerdown', handleClickOutside, true)
      document.removeEventListener('keydown', handleDocumentKeyDown)
    }
  }, [isOpen])

  useEffect(() => {
    if (!buttonDisabled || !isOpen) return
    closeMenu({ restoreFocus: false })
  }, [buttonDisabled, isOpen])

  useEffect(() => {
    if (!isOpen || visibleItems.length > 0) return
    closeMenu({ restoreFocus: false })
  }, [isOpen, visibleItems.length])

  if (visibleItems.length === 0) {
    return null
  }

  const menu = isOpen && typeof document !== 'undefined'
    ? createPortal(
      <div
        ref={menuRef}
        id={menuId}
        role="menu"
        aria-labelledby={triggerId}
        aria-orientation="vertical"
        data-action-menu-overlay="true"
        data-placement={position.placement}
        className={`aymero-action-menu fixed z-[100] min-w-56 overflow-x-hidden overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2 shadow-[0_18px_45px_rgba(15,23,42,0.18)] ${menuClassName}`.trim()}
        style={{
          left: `${position.left}px`,
          top: `${position.top}px`,
          maxHeight: position.ready ? `${position.maxHeight}px` : 'calc(100dvh - 32px)',
          maxWidth: position.ready ? `${position.maxWidth}px` : 'calc(100vw - 32px)',
          visibility: position.ready ? 'visible' : 'hidden',
        }}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => {
          const enabledItems = getEnabledMenuItems()
          if (enabledItems.length === 0) return
          const currentIndex = enabledItems.indexOf(document.activeElement)
          let nextIndex = currentIndex

          if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % enabledItems.length
          else if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? enabledItems.length - 1 : (currentIndex - 1 + enabledItems.length) % enabledItems.length
          else if (event.key === 'Home') nextIndex = 0
          else if (event.key === 'End') nextIndex = enabledItems.length - 1
          else if (event.key === 'Tab') {
            closeMenu({ restoreFocus: false })
            return
          } else return

          event.preventDefault()
          enabledItems[nextIndex]?.focus()
        }}
      >
        {visibleItems.map((item, index) => {
          const itemClassName = String(item.className || '')
          const itemTone = item.tone
            || (itemClassName.includes('text-red') ? 'destructive' : '')
            || (itemClassName.includes('text-emerald') ? 'positive' : '')
            || (itemClassName.includes('text-amber') ? 'warning' : '')
          const separatesAction = index > 0 && (
            item.separatorBefore
            || itemTone === 'destructive'
          )

          return (
            <div key={item.id} role="none" className={separatesAction ? 'mt-1 border-t border-slate-100 pt-1' : ''}>
              <button
                type="button"
                role="menuitem"
                data-tone={itemTone || undefined}
                tabIndex={-1}
                disabled={item.disabled}
                aria-disabled={item.disabled || undefined}
                onClick={(event) => {
                  event.stopPropagation()
                  if (item.disabled) return
                  item.onClick?.(event)
                  closeMenu()
                }}
                className={`${baseMenuItemClasses} ${itemClassName} ${item.disabled ? 'cursor-not-allowed opacity-60' : ''}`.trim()}
              >
                {item.icon}
                <span className="min-w-0 break-words">{item.label}</span>
              </button>
            </div>
          )
        })}
      </div>,
      document.body,
    )
    : null

  return (
    <div className={`relative ${containerClassName}`.trim()}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        disabled={buttonDisabled}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        style={{ minHeight: '44px', minWidth: '44px' }}
        onClick={(event) => {
          event.stopPropagation()
          if (isOpen) closeMenu()
          else openMenu()
        }}
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          event.preventDefault()
          openMenu(event.key === 'ArrowUp' ? 'last' : 'first')
        }}
        aria-label={ariaLabel}
        className={`${buttonClassName || baseButtonClasses} ${buttonDisabled ? 'cursor-not-allowed opacity-60' : ''}`.trim()}
      >
        {label}
        {showChevron ? <ChevronDown className={`h-4 w-4 transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" /> : null}
      </button>
      {menu}
    </div>
  )
}

export default ActionMenu
