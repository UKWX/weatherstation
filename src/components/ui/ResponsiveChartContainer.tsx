import type { CSSProperties, PropsWithChildren } from 'react'

export type ResponsiveChartSize = 'compact' | 'page' | 'detail'

interface ResponsiveChartContainerProps extends PropsWithChildren {
  readonly size?: ResponsiveChartSize
  readonly minWidth?: number
  readonly className?: string
}

export function ResponsiveChartContainer({
  children,
  size = 'page',
  minWidth = 320,
  className,
}: ResponsiveChartContainerProps) {
  const classes = [
    'responsive-chart-container',
    `responsive-chart-container--${size}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      style={{ '--chart-min-width': `${minWidth}px` } as CSSProperties}
    >
      <div className="responsive-chart-container__inner">{children}</div>
    </div>
  )
}
