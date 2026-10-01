import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OnThisDayPage from '@/pages/OnThisDayPage'
import type { ClimateDateString, ClimateDay, DailyNormal } from '@/types/weather'

function makeRecord(date: ClimateDateString, overrides: Partial<ClimateDay> = {}): ClimateDay {
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

type QueryState<T> = { data: T | null | undefined; isLoading?: boolean; error?: Error | null }
const refetch = vi.fn().mockResolvedValue(undefined)
function toResult<T>(state: QueryState<T>) {
  return { data: state.data, isLoading: state.isLoading ?? false, error: state.error ?? null, refetch }
}

const state = {
  archiveIndex: { data: null } as QueryState<any>,
  dailyNormals: { data: null } as QueryState<any>,
  annuals: [] as QueryState<any>[],
}

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useClimateArchiveIndexQuery: () => toResult(state.archiveIndex),
  useDailyNormalsQuery: () => toResult(state.dailyNormals),
  useAnnualClimateQueries: () => state.annuals.map((entry) => toResult(entry)),
}))

function renderPage(initialEntries: string[] = ['/on-this-day']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <OnThisDayPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function setBaseState() {
  state.archiveIndex = {
    data: {
      station: 'Wakefield',
      generatedAtUtc: null,
      years: [
        { year: 2020, startDate: '2020-01-01', endDate: '2020-12-31', observationCount: 366, complete: true },
        { year: 2023, startDate: '2023-01-01', endDate: '2023-12-31', observationCount: 365, complete: true },
        { year: 2024, startDate: '2024-01-01', endDate: '2024-12-31', observationCount: 366, complete: true },
      ],
    },
  }
  const normals: DailyNormal[] = [
    {
      dateKey: '02-29',
      month: 2,
      day: 29,
      normalMaxTempC: null,
      normalMinTempC: null,
      normalMeanTempC: null,
      maxSampleCount: 8,
      minSampleCount: 8,
    },
    {
      dateKey: '07-04',
      month: 7,
      day: 4,
      normalMaxTempC: 21,
      normalMinTempC: 11,
      normalMeanTempC: 16,
      maxSampleCount: 30,
      minSampleCount: 30,
    },
  ]
  state.dailyNormals = {
    data: {
      station: 'Wakefield',
      generatedAtUtc: null,
      baseline: '1995-2024',
      units: { temperature: '°C' },
      recordCount: normals.length,
      records: normals,
    },
  }
  state.annuals = [
    {
      data: {
        station: 'Wakefield',
        year: 2020,
        generatedAtUtc: null,
        complete: true,
        through: '2020-12-31',
        observationCount: 366,
        units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
        records: [
          makeRecord('2020-02-29', { maxTempC: 12, minTempC: 5, meanTempC: 8.5, rainfallMm: 3 }),
          makeRecord('2020-07-04', { maxTempC: 30, minTempC: 14, meanTempC: 22, rainfallMm: 5 }),
        ],
      },
    },
    {
      data: {
        station: 'Wakefield',
        year: 2023,
        generatedAtUtc: null,
        complete: true,
        through: '2023-12-31',
        observationCount: 365,
        units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
        records: [makeRecord('2023-07-04', { maxTempC: 30, minTempC: 16, meanTempC: 23, rainfallMm: 7 })],
      },
    },
    {
      data: {
        station: 'Wakefield',
        year: 2024,
        generatedAtUtc: null,
        complete: true,
        through: '2024-12-31',
        observationCount: 366,
        units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
        records: [
          makeRecord('2024-02-29', { maxTempC: 12, minTempC: 6, meanTempC: 9, rainfallMm: 4 }),
          makeRecord('2024-07-04', { maxTempC: 30, minTempC: 15, meanTempC: 22.5, rainfallMm: 7 }),
        ],
      },
    },
  ]
}

describe('OnThisDayPage', () => {
  beforeEach(() => {
    state.archiveIndex = { data: null }
    state.dailyNormals = { data: null }
    state.annuals = []
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('restores leap day from the URL and explains the smaller sample', async () => {
    setBaseState()
    renderPage(['/on-this-day?month=2&day=29'])

    await waitFor(() => {
      expect(screen.getByText(/29 February includes leap years only/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/across 2 available years/i)).toBeInTheDocument()
    expect(screen.getByText(/does not provide a daily normal/i)).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Today vs every year' })).toBeInTheDocument()
  })

  it('shows tied highest max years and archive links', async () => {
    setBaseState()
    renderPage(['/on-this-day?month=7&day=4'])

    await waitFor(() => {
      expect(screen.getAllByText(/30.0 °C \(2020, 2023, 2024\)/).length).toBeGreaterThan(0)
    })
    expect(screen.getAllByRole('link', { name: 'Archive' }).length).toBeGreaterThan(0)
  })

  it('marks rainfall unavailable before 2020-05-01 in the year-by-year table', async () => {
    setBaseState()
    renderPage(['/on-this-day?month=2&day=29'])

    await waitFor(() => {
      expect(screen.getByRole('table', { name: /On This Day history for February 29/i })).toBeInTheDocument()
    })
    expect(screen.getByText('Unavailable')).toBeInTheDocument()
  })
})
