import { useId, type PropsWithChildren } from 'react'

type TooltipProps = PropsWithChildren<{
  readonly content: string
}>

export function Tooltip({ children, content }: TooltipProps) {
  const id = useId()

  return (
    <span className="tooltip-root">
      <span tabIndex={0} className="tooltip-trigger" aria-describedby={id}>
        {children}
      </span>
      <span id={id} role="tooltip" className="tooltip-content">
        {content}
      </span>
    </span>
  )
}
