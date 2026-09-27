import type { ReactNode, RefObject } from 'react'
import { ResponsiveChartContainer } from '@/components/ui'
import { downloadChartPng, downloadChartSvg } from '@/components/charts/exportChart'

export interface ChartLegendItem {
  readonly label: ReactNode
  readonly swatch?: ReactNode
}

export function ChartCard({
  title,
  subtitle,
  legend = [],
  footnote,
  svgRef,
  svgFilename,
  pngFilename,
  minWidth = 1150,
  exportable = true,
  headerAside,
  children,
}: {
  readonly title: ReactNode
  readonly subtitle?: ReactNode
  readonly legend?: readonly ChartLegendItem[]
  readonly footnote?: ReactNode
  readonly svgRef?: RefObject<SVGSVGElement | null>
  readonly svgFilename?: string
  readonly pngFilename?: string
  readonly minWidth?: number
  readonly exportable?: boolean
  readonly headerAside?: ReactNode
  readonly children: ReactNode
}) {
  return (
    <section className="card chart-kit-card">
      <div className="chart-kit-card__header">
        <div>
          <h2 className="chart-kit-card__title">{title}</h2>
          {subtitle != null ? <p className="chart-kit-card__subtitle">{subtitle}</p> : null}
        </div>
        {headerAside != null ? <div className="chart-kit-card__aside">{headerAside}</div> : null}
      </div>

      {legend.length > 0 || exportable ? (
        <div className="chart-kit-card__toolbar">
          {legend.length > 0 ? (
            <div className="chart-kit-legend" aria-label="Chart legend">
              {legend.map((item, index) => (
                <span key={index} className="chart-kit-legend__item">
                  {item.swatch}
                  <span>{item.label}</span>
                </span>
              ))}
            </div>
          ) : <span />}
          {exportable && svgRef != null && svgFilename != null && pngFilename != null ? (
            <div className="chart-kit-card__actions">
              <button
                type="button"
                className="button"
                onClick={() => {
                  if (svgRef.current != null) {
                    downloadChartSvg(svgRef.current, svgFilename)
                  }
                }}
              >
                Download SVG
              </button>
              <button
                type="button"
                className="button button-outline"
                onClick={() => {
                  if (svgRef.current != null) {
                    void downloadChartPng(svgRef.current, pngFilename)
                  }
                }}
              >
                Download PNG
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <ResponsiveChartContainer size="detail" minWidth={minWidth} className="chart-kit-card__container">
        {children}
      </ResponsiveChartContainer>
      {footnote != null ? <p className="chart-kit-card__footnote">{footnote}</p> : null}
    </section>
  )
}
