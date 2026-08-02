import {
  useEffect,
  useId,
  useRef,
  type KeyboardEvent,
  type PropsWithChildren,
} from 'react'

type FullscreenChartModalProps = PropsWithChildren<{
  readonly title: string
  readonly isOpen: boolean
  readonly onClose: () => void
}>

export function FullscreenChartModal({
  title,
  isOpen,
  onClose,
  children,
}: FullscreenChartModalProps) {
  const titleId = useId()
  const contentRef = useRef<HTMLDivElement | null>(null)
  const previousFocusRef = useRef<Element | null>(null)

  useEffect(() => {
    if (!isOpen) {
      return
    }

    previousFocusRef.current = document.activeElement
    const firstFocusable = contentRef.current?.querySelector<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    firstFocusable?.focus()

    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'

    return () => {
      document.body.style.overflow = overflow
      if (previousFocusRef.current instanceof HTMLElement) {
        previousFocusRef.current.focus()
      }
    }
  }, [isOpen])

  if (!isOpen) {
    return null
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      onClose()
    }
  }

  return (
    <div className="modal-overlay fullscreen-modal-overlay" onClick={onClose}>
      <div
        className="modal-panel fullscreen-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={onKeyDown}
        ref={contentRef}
      >
        <div className="modal-header">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="button button-ghost fullscreen-modal__close"
            onClick={onClose}
            aria-label="Close fullscreen chart"
          >
            ×
          </button>
        </div>
        <div className="modal-body fullscreen-modal__body">{children}</div>
      </div>
    </div>
  )
}
