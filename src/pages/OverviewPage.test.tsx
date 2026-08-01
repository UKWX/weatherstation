import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import OverviewPage from '@/pages/OverviewPage'

const refetch = vi.fn().mockResolvedValue(undefined)

type QueryState<T> = {
  data: T
  isLoading?: boolean
  error?: Error | null
  isPlaceholderData?: boolean
}

type HookState = {
  current: QueryState<any>
  status: QueryState<any>
  recent: QueryState<any>
  today: QueryState<any>
  archiveIndex: QueryState<any>
  annual: QueryState<any>
  monthlyNormals: QueryState<any>
}

const state: HookState = {
  current: { data: null },
  status: { data: null },
  recent: { data: null },
  today: { data: null },
  archiveIndex: { data: null },
  annual: { data: null },
  monthlyNormals: { data: null },
}

function toQueryResult<T>(queryState: QueryState<T>) {
  return {
    data: queryState.data,
    isLoading: queryState.isLoading ?? false,
    error: queryState.error ?? null,
    isPlaceholderData: queryState.isPlaceholderData ?? false,
    refetch,
  }
}

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useCurrentConditionsQuery: () => toQueryResult(state.current),
  useStationStatusQuery: () => toQueryResult(state.status),
  useRecentObservationsQuery: () => toQueryResult(state.recent),
  useTodaySummaryQuery: () => toQueryResult(state.today),
  useClimateArchiveIndexQuery: () => toQueryResult(state.archiveIndex),
  useAnnualClimateQuery: () => toQueryResult(state.annual),
  useMonthlyNormalsQuery: () => toQueryResult(state.monthlyNormals),
}))

function setBaseState() {
  state.current = {
    data: {
      observationTimeUtc: '2026-08-01T08:00:00Z',
      fetchedAtUtc: '2026-08-01T08:00:30Z',
      temperatureC: 21.3,
      feelsLikeC: 22.1,
      dewpointC: 14.4,
      humidityPercent: 64,
      pressureHpa: 1009.1,
      windSpeedMph: 8.1,
      windGustMph: 12.5,
      windDirectionDegrees: 245,
      rainRateMmPerHour: 0.2,
      rainTodayMm: 0.6,
    },
  }

  state.status = {
    data: {
      online: true,
      live: true,
      observationTimeUtc: '2026-08-01T08:00:00Z',
      observationAgeSeconds: 12,
      checkedAtUtc: '2026-08-01T08:00:40Z',
    },
  }

  state.recent = {
    data: {
      observations: [
        {
          observationTimeUtc: '2026-08-01T07:50:00Z',
          temperatureC: 20.8,
          pressureHpa: 1008.8,
          rainRateMmPerHour: 0,
          rainTodayMm: 0.4,
        },
        {
          observationTimeUtc: '2026-08-01T08:00:00Z',
          temperatureC: 21.3,
          pressureHpa: 1009.1,
          rainRateMmPerHour: 0.2,
          rainTodayMm: 0.6,
        },
      ],
    },
  }

  state.today = {
    data: {
      maximumTemperature: { value: 21.3 },
      minimumTemperature: { value: 14.1 },
      rainfall: { totalMm: 0.6 },
    },
  }

  state.archiveIndex = {
    data: {
      years: [{ year: 2026 }],
    },
  }

  state.annual = {
    data: {
      records: [
        {
          date: '2026-07-31',
          maxTempC: 24.1,
          minTempC: 13.6,
          meanTempC: 18.9,
          rainfallMm: 0,
        },
        {
          date: '2026-08-01',
          maxTempC: 26,
          minTempC: 15,
          meanTempC: 20.5,
          rainfallMm: 1.2,
        },
      ],
    },
  }

  state.monthlyNormals = {
    data: {
      months: [
        {
          month: 8,
          meanTempC: 18.5,
          rainfallMm: 60,
        },
      ],
    },
  }
}

function renderOverview() {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T09:00:00Z'))
    refetch.mockClear()
    setBaseState()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('shows stale warning for stale data', () => {
    state.status.data = {
      ...state.status.data,
      observationAgeSeconds: 60 * 16,
    }

    renderOverview()

    expect(screen.getByText('Stale data')).toBeInTheDocument()
  })

  it('shows offline status clearly', () => {
    state.status.data = {
      ...state.status.data,
      online: false,
      live: false,
    }

    renderOverview()

    expect(screen.getByText('Offline')).toBeInTheDocument()
  })

  it('shows missing optional fields as unavailable', () => {
    state.current.data = {
      ...state.current.data,
      feelsLikeC: null,
      dewpointC: null,
      windGustMph: null,
    }

    renderOverview()

    expect(screen.getByRole('heading', { name: 'Feels-like' })).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows unavailable state when yesterday record is absent', () => {
    state.annual.data = {
      records: [
        {
          date: '2026-08-01',
          maxTempC: 26,
          minTempC: 15,
          meanTempC: 20.5,
          rainfallMm: 1.2,
        },
      ],
    }

    renderOverview()

    expect(screen.getByText("Yesterday's record unavailable")).toBeInTheDocument()
  })

  it('shows provisional labels for provisional sections', () => {
    renderOverview()

    expect(screen.getByRole('heading', { name: "Today's provisional climate" })).toBeInTheDocument()
    expect(screen.getByText('Provisional')).toBeInTheDocument()
    expect(screen.getByText('Provisional / incomplete')).toBeInTheDocument()
  })

  it('distinguishes zero rainfall from null rainfall', () => {
    state.current.data = {
      ...state.current.data,
      rainTodayMm: 0,
      rainRateMmPerHour: 0,
    }
    state.today.data = {
      ...state.today.data,
      rainfall: { totalMm: null },
    }

    renderOverview()

    expect(screen.getAllByText('0.0 mm').length).toBeGreaterThan(0)
    expect(screen.getByText('Provisional rainfall')).toBeInTheDocument()
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })
})
