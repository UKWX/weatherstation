import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { TableWrapper } from '@/components/ui'
import {
  ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE,
  buildAnnualOverviewRecordsCardModel,
  formatAnnualOverviewPreviousRecordLabel,
  getAnnualOverviewRecordFillColor,
  getAnnualOverviewRecordTypeLabel,
  type AnnualOverviewRecordCardDateGroup,
} from '@/features/annualOverview/recordsCard'
import type { AnnualOverviewRecordEvent } from '@/features/annualOverview/model'
import { formatEuropeLondonDisplay } from '@/lib/climate'
import type { ClimateDateString } from '@/types/weather'

const DAY_HEADER_MARKERS = [1, 5, 10, 15, 20, 25, 30] as const
const TOOLTIP_GAP = 8
const TOOLTIP_EDGE_PADDING = 16

export function AnnualOverviewRecordsCard({
  year,
  rows,
  latestObservedDate,
  linkedMonthlyRecordMonthsByDate,
}: {
  readonly year: number
  readonly rows: readonly AnnualOverviewRecordEvent[]
  readonly latestObservedDate: ClimateDateString | null
  readonly linkedMonthlyRecordMonthsByDate?: ReadonlyMap<ClimateDateString, string>
}) {
  const model = useMemo(
    () =>
      buildAnnualOverviewRecordsCardModel({
        year,
        rows,
        latestObservedDate,
        linkedMonthlyRecordMonthsByDate,
      }),
    [year, rows, latestObservedDate, linkedMonthlyRecordMonthsByDate],
  )
  const [showAllRecords, setShowAllRecords] = useState(false)
  const [activeDateKey, setActiveDateKey] = useState<string | null>(null)
  const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({ opacity: 0 })
  const [tooltipReady, setTooltipReady] = useState(false)
  const activeInteractionModeRef = useRef<'hover' | 'focus' | 'touch' | null>(null)
  const lastPointerTypeRef = useRef<string | null>(null)
  const cardRef = useRef<HTMLElement | null>(null)
  const tooltipRef = useRef<HTMLDivElement | null>(null)
  const cellRefs = useRef(new Map<string, HTMLButtonElement>())

  const activeGroup =
    activeDateKey != null ? (model.groupedRecords.get(activeDateKey) ?? null) : null
  const tooltipId =
    activeGroup == null ? undefined : `annual-overview-records-tooltip-${year}-${activeGroup.dateKey}`

  useEffect(() => {
    setShowAllRecords(false)
  }, [rows.length, year])

  useEffect(() => {
    if (activeDateKey != null && !model.groupedRecords.has(activeDateKey)) {
      setActiveDateKey(null)
      activeInteractionModeRef.current = null
    }
  }, [activeDateKey, model.groupedRecords])

  useLayoutEffect(() => {
    if (activeGroup == null) {
      setTooltipReady(false)
      setTooltipStyle({ opacity: 0 })
      return
    }

    const updatePosition = () => {
      const card = cardRef.current
      const tooltip = tooltipRef.current
      const cell = cellRefs.current.get(activeGroup.dateKey)
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

      setTooltipStyle({
        left,
        top,
        opacity: 1,
      })
      setTooltipReady(true)
    }

    updatePosition()
    window.addEventListener('resize', updatePosition)
    return () => {
      window.removeEventListener('resize', updatePosition)
    }
  }, [activeGroup])

  useEffect(() => {
    if (activeDateKey == null) {
      return
    }

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element)) {
        return
      }
      if (target.closest('[data-annual-overview-record-cell="true"]') == null) {
        setActiveDateKey(null)
        activeInteractionModeRef.current = null
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setActiveDateKey(null)
        activeInteractionModeRef.current = null
      }
    }

    document.addEventListener('pointerdown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [activeDateKey])

  const setCellRef =
    (dateKey: string) =>
    (node: HTMLButtonElement | null): void => {
      if (node == null) {
        cellRefs.current.delete(dateKey)
        return
      }
      cellRefs.current.set(dateKey, node)
    }

  return (
    <section ref={cardRef} className="card annual-overview-records-card">
      <h2>New daily records set in {year}</h2>
      <p>{model.summaryText}</p>

      <div className="annual-overview-records-tiles" role="list" aria-label="Records summary">
        {model.tiles.map((tile) => (
          <div key={tile.key} className="annual-overview-records-tile" role="listitem">
            <div className="annual-overview-records-tile__label">
              {tile.color != null ? (
                <span
                  className="annual-overview-records-tile__swatch"
                  style={{ backgroundColor: tile.color }}
                  aria-hidden="true"
                />
              ) : null}
              <span>{tile.label}</span>
            </div>
            <div className="annual-overview-records-tile__value">{tile.value}</div>
          </div>
        ))}
      </div>

      <div className="annual-overview-records-grid-scroll">
        <div className="annual-overview-records-grid-card">
          <div
            className="annual-overview-records-grid"
            style={{ '--annual-overview-records-columns': 31 } as CSSProperties}
          >
            <div className="annual-overview-records-grid__corner" />
            {DAY_HEADER_MARKERS.map((day) => (
              <div
                key={day}
                className="annual-overview-records-grid__day-header"
                style={{ gridColumn: `${day + 1} / span 1` }}
              >
                {day}
              </div>
            ))}

            {model.monthRows.map((row, rowIndex) => (
              <div key={row.month} className="annual-overview-records-grid__row">
                <div
                  className="annual-overview-records-grid__month"
                  style={{ gridRow: `${rowIndex + 2} / span 1` }}
                >
                  {row.label}
                </div>
                {row.cells.map((cell) => {
                  if (!cell.valid) {
                    return (
                      <div
                        key={cell.dateKey}
                        className="annual-overview-records-grid__cell annual-overview-records-grid__cell--invalid"
                        style={{
                          gridColumn: `${cell.day + 1} / span 1`,
                          gridRow: `${rowIndex + 2} / span 1`,
                        }}
                      />
                    )
                  }

                  if (cell.group == null) {
                    return (
                      <div
                        key={cell.dateKey}
                        className="annual-overview-records-grid__cell annual-overview-records-grid__cell--empty"
                        style={{
                          gridColumn: `${cell.day + 1} / span 1`,
                          gridRow: `${rowIndex + 2} / span 1`,
                        }}
                      />
                    )
                  }

                  const isActive = activeGroup?.dateKey === cell.group.dateKey
                  return (
                    <button
                      key={cell.dateKey}
                      ref={setCellRef(cell.group.dateKey)}
                      type="button"
                      className={`annual-overview-records-grid__cell annual-overview-records-grid__cell--record${
                        isActive ? ' is-active' : ''
                      }${
                        cell.group.linkedMonthlyRecordMonth != null
                          ? ' annual-overview-records-grid__cell--linked-monthly'
                          : ''
                      }`}
                      style={{
                        gridColumn: `${cell.day + 1} / span 1`,
                        gridRow: `${rowIndex + 2} / span 1`,
                      }}
                      data-annual-overview-record-cell="true"
                      data-record-date={cell.group.dateKey}
                      aria-label={cell.group.ariaLabel}
                      aria-describedby={isActive ? tooltipId : undefined}
                      tabIndex={0}
                      onPointerDown={(event) => {
                        lastPointerTypeRef.current = event.pointerType
                      }}
                      onPointerEnter={(event) => {
                        if (event.pointerType !== 'mouse') {
                          return
                        }
                        activeInteractionModeRef.current = 'hover'
                        setActiveDateKey(cell.group?.dateKey ?? null)
                      }}
                      onPointerLeave={(event) => {
                        if (
                          event.pointerType === 'mouse' &&
                          activeInteractionModeRef.current === 'hover'
                        ) {
                          setActiveDateKey(null)
                          activeInteractionModeRef.current = null
                        }
                      }}
                      onFocus={() => {
                        activeInteractionModeRef.current = 'focus'
                        setActiveDateKey(cell.group?.dateKey ?? null)
                      }}
                      onBlur={(event) => {
                        if (activeInteractionModeRef.current === 'focus') {
                          if (
                            event.relatedTarget instanceof Element &&
                            event.relatedTarget.closest('[data-annual-overview-record-cell="true"]') !=
                              null
                          ) {
                            return
                          }
                          setActiveDateKey(null)
                          activeInteractionModeRef.current = null
                        }
                      }}
                      onClick={() => {
                        if (
                          lastPointerTypeRef.current === 'touch' ||
                          lastPointerTypeRef.current === 'pen'
                        ) {
                          activeInteractionModeRef.current = 'touch'
                          setActiveDateKey((previous) =>
                            previous === cell.group?.dateKey ? null : (cell.group?.dateKey ?? null),
                          )
                        }
                      }}
                    >
                      <RecordCellFill group={cell.group} />
                      <span className="annual-overview-records-grid__sr-only">
                        {cell.group.displayDate}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="annual-overview-records-legend" aria-label="Records legend">
        {model.presentTypes.map((type) => (
          <div key={type} className="annual-overview-records-legend__item">
            <span
              className="annual-overview-records-legend__swatch"
              style={{ backgroundColor: ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[type] }}
              aria-hidden="true"
            />
            <span>{getAnnualOverviewRecordTypeLabel(type)}</span>
          </div>
        ))}
      </div>

      <p className="annual-overview-records-legend__note">
        Stronger colour = bigger margin over previous record
      </p>

      <div className="annual-overview-records-margins">
        <h3>Biggest margins</h3>
        {model.topRecords.length === 0 ? (
          <p className="annual-overview-records-margins__empty">No records yet.</p>
        ) : (
          <ol className="annual-overview-records-margins__list">
            {model.topRecords.map((row) => (
              <li key={`${row.date}-${row.type}`} className="annual-overview-records-margins__item">
                <div className="annual-overview-records-margins__date">
                  {formatEuropeLondonDisplay(row.date, { day: '2-digit', month: 'short' })}
                </div>
                <div className="annual-overview-records-margins__type">
                  <span
                    className="annual-overview-records-margins__swatch"
                    style={{
                      backgroundColor: ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[row.type],
                    }}
                    aria-hidden="true"
                  />
                  <span>{getAnnualOverviewRecordTypeLabel(row.type)}</span>
                </div>
                <div className="annual-overview-records-margins__value">
                  {row.currentValueC.toFixed(1)}°C
                </div>
                <div className="annual-overview-records-margins__previous">
                  {formatAnnualOverviewPreviousRecordLabel(row)}
                </div>
                <div className="annual-overview-records-margins__margin">
                  +{row.marginC.toFixed(1)}°C
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      {rows.length > 0 ? (
        <>
          <button
            type="button"
            className="annual-overview-records-toggle"
            onClick={() => setShowAllRecords((previous) => !previous)}
            aria-expanded={showAllRecords}
          >
            {showAllRecords ? 'Hide all records' : 'Show all records'}
          </button>

          {showAllRecords ? (
            <TableWrapper>
              <table>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Record type</th>
                    <th scope="col">{year} value</th>
                    <th scope="col">Previous record</th>
                    <th scope="col">Margin</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={`${row.date}-${row.type}`}>
                      <td>{formatEuropeLondonDisplay(row.date)}</td>
                      <td>
                        <span
                          className="annual-overview-record-tag"
                          style={{
                            backgroundColor: ANNUAL_OVERVIEW_RECORD_CARD_COLOR_BY_TYPE[row.type],
                          }}
                        >
                          {getAnnualOverviewRecordTypeLabel(row.type)}
                        </span>
                      </td>
                      <td>{row.currentValueC.toFixed(1)}°C</td>
                      <td>{formatAnnualOverviewPreviousRecordLabel(row)}</td>
                      <td>+{row.marginC.toFixed(1)}°C</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrapper>
          ) : null}
        </>
      ) : null}

      {activeGroup != null ? (
        <div
          id={tooltipId}
          ref={tooltipRef}
          role="tooltip"
          className="annual-overview-records-tooltip"
          style={tooltipReady ? tooltipStyle : { ...tooltipStyle, visibility: 'hidden' }}
        >
          <div className="annual-overview-records-tooltip__title">{activeGroup.displayDate}</div>
          {activeGroup.tooltipBlocks.map((block, index) => (
            <div
              key={`${activeGroup.dateKey}-${index}`}
              className="annual-overview-records-tooltip__block"
            >
              <div className="annual-overview-records-tooltip__heading">
                <span
                  className="annual-overview-records-tooltip__swatch"
                  style={{ backgroundColor: block.color }}
                  aria-hidden="true"
                />
                <span>{block.title}</span>
              </div>
              <div className="annual-overview-records-tooltip__detail">{block.previous}</div>
              <div className="annual-overview-records-tooltip__detail">{block.margin}</div>
            </div>
          ))}
          {activeGroup.linkedMonthlyRecordMonth != null ? (
            <div className="annual-overview-records-tooltip__detail annual-overview-records-tooltip__detail--linked-monthly">
              Also a new monthly record for {activeGroup.linkedMonthlyRecordMonth}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

function RecordCellFill({ group }: { readonly group: AnnualOverviewRecordCardDateGroup }) {
  if (group.visualRecords.length === 1) {
    const row = group.visualRecords[0]!
    return (
      <span
        className="annual-overview-records-grid__fill"
        style={{ backgroundColor: getAnnualOverviewRecordFillColor(row.type, row.marginC) }}
        aria-hidden="true"
      />
    )
  }

  const [first, second] = group.visualRecords
  if (first == null || second == null) {
    return null
  }

  return (
    <>
      <span
        className="annual-overview-records-grid__fill annual-overview-records-grid__fill--split-base"
        aria-hidden="true"
      />
      <span
        className="annual-overview-records-grid__fill annual-overview-records-grid__fill--split annual-overview-records-grid__fill--split-a"
        style={{ backgroundColor: getAnnualOverviewRecordFillColor(first.type, first.marginC) }}
        aria-hidden="true"
      />
      <span
        className="annual-overview-records-grid__fill annual-overview-records-grid__fill--split annual-overview-records-grid__fill--split-b"
        style={{ backgroundColor: getAnnualOverviewRecordFillColor(second.type, second.marginC) }}
        aria-hidden="true"
      />
    </>
  )
}
