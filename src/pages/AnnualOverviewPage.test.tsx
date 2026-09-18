import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AnnualOverviewPage from '@/pages/AnnualOverviewPage'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 12,
    minTempC: 4,
    meanTempC: 8,
    rainfallMm: 1,
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
    through: `${year}-09-17` as ClimateDateString,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

const payloads = new Map<number, AnnualClimatePayload>([
  [1995, makePayload(1995, [makeRecord('1995-01-01'), makeRecord('1995-03-01')])],
  [2000, makePayload(2000, [makeRecord('2000-02-29'), makeRecord('2000-03-01')])],
  [2024, makePayload(2024, [makeRecord('2024-03-02', { maxTempC: 14, minTempC: 6 })])],
  [2025, makePayload(2025, [makeRecord('2025-03-02', { maxTempC: 15, minTempC: 7 })])],
  [2026, makePayload(2026, [makeRecord('2026-03-02', { maxTempC: 18, minTempC: 9 })])],
])

vi.mock('@/hooks/useCurrentClimateYear', () => ({
  useCurrentClimateYear: () => 2026,
}))

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useClimateArchiveIndexQuery: () => ({
    data: {
      years: [1995, 2000, 2024, 2025, 2026].map((year) => ({ year })),
    },
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAnnualClimateQuery: (year: number) => ({
    data: payloads.get(year) ?? null,
    isLoading: false,
    error: null,
    refetch: vi.fn(),
  }),
  useAnnualClimateQueries: (years: readonly number[]) =>
    years.map((year) => ({
      data: payloads.get(year) ?? null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    })),
}))

function renderPage(initialEntries = ['/annual-overview']) {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <MemoryRouter initialEntries={initialEntries}>
        <AnnualOverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AnnualOverviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('renders the dynamic current-year overview and export controls', () => {
    renderPage()
    expect(screen.getByText('2026 OVERVIEW')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export SVG' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Export PNG' })).toBeInTheDocument()
    expect(screen.getByRole('tab', { name: 'Rainfall accumulation' })).toBeInTheDocument()
    expect(screen.getByText('15.0°C (2025)')).toBeInTheDocument()
  })

  it('supports historical year selection from the query string', () => {
    renderPage(['/annual-overview?year=2025'])
    expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2025')
    expect(
      screen.getByRole('heading', { name: '2025 Daily Temperature Data for Wakefield, United Kingdom' }),
    ).toBeInTheDocument()
  })

  it('updates the selected year from the selector', async () => {
    const user = userEvent.setup()
    renderPage(['/annual-overview?year=2026'])

    await user.selectOptions(screen.getByRole('combobox', { name: 'Year' }), '2024')

    expect(screen.getByRole('combobox', { name: 'Year' })).toHaveValue('2024')
    expect(
      screen.getByRole('heading', { name: '2024 Daily Temperature Data for Wakefield, United Kingdom' }),
    ).toBeInTheDocument()
  })

  it('switches to rainfall and comparison tabs', async () => {
    const user = userEvent.setup()
    renderPage()

    await user.click(screen.getByRole('tab', { name: 'Rainfall accumulation' }))
    expect(screen.getByRole('heading', { name: 'Rainfall accumulation by year' })).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: 'Temperature comparison' }))
    expect(screen.getByRole('heading', { name: 'Temperature comparison by year' })).toBeInTheDocument()
  })
})
