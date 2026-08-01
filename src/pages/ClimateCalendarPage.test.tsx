import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClimateCalendarPage from '@/pages/ClimateCalendarPage'
import type { ClimateDateString, ClimateDay, DailyNormal } from '@/types/weather'

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(max-width: 760px)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

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

function daysForMonth(year: number, month: number, overrides: (day: number) => Partial<ClimateDay> = () => ({})) {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, index) => {
    const day = index + 1
    return makeRecord(
      `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}` as ClimateDateString,
      overrides(day),
    )
  })
}

type QueryState<T> = { data: T | null | undefined; isLoading?: boolean; error?: Error | null }
const refetch = vi.fn().mockResolvedValue(undefined)
function toResult<T>(state: QueryState<T>) {
  return { data: state.data, isLoading: state.isLoading ?? false, error: state.error ?? null, refetch }
}

const state = {
  archiveIndex: { data: null } as QueryState<any>,
  annual: { data: null } as QueryState<any>,
  dailyNormals: { data: null } as QueryState<any>,
}

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useClimateArchiveIndexQuery: () => toResult(state.archiveIndex),
  useAnnualClimateQuery: () => toResult(state.annual),
  useDailyNormalsQuery: () => toResult(state.dailyNormals),
}))

function renderPage(initialEntries: string[] = ['/climate-calendar']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <ClimateCalendarPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function setBaseState(year = 2024) {
  state.archiveIndex = {
    data: {
      station: 'Wakefield',
      generatedAtUtc: null,
      years: [
        { year: 2020, startDate: '2020-01-01', endDate: '2020-12-31', observationCount: 366, complete: true },
        ...(year === 2020
          ? []
          : [{ year, startDate: `${year}-01-01`, endDate: `${year}-12-31`, observationCount: 366, complete: true }]),
      ],
    },
  }
  state.annual = {
    data: {
      station: 'Wakefield',
      year,
      generatedAtUtc: null,
      complete: true,
      through: `${year}-12-31`,
      observationCount: 366,
      units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
      records: [
        ...daysForMonth(year, 1, (day) => ({ maxTempC: 10 + day, rainfallMm: 1 })),
        ...daysForMonth(year, 2),
        ...daysForMonth(year, 3),
        ...daysForMonth(year, 4, (_day) => ({ rainfallMm: year === 2020 ? null : 2 })),
        ...daysForMonth(year, 5),
        ...daysForMonth(year, 6),
        ...daysForMonth(year, 7),
        ...daysForMonth(year, 8),
        ...daysForMonth(year, 9),
        ...daysForMonth(year, 10),
        ...daysForMonth(year, 11),
        ...daysForMonth(year, 12),
      ],
    },
  }
  const normals: DailyNormal[] = Array.from({ length: 366 }, (_, index) => {
    const date = new Date(Date.UTC(2024, 0, 1 + index))
    const month = date.getUTCMonth() + 1
    const day = date.getUTCDate()
    return {
      dateKey: `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      month,
      day,
      normalMaxTempC: 12,
      normalMinTempC: 5,
      normalMeanTempC: 8.5,
      maxSampleCount: month === 2 && day === 29 ? 8 : 30,
      minSampleCount: month === 2 && day === 29 ? 8 : 30,
    }
  })
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
}

describe('ClimateCalendarPage', () => {
  beforeEach(() => {
    setMatchMedia(false)
    state.archiveIndex = { data: null }
    state.annual = { data: null }
    state.dailyNormals = { data: null }
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders the annual desktop grid by default', async () => {
    setBaseState(2024)
    renderPage(['/climate-calendar?year=2024&metric=max&month=1&date=2024-01-01'])

    await waitFor(() => {
      expect(screen.getAllByRole('grid')).toHaveLength(12)
    })
  })

  it('renders a single mobile month view with month navigation', async () => {
    setMatchMedia(true)
    setBaseState(2024)
    renderPage(['/climate-calendar?year=2024&metric=max&month=6&date=2024-06-01'])

    await waitFor(() => {
      expect(screen.getAllByRole('grid')).toHaveLength(1)
    })
    expect(screen.getByRole('button', { name: 'June' })).toBeInTheDocument()
  })

  it('shows the rainfall legend and unavailable rainfall pattern', async () => {
    setMatchMedia(true)
    setBaseState(2020)
    renderPage(['/climate-calendar?year=2020&metric=rainfall&month=4&date=2020-04-01'])

    await waitFor(() => {
      expect(screen.getByText(/Rainfall unavailable before/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('gridcell', { name: /01 Apr 2020: N\/A, unavailable/i })).toBeInTheDocument()
  })

  it('supports keyboard selection and summary updates', async () => {
    setBaseState(2024)
    renderPage(['/climate-calendar?year=2024&metric=max&month=1&date=2024-01-01'])

    const janFirst = await screen.findByRole('gridcell', { name: /01 Jan 2024/i })
    janFirst.focus()
    fireEvent.keyDown(janFirst, { key: 'ArrowRight' })

    await waitFor(() => {
      expect(screen.getByText(/02 Jan 2024/)).toBeInTheDocument()
    })
  })

  it('restores year and metric from the URL', async () => {
    setBaseState(2024)
    renderPage(['/climate-calendar?year=2020&metric=rainfall&month=5&date=2020-05-10'])

    await waitFor(() => {
      expect(screen.getByDisplayValue('2020')).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: 'Rainfall' })).toHaveAttribute('aria-pressed', 'true')
  })
})
