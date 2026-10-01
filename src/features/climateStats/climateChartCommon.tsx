import { useLayoutEffect, useRef, useState, type CSSProperties, type FocusEvent, type PointerEvent } from 'react'
import { createPortal } from 'react-dom'
import { ChartTooltip, type ChartTooltipRowData } from '@/components/charts/ChartTooltip'
import { positionTooltip } from '@/components/charts/positionTooltip'

export function temperatureLabel(value: number | null): string {
  return value == null || !Number.isFinite(value) ? 'No data' : `${value.toFixed(1)} °C`
}

export function legendSwatch(color: string) {
  return <span className="chart-kit-swatch" style={{ background: color, borderColor: color }} aria-hidden="true" />
}

export function useClimateChartHover() {
  const containerRef = useRef<HTMLDivElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const [hover, setHover] = useState<{ index: number; x: number; y: number } | null>(null)
  const [style, setStyle] = useState<CSSProperties>({ opacity: 0 })

  useLayoutEffect(() => {
    if (hover == null || containerRef.current == null || tooltipRef.current == null) {
      setStyle({ opacity: 0 })
      return
    }
    const point = positionTooltip(
      hover.x, hover.y,
      tooltipRef.current.offsetWidth, tooltipRef.current.offsetHeight,
      new DOMRect(0, 0, window.innerWidth, window.innerHeight),
    )
    setStyle({ left: point.left, top: point.top, opacity: 1 })
  }, [hover])

  function handlers(index: number) {
    return {
      onPointerMove: (event: PointerEvent<SVGElement>) =>
        setHover({ index, x: event.clientX, y: event.clientY }),
      onPointerLeave: () => setHover(null),
      onFocus: (event: FocusEvent<SVGElement>) => {
        const rect = event.currentTarget.getBoundingClientRect()
        setHover({ index, x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
      },
      onBlur: () => setHover(null),
      tabIndex: 0,
    }
  }

  function Tooltip({ title, rows, footer }: {
    readonly title: string
    readonly rows: readonly ChartTooltipRowData[]
    readonly footer?: string
  }) {
    return createPortal(
      <div ref={tooltipRef} style={{ position: 'fixed', pointerEvents: 'none', zIndex: 100, ...style }} data-export-ignore="true">
        <ChartTooltip title={title} rows={rows} footer={footer} style={{ position: 'static' }} />
      </div>,
      document.body,
    )
  }

  return { containerRef, hover, handlers, Tooltip }
}
