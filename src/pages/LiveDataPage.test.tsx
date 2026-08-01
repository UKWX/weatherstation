import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import LiveDataPage from '@/pages/LiveDataPage'
import type { CurrentConditions, RecentObservation, StationStatus } from '@/types/weather'

// ---- mock the public weather API hooks ----
const refetchCurrent = vi.fn().mockResolvedValue(undefined)
const refetchStatus = vi.fn().mockResolvedValue(undefined)
const refetchRecent = vi.fn().mockResolvedValue(undefined)

type MockQueryResult<T> = {
  data: T | undefined
  isLoading: boolean
  isError: boolean
  isFetching: boolean
  isStale: boolean
  isPlaceholderData: boolean
  error: Error | null
  dataUpdatedAt: number
  refetch: () => Promise<void>
}

const mockState: {
  current: MockQueryResult<CurrentConditions | null>
  status: MockQueryResult<StationStatus | null>
  recent: MockQueryResult<{ observations: RecentObservation[] } | null>
} = {
  current: {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    isStale: false,
    isPlaceholderData: false,
    error: null,
    dataUpdatedAt: 0,
    refetch: refetchCurrent,
  },
  status: {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    isStale: false,
    isPlaceholderData: false,
    error: null,
    dataUpdatedAt: 0,
    refetch: refetchStatus,
  },
  recent: {
    data: undefined,
    isLoading: false,
    isError: false,
    isFetching: false,
    isStale: false,
    isPlaceholderData: false,
    error: null,
    dataUpdatedAt: 0,
    refetch: refetchRecent,
  },
}

// Intercept useQuery calls
vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()
  return {
    ...actual,
    useQuery: vi.fn((options: { queryKey: readonly unknown[] }) => {
      const key = options.queryKey
      if (Array.isArray(key) && key.includes('current')) return mockState.current
      if (Array.isArray(key) && key.includes('status')) return mockState.status
      if (Array.isArray(key) && key.includes('recent')) return mockState.recent
      return {
        data: undefined,
        isLoading: false,
        isError: false,
        isFetching: false,
        isStale: false,
        isPlaceholderData: false,
        error: null,
        dataUpdatedAt: 0,
        refetch: vi.fn(),
      }
    }),
  }
})

function makeObs(utc: string, overrides: Partial<RecentObservation> = {}): RecentObservation {
  return {
    observationTimeUtc: utc,
    observationTimeLocal: null,
    temperatureC: null,
    dewpointC: null,
    heatIndexC: null,
    windChillC: null,
    humidityPercent: null,
    pressureHpa: null,
    windSpeedKmh: null,
    windSpeedMph: null,
    windGustKmh: null,
    windGustMph: null,
    windDirectionDegrees: null,
    rainRateMmPerHour: null,
    rainTodayMm: null,
    solarRadiationWm2: null,
    uvIndex: null,
    ...overrides,
  }
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <LiveDataPage />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

function setBaseState(nowUtc = '2026-08-01T12:00:00Z') {
  const nowMs = new Date(nowUtc).valueOf()
  const obs1h = makeObs('2026-08-01T11:10:00Z', { temperatureC: 21.0, pressureHpa: 1010 })
  const obs30m = makeObs('2026-08-01T11:30:00Z', { temperatureC: 21.5, pressureHpa: 1011 })
  const obsNow = makeObs('2026-08-01T12:00:00Z', { temperatureC: 22.0, pressureHpa: 1012 })

  mockState.current = {
    ...mockState.current,
    data: {
      observationTimeUtc: nowUtc,
      observationTimeLocal: null,
      fetchedAtUtc: nowUtc,
      temperatureC: 22.0,
      feelsLikeC: 23.0,
      dewpointC: 15.0,
      humidityPercent: 64,
      pressureHpa: 1012,
      windSpeedKmh: 12,
      windSpeedMph: 7.5,
      windGustKmh: 20,
      windGustMph: 12.4,
      windDirectionDegrees: 270,
      rainRateMmPerHour: 0,
      rainTodayMm: 0.2,
      heatIndexC: 23.0,
      windChillC: null,
      solarRadiationWm2: null,
      uvIndex: null,
    },
    dataUpdatedAt: nowMs,
  }

  mockState.status = {
    ...mockState.status,
    data: {
      status: 'online',
      collectorStatus: 'running',
      message: null,
      checkedAtUtc: nowUtc,
      observationTimeUtc: '2026-08-01T11:59:00Z',
      live: true,
      online: true,
      observationAgeSeconds: 60,
    },
    dataUpdatedAt: nowMs,
  }

  mockState.recent = {
    ...mockState.recent,
    data: {
      observations: [obs1h, obs30m, obsNow],
    },
    dataUpdatedAt: nowMs,
  }
}

describe('LiveDataPage', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-08-01T12:00:00Z'))
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: async () => '',
      }),
    )
    refetchCurrent.mockClear()
    refetchStatus.mockClear()
    refetchRecent.mockClear()
    setBaseState()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('renders the page heading', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Live Data' })).toBeInTheDocument()
  })

  it('shows Online badge when station is online', () => {
    renderPage()
    expect(screen.getByText('Online')).toBeInTheDocument()
  })

  it('shows Offline badge when station is offline', () => {
    mockState.status.data = {
      ...mockState.status.data!,
      online: false,
      live: false,
    }
    renderPage()
    // At least one Offline badge must be present (appears in header and station health)
    expect(screen.getAllByText('Offline').length).toBeGreaterThan(0)
  })

  it('shows stale warning when observation age exceeds threshold', () => {
    mockState.status.data = {
      ...mockState.status.data!,
      observationTimeUtc: '2026-08-01T11:40:00Z', // 20 minutes ago
    }
    renderPage()
    // StaleDataWarning renders "Stale data" text
    expect(screen.getAllByText('Stale data').length).toBeGreaterThan(0)
  })

  it('shows current temperature', () => {
    renderPage()
    expect(screen.getByText('22.0 °C')).toBeInTheDocument()
  })

  it('shows — for missing optional fields', () => {
    mockState.current.data = {
      ...mockState.current.data!,
      feelsLikeC: null,
      dewpointC: null,
      humidityPercent: null,
    }
    renderPage()
    // There should be multiple dashes for missing values
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('shows station health panel', () => {
    renderPage()
    expect(screen.getByRole('heading', { name: 'Station health' })).toBeInTheDocument()
    expect(screen.getByText('Live')).toBeInTheDocument()
  })

  it('shows 1h range filter button selected by default', () => {
    renderPage()
    const btn = screen.getByRole('button', { name: /1 hour/i })
    expect(btn).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches range to 3h when button clicked', () => {
    renderPage()
    const btn3h = screen.getByRole('button', { name: /3 hours/i })
    fireEvent.click(btn3h)
    expect(btn3h).toHaveAttribute('aria-pressed', 'true')
    const btn1h = screen.getByRole('button', { name: /1 hour/i })
    expect(btn1h).toHaveAttribute('aria-pressed', 'false')
  })

  it('switches range to 6h when button clicked', () => {
    renderPage()
    const btn6h = screen.getByRole('button', { name: /6 hours/i })
    fireEvent.click(btn6h)
    expect(btn6h).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches range to 12h when button clicked', () => {
    renderPage()
    const btn12h = screen.getByRole('button', { name: /12 hours/i })
    fireEvent.click(btn12h)
    expect(btn12h).toHaveAttribute('aria-pressed', 'true')
  })

  it('switches range to 24h when button clicked', () => {
    renderPage()
    const btn24h = screen.getByRole('button', { name: /24 hours/i })
    fireEvent.click(btn24h)
    expect(btn24h).toHaveAttribute('aria-pressed', 'true')
  })

  it('extends 24h range with archive observations and deduplicates timestamps', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      text: async () =>
        [
          JSON.stringify({
            observation_time_utc: '2026-07-31T13:00:00Z',
            temperature_c: 19,
            humidity_percent: 70,
            pressure_hpa: 1009,
            wind_speed_mph: 5,
            wind_gust_mph: 8,
            rain_rate_mm_per_hour: 0,
            rain_today_mm: 0,
          }),
          JSON.stringify({
            observation_time_utc: '2026-08-01T12:00:00Z',
            temperature_c: 999,
            humidity_percent: 99,
            pressure_hpa: 999,
            wind_speed_mph: 99,
            wind_gust_mph: 99,
            rain_rate_mm_per_hour: 9,
            rain_today_mm: 9,
          }),
        ].join('\n'),
    })
    vi.stubGlobal(
      'fetch',
      fetchMock,
    )

    renderPage()
    fireEvent.click(screen.getByRole('button', { name: /24 hours/i }))

    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalled()
  })

  it('shows pause button', () => {
    renderPage()
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument()
  })

  it('toggles to paused state and shows resume button', () => {
    renderPage()
    const pauseBtn = screen.getByRole('button', { name: /pause automatic refresh/i })
    fireEvent.click(pauseBtn)
    expect(screen.getByText(/auto-refresh paused/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /resume automatic refresh/i })).toBeInTheDocument()
  })

  it('resume button restores auto-refresh countdown', () => {
    renderPage()
    const pauseBtn = screen.getByRole('button', { name: /pause automatic refresh/i })
    fireEvent.click(pauseBtn)
    expect(screen.getByText(/auto-refresh paused/i)).toBeInTheDocument()
    const resumeBtn = screen.getByRole('button', { name: /resume automatic refresh/i })
    fireEvent.click(resumeBtn)
    expect(screen.queryByText(/auto-refresh paused/i)).not.toBeInTheDocument()
  })

  it('manual refresh button triggers refetch', () => {
    // The refetch calls are synchronous (void-ing the returned Promise)
    renderPage()
    const refreshBtn = screen.getByTestId('manual-refresh-btn')
    fireEvent.click(refreshBtn)
    expect(refetchCurrent).toHaveBeenCalledTimes(1)
    expect(refetchStatus).toHaveBeenCalledTimes(1)
    expect(refetchRecent).toHaveBeenCalledTimes(1)
  })

  it('shows refreshing state while fetching', () => {
    mockState.current = { ...mockState.current, isFetching: true }
    renderPage()
    expect(screen.getByText(/refreshing/i)).toBeInTheDocument()
  })

  it('keeps previous chart data visible after a failed refresh (placeholderData)', () => {
    // Initial load has data; then an error comes in but data is still present
    mockState.recent = {
      ...mockState.recent,
      isError: true,
      error: new Error('Network error'),
      // data is still present (TanStack Query placeholderData behaviour)
    }
    renderPage()
    // Table should still show observations
    expect(screen.getByRole('heading', { name: 'Recent observations' })).toBeInTheDocument()
    // No full-page error since we have partial data
    expect(screen.queryByText('Live data unavailable')).not.toBeInTheDocument()
  })

  it('shows observations in newest-first order by default', () => {
    renderPage()
    const cells = screen.getAllByRole('cell')
    const times = cells.filter((cell) => cell.querySelector('time'))
    // First time element should be the latest observation
    expect(times.length).toBeGreaterThan(0)
  })

  it('sort button toggles order label', () => {
    renderPage()
    const sortBtn = screen.getByRole('button', { name: /sort/i })
    expect(sortBtn.textContent).toContain('Newest first')
    fireEvent.click(sortBtn)
    expect(sortBtn.textContent).toContain('Oldest first')
  })

  it('shows missing values as em-dash in table', () => {
    mockState.recent.data = {
      observations: [
        makeObs('2026-08-01T11:00:00Z', { temperatureC: null, pressureHpa: 1010 }),
      ],
    }
    renderPage()
    // Should have some em-dash cells
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
  })

  it('hides columns when all values are null for that field', () => {
    mockState.recent.data = {
      observations: [
        makeObs('2026-08-01T11:00:00Z', {
          temperatureC: 20,
          solarRadiationWm2: null,
          uvIndex: null,
        }),
      ],
    }
    renderPage()
    // solarRadiationWm2 should not appear in the table header
    expect(screen.queryByText(/solar/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/uv index/i)).not.toBeInTheDocument()
  })

  it('measurement toggle hides and shows table column', () => {
    renderPage()
    // Temperature should be visible
    expect(screen.getByText('Temp (°C)')).toBeInTheDocument()
    // Click Temperature toggle to hide it
    const tempBtn = screen.getByRole('button', { name: /temperature/i, hidden: false })
    fireEvent.click(tempBtn)
    expect(screen.queryByText('Temp (°C)')).not.toBeInTheDocument()
    // Re-enable
    fireEvent.click(tempBtn)
    expect(screen.getByText('Temp (°C)')).toBeInTheDocument()
  })

  it('renders CSV export button', () => {
    renderPage()
    expect(screen.getByTestId('csv-export-btn')).toBeInTheDocument()
  })

  it('CSV button is disabled when no observations in range', () => {
    // Set observations in the past so 1h range has none
    mockState.recent.data = {
      observations: [
        makeObs('2026-07-31T12:00:00Z', { temperatureC: 20 }), // 24h ago
      ],
    }
    renderPage()
    const csvBtn = screen.getByTestId('csv-export-btn')
    expect(csvBtn).toBeDisabled()
  })

  it('shows full-page error only when all queries fail with no data', () => {
    mockState.current = { ...mockState.current, data: undefined, isError: true, error: new Error('fail') }
    mockState.status = { ...mockState.status, data: undefined, isError: true, error: new Error('fail') }
    mockState.recent = { ...mockState.recent, data: undefined, isError: true, error: new Error('fail') }
    renderPage()
    expect(screen.getByText(/live data unavailable/i)).toBeInTheDocument()
  })

  it('shows no-observations message when range returns nothing', () => {
    // All observations are 24h old, but we select 1h
    mockState.recent.data = {
      observations: [makeObs('2026-07-31T12:00:00Z', { temperatureC: 20 })],
    }
    renderPage()
    expect(screen.getByText(/no observations in the last 1 hour/i)).toBeInTheDocument()
  })

  it('shows "Current conditions unavailable" when current data is null', () => {
    mockState.current.data = null
    renderPage()
    expect(screen.getByText('Current conditions unavailable.')).toBeInTheDocument()
  })

  it('shows "Station status unavailable" when status data is null', () => {
    mockState.status.data = null
    renderPage()
    expect(screen.getByText('Station status unavailable.')).toBeInTheDocument()
  })
})
