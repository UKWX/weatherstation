import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { AnnualOverviewRecordsCard } from '@/features/annualOverview/AnnualOverviewRecordsCard'
import type { AnnualOverviewRecordEvent } from '@/features/annualOverview/model'

const rows: readonly AnnualOverviewRecordEvent[] = [
  {
    date: '2026-01-03',
    type: 'record-high-max',
    currentValueC: 34.6,
    previousRecordC: 27.9,
    previousRecordYears: [2011],
    marginC: 6.7,
  },
  {
    date: '2026-01-03',
    type: 'record-high-min',
    currentValueC: 19.2,
    previousRecordC: 16.0,
    previousRecordYears: [2003],
    marginC: 3.2,
  },
  {
    date: '2026-02-14',
    type: 'record-low-min',
    currentValueC: -8.1,
    previousRecordC: -5.6,
    previousRecordYears: [1996],
    marginC: 2.5,
  },
  {
    date: '2026-03-02',
    type: 'record-low-max',
    currentValueC: -1.2,
    previousRecordC: 0.2,
    previousRecordYears: [2001],
    marginC: 1.4,
  },
  {
    date: '2026-05-20',
    type: 'record-high-max',
    currentValueC: 29.1,
    previousRecordC: 25.1,
    previousRecordYears: [2018],
    marginC: 4,
  },
  {
    date: '2026-06-11',
    type: 'record-high-min',
    currentValueC: 15.8,
    previousRecordC: 15.0,
    previousRecordYears: [2020],
    marginC: 0.8,
  },
]

describe('AnnualOverviewRecordsCard', () => {
  it('renders summary tiles, split record cells, and focus tooltip text', async () => {
    const user = userEvent.setup()
    const { container } = render(
      <AnnualOverviewRecordsCard
        year={2026}
        rows={rows}
        latestObservedDate="2026-08-31"
        linkedMonthlyRecordMonthsByDate={new Map([['2026-01-03', 'January']])}
      />,
    )

    expect(screen.getByText('6 new all-time daily records for Wakefield through 31 Aug 2026')).toBeInTheDocument()
    expect(screen.getByText('Largest margin')).toBeInTheDocument()
    expect(screen.getAllByText('+6.7°C')).toHaveLength(2)
    expect(container.querySelectorAll('.annual-overview-records-grid__fill--split')).toHaveLength(2)

    const cell = screen.getByLabelText(
      '03 Jan 2026. Record high max: 34.6°C. Previous record 27.9°C (2011). Beaten by 6.7°C. Record high min: 19.2°C. Previous record 16.0°C (2003). Beaten by 3.2°C',
    )
    await user.tab()
    expect(cell).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    expect(cell).toHaveAttribute('aria-describedby', 'annual-overview-records-tooltip-2026-01-03')
    expect(screen.getAllByText('03 Jan 2026')).toHaveLength(2)
    expect(screen.getByText('Record high max: 34.6°C')).toBeInTheDocument()
    expect(screen.getByText('Previous record 27.9°C (2011)')).toBeInTheDocument()
    expect(screen.getByText('Beaten by 3.2°C')).toBeInTheDocument()
    expect(screen.getByText('Also a new monthly record for January')).toBeInTheDocument()
    expect(container.querySelector('.annual-overview-records-grid__cell--linked-monthly')).not.toBeNull()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()

    cell.blur()
    fireEvent.focus(cell)
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()

    fireEvent.pointerDown(document.body)
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
  })

  it('keeps the full records table collapsed until toggled open', async () => {
    const user = userEvent.setup()
    render(<AnnualOverviewRecordsCard year={2026} rows={rows} latestObservedDate="2026-08-31" />)

    expect(screen.queryByRole('table')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Show all records' }))
    expect(screen.getByRole('button', { name: 'Hide all records' })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
    expect(screen.getAllByRole('row')).toHaveLength(rows.length + 1)

    await user.click(screen.getByRole('button', { name: 'Hide all records' }))
    expect(screen.getByRole('button', { name: 'Show all records' })).toBeInTheDocument()
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })
})
