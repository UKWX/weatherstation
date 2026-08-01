import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportsPage from '@/pages/ReportsPage'
import type { ClimateDateString, ClimateDay } from '@/types/weather'

type QueryState<T> = {
  data: T | null | undefined
  isLoading?: boolean
  error?: Error | null
}

const state = {
  archiveIndex: { data: null } as QueryState<any>,
  monthlyNormals: { data: null } as QueryState<any>,
  selectedYear: { data: null } as QueryState<any>,
  allYears: [] as Array<QueryState<any>>,
}

const refetch = vi.fn().mockResolvedValue(undefined)

function toResult<T>(queryState: QueryState<T>) {
  return {
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    error: queryState.error ?? null,
    refetch,
  }
}

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useClimateArchiveIndexQuery: () => toResult(state.archiveIndex),
  useMonthlyNormalsQuery: () => toResult(state.monthlyNormals),
  useAnnualClimateQuery: () => toResult(state.selectedYear),
  useAnnualClimateQueries: () => state.allYears.map((entry) => toResult(entry)),
}))

function makeDay(date: ClimateDateString, overrides: Partial<ClimateDay> = {}): ClimateDay {
  return {
    date,
    maxTempC: 20,
    minTempC: 10,
    meanTempC: 15,
    rainfallMm: 1,
    status: 'finalised',
    ...overrides,
  }
}

function daysForMonth(year: number, month: number): ClimateDay[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    return makeDay(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as ClimateDateString, {
      maxTempC: 10 + day / 2,
      minTempC: 2 + day / 4,
      meanTempC: 6 + day / 3,
      rainfallMm: day % 4 === 0 ? 0 : Number((day / 10).toFixed(1)),
    })
  })
}

function payloadForYear(year: number) {
  const records: ClimateDay[] = []
  for (let month = 1; month <= 12; month++) {
    records.push(...daysForMonth(year, month))
  }
  return {
    station: 'Wakefield',
    year,
    generatedAtUtc: null,
    complete: true,
    through: `${year}-12-31`,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

function renderPage(initialEntry: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialEntry]}>
        <ReportsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('ReportsPage', () => {
  beforeEach(() => {
    const payload2023 = payloadForYear(2023)
    const payload2024 = payloadForYear(2024)
    state.archiveIndex = {
      data: {
        station: 'Wakefield',
        generatedAtUtc: null,
        years: [
          { year: 2023, startDate: '2023-01-01', endDate: '2023-12-31', observationCount: 365, complete: true },
          { year: 2024, startDate: '2024-01-01', endDate: '2024-12-31', observationCount: 366, complete: true },
        ],
      },
    }
    state.monthlyNormals = {
      data: {
        station: 'Wakefield',
        generatedAtUtc: null,
        baseline: '1991-2020',
        units: { temperature: '°C', rainfall: 'mm' },
        monthCount: 12,
        months: Array.from({ length: 12 }, (_, index) => ({
          month: index + 1,
          meanMaxTempC: 18,
          meanMinTempC: 9,
          meanTempC: 13.5,
          rainfallMm: 50,
        })),
      },
    }
    state.selectedYear = { data: payload2024 }
    state.allYears = [{ data: payload2023 }, { data: payload2024 }]
  })

  it('renders annual report snapshot', () => {
    const { container } = renderPage('/reports?year=2024&mode=annual')
    expect(screen.getByRole('heading', { name: /2024 annual report/i })).toBeDefined()
    expect(container.querySelector('.reports-card')).toMatchSnapshot()
  })

  it('renders monthly report snapshot and compact output', () => {
    const { container } = renderPage('/reports?year=2024&month=6&mode=monthly')
    expect(screen.getByRole('heading', { name: /June 2024 monthly report/i })).toBeDefined()
    expect(screen.getByText(/Compact copyable text/i)).toBeDefined()
    expect(container.querySelector('.reports-card')).toMatchSnapshot()
  })
})
