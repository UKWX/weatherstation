import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { AnnualOverviewMonthlyRecordsCard } from '@/features/annualOverview/AnnualOverviewMonthlyRecordsCard'
import { buildAnnualOverviewMonthlyRecordsCardModel } from '@/features/annualOverview/monthlyRecords'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 10,
    minTempC: 2,
    meanTempC: 6,
    rainfallMm: null,
    status: 'finalised',
    ...overrides,
  }
}

function makePayload(year: number, records: readonly ClimateDay[]): AnnualClimatePayload {
  return {
    station: 'Wakefield',
    year,
    generatedAtUtc: null,
    complete: year < 2026,
    through: `${year}-12-31` as ClimateDateString,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

describe('AnnualOverviewMonthlyRecordsCard', () => {
  it('renders highlight tiles, matrix cells, and tooltips from the shared monthly model', async () => {
    const model = buildAnnualOverviewMonthlyRecordsCardModel({
      year: 2026,
      selectedYearRecords: [makeRecord('2026-03-20', { maxTempC: 18 })],
      historicalPayloads: [
        makePayload(2024, [makeRecord('2024-03-10', { maxTempC: 14 })]),
        makePayload(2025, [makeRecord('2025-03-11', { maxTempC: 16 })]),
        makePayload(2026, [makeRecord('2026-03-20', { maxTempC: 18 })]),
      ],
    })

    render(<AnnualOverviewMonthlyRecordsCard model={model} />)

    expect(screen.getByText('Monthly records')).toBeInTheDocument()
    expect(screen.getByText('All-time monthly extremes for Wakefield · 1 broken in 2026')).toBeInTheDocument()
    expect(screen.getByText('Highest max · March')).toBeInTheDocument()
    expect(screen.getByText('18.0°C')).toBeInTheDocument()

    const cell = screen.getByLabelText(
      'Highest max · March. 18.0°C. Set 20 Mar 2026. Previous record 16.0°C (2025). Beaten by 2.0°C',
    )
    cell.focus()
    expect(cell).toHaveFocus()
    expect(await screen.findByRole('tooltip')).toBeInTheDocument()
    expect(screen.getByText('Previous record 16.0°C (2025)')).toBeInTheDocument()
    expect(screen.getByText('Beaten by 2.0°C')).toBeInTheDocument()
  })
})
