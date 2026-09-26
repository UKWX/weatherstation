import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import {
  getAnnualOverviewMonthlyRecordCellFill,
  type AnnualOverviewMonthlyRecordCell,
  type AnnualOverviewMonthlyRecordsCardModel,
} from '@/features/annualOverview/monthlyRecords'

const TOOLTIP_GAP = 8
const TOOLTIP_EDGE_PADDING = 16

export function AnnualOverviewMonthlyRecordsCard({
  model,
}: {
  readonly model: AnnualOverviewMonthlyRecordsCardModel
}) {
  const [activeCellKey, setActiveCellKey] = useState<string | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })
  const activeInteractionModeRef = useRef<'hover' | 'focus' | 'touch' | null>(null)
  const lastPointerTypeRef = useRef<string | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())

  const activeCell = useMemo(
    () =>
      activeCellKey == null
        ? null
        : model.rows.flatMap((row) => row.cells).find((cell) => cell.key === activeCellKey) ?? null,
    [activeCellKey, model.rows],
  )
  const tooltipId =
    activeCell == null
      ? undefined
      : `annual-overview-monthly-records-tooltip-${model.year}-${activeCell.key}`

  useEffect(() => {
    if (activeCellKey == null) {
      return
    }
    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('[data-annual-overview-monthly-record-cell="true"]') == null) {
        setActiveCellKey(null)
        activeInteractionModeRef.current = null
      }
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveCellKey(null)
        activeInteractionModeRef.current = null
      }
    }
    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeCellKey])

  useLayoutEffect(() => {
    if (activeCell == null) {
      setTooltipStyle({ opacity: 0 })
      return
    }

    const updatePosition = () => {
      const card = cardRef.current
      const tooltip = tooltipRef.current
      const cell = cellRefs.current.get(activeCell.key)
      if (card == null || tooltip == null || cell == null) {
        return
      }

      const cardRect = card.getBoundingClientRect()
      const cellRect = cell.getBoundingClientRect()
      const tooltipRect = tooltip.getBoundingClientRect()

      let left = cellRect.left - cardRect.left + cellRect.width / 2 - tooltipRect.width / 2
      const minLeft = TOOLTIP_EDGE_PADDING
      const maxLeft = Math.max(
        TOOLTIP_EDGE_PADDING,
        cardRect.width - tooltipRect.width - TOOLTIP_EDGE_PADDING,
      )
      left = Math.max(minLeft, Math.min(left, maxLeft))

      let top = cellRect.bottom - cardRect.top + TOOLTIP_GAP
      const maxBottom = cardRect.height - TOOLTIP_EDGE_PADDING
      if (top + tooltipRect.height > maxBottom) {
        top = cellRect.top - cardRect.top - tooltipRect.height - TOOLTIP_GAP
      }

      setTooltipStyle({ left, top, opacity: 1 })
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
    }
  }, [activeCell])

  const setCellRef =
    (key: string) =>
    (node: HTMLButtonElement | null): void => {
      if (node == null) {
        cellRefs.current.delete(key)
        return
      }
      cellRefs.current.set(key, node)
    }

  return (
    <section ref={cardRef} className="card annual-overview-monthly-records-card">
      <h2>Monthly records</h2>
      <p>{model.subtitle}</p>

      {model.highlights.length === 0 ? (
        <p className="annual-overview-monthly-records__empty">
          No monthly records broken yet in {model.year}
        </p>
      ) : (
        <div className="annual-overview-monthly-records-highlights" role="list">
          {model.highlights.map((highlight) => (
            <article
              key={highlight.key}
              className={`annual-overview-monthly-records-highlight${
                highlight.status === 'equalled'
                  ? ' annual-overview-monthly-records-highlight--equalled'
                  : ''
              }`}
              role="listitem"
              style={{
                borderColor: highlight.color,
                backgroundColor: getAnnualOverviewMonthlyRecordCellFill(highlight.type, 0.08),
              }}
            >
              <div className="annual-overview-monthly-records-highlight__label">
                <span
                  className="annual-overview-monthly-records-highlight__swatch"
                  style={{ backgroundColor: highlight.color }}
                  aria-hidden="true"
                />
                <span>{highlight.lineLabel}</span>
              </div>
              <div className="annual-overview-monthly-records-highlight__value">
                {highlight.valueLabel}
              </div>
              <div className="annual-overview-monthly-records-highlight__detail">
                {highlight.description}
              </div>
            </article>
          ))}
        </div>
      )}

      <div className="annual-overview-monthly-records-matrix-scroll">
        <div className="annual-overview-monthly-records-matrix-card">
          <div className="annual-overview-monthly-records-matrix">
            <div className="annual-overview-monthly-records-matrix__corner" />
            {model.rows[0]?.cells.map((cell) => (
              <div key={`header-${cell.month}`} className="annual-overview-monthly-records-matrix__month">
                {cell.monthShortLabel}
              </div>
            ))}

            {model.rows.map((row) => (
              <div key={row.type} className="annual-overview-monthly-records-matrix__row">
                <div className="annual-overview-monthly-records-matrix__label">
                  <span
                    className="annual-overview-monthly-records-matrix__label-swatch"
                    style={{ backgroundColor: row.color }}
                    aria-hidden="true"
                  />
                  <span>{row.label}</span>
                </div>
                {row.cells.map((cell) => {
                  const isActive = activeCell?.key === cell.key
                  return (
                    <button
                      key={cell.key}
                      ref={setCellRef(cell.key)}
                      type="button"
                      className={`annual-overview-monthly-records-matrix__cell annual-overview-monthly-records-matrix__cell--${cell.status}${
                        isActive ? ' is-active' : ''
                      }`}
                      data-annual-overview-monthly-record-cell="true"
                      aria-label={cell.ariaLabel}
                      aria-describedby={isActive ? tooltipId : undefined}
                      style={{
                        borderColor:
                          cell.status === 'historical' ? '#e6e9ec' : cell.color,
                        backgroundColor:
                          cell.status === 'historical'
                            ? '#f5f7f9'
                            : getAnnualOverviewMonthlyRecordCellFill(
                                cell.type,
                                cell.status === 'broken' ? 0.1 : 0.08,
                              ),
                      }}
                      onPointerDown={(event) => {
                        lastPointerTypeRef.current = event.pointerType
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== 'mouse') {
                          return
                        }
                        activeInteractionModeRef.current = 'hover'
                        setActiveCellKey(cell.key)
                      }}
                      onPointerLeave={(event) => {
                        if (
                          event.pointerType === 'mouse' &&
                          activeInteractionModeRef.current === 'hover'
                        ) {
                          setActiveCellKey(null)
                          activeInteractionModeRef.current = null
                        }
                      }}
                      onFocus={() => {
                        activeInteractionModeRef.current = 'focus'
                        setActiveCellKey(cell.key)
                      }}
                      onBlur={(event) => {
                        if (activeInteractionModeRef.current !== 'focus') {
                          return
                        }
                        if (
                          event.relatedTarget instanceof Element &&
                          event.relatedTarget.closest('[data-annual-overview-monthly-record-cell="true"]') !=
                            null
                        ) {
                          return
                        }
                        setActiveCellKey(null)
                        activeInteractionModeRef.current = null
                      }}
                      onClick={() => {
                        if (
                          lastPointerTypeRef.current === 'touch' ||
                          lastPointerTypeRef.current === 'pen'
                        ) {
                          activeInteractionModeRef.current = 'touch'
                          setActiveCellKey((previous) => (previous === cell.key ? null : cell.key))
                        }
                      }}
                    >
                      <span className="annual-overview-monthly-records-matrix__value">
                        {cell.valueLabel}
                      </span>
                      <span className="annual-overview-monthly-records-matrix__year">
                        {cell.yearLabel}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p className="annual-overview-monthly-records__footnote">{model.footnote}</p>

      {activeCell != null ? (
        <div
          ref={tooltipRef}
          id={tooltipId}
          role="tooltip"
          className="annual-overview-records-tooltip annual-overview-monthly-records-tooltip"
          style={tooltipStyle}
        >
          <MonthlyRecordTooltip cell={activeCell} />
        </div>
      ) : null}
    </section>
  )
}

function MonthlyRecordTooltip({
  cell,
}: {
  readonly cell: AnnualOverviewMonthlyRecordCell
}) {
  return (
    <>
      <div className="annual-overview-records-tooltip__title">{cell.tooltipTitle}</div>
      <div className="annual-overview-records-tooltip__detail">{cell.tooltipValue}</div>
      <div className="annual-overview-records-tooltip__detail">{cell.tooltipDate}</div>
      {cell.tooltipPrevious != null ? (
        <div className="annual-overview-records-tooltip__detail">{cell.tooltipPrevious}</div>
      ) : null}
      {cell.tooltipMargin != null ? (
        <div className="annual-overview-records-tooltip__detail">{cell.tooltipMargin}</div>
      ) : null}
      {cell.tooltipEqualled != null ? (
        <div className="annual-overview-records-tooltip__detail">{cell.tooltipEqualled}</div>
      ) : null}
    </>
  )
}
