import type { CSSProperties, ReactNode } from 'react'

export interface ChartTooltipRowData {
  readonly label: ReactNode
  readonly value: ReactNode
  readonly valueColor?: string
  readonly accentColor?: string
}

export function ChartTooltip({
  title,
  rows,
  footer,
  style,
  className,
}: {
  readonly title: ReactNode
  readonly rows: readonly ChartTooltipRowData[]
  readonly footer?: ReactNode
  readonly style?: CSSProperties
  readonly className?: string
}) {
  return (
    <div className={['chart-kit-tooltip', className].filter(Boolean).join(' ')} style={style}>
      <div className="chart-kit-tooltip__title">{title}</div>
      {rows.map((row, index) => (
        <div key={index} className="chart-kit-tooltip__row">
          <span className="chart-kit-tooltip__label">
            {row.accentColor != null ? (
              <span className="chart-kit-tooltip__swatch" style={{ background: row.accentColor }} />
            ) : null}
            {row.label}
          </span>
          <span className="chart-kit-tooltip__value" style={row.valueColor != null ? { color: row.valueColor } : undefined}>
            {row.value}
          </span>
        </div>
      ))}
      {footer != null ? <div className="chart-kit-tooltip__footer">{footer}</div> : null}
    </div>
  )
}
