import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRouter } from '@/app/router'
import { ThemeProvider } from '@/app/theme'

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({
        data: { subscription: { unsubscribe: vi.fn() } },
      }),
    },
  },
}))

vi.mock('@/features/adminAuth/useAdminAuth', () => ({
  useAdminAuth: () => ({ permissionState: 'loading', session: null }),
  redirectToLogin: vi.fn(),
}))

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useCurrentConditionsQuery: () => ({
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
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useStationStatusQuery: () => ({
    data: {
      online: true,
      live: true,
      observationTimeUtc: '2026-08-01T08:00:00Z',
      observationAgeSeconds: 12,
      checkedAtUtc: '2026-08-01T08:00:40Z',
    },
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useRecentObservationsQuery: () => ({
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
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useTodaySummaryQuery: () => ({
    data: {
      maximumTemperature: { value: 21.3 },
      minimumTemperature: { value: 14.1 },
      rainfall: { totalMm: 0.6 },
    },
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useClimateArchiveIndexQuery: () => ({
    data: { years: [{ year: 2026 }] },
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useAnnualClimateQuery: () => ({
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
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
  useMonthlyNormalsQuery: () => ({
    data: {
      latitude: 53.6833,
      longitude: -1.5,
      generatedAtUtc: '2026-08-01T08:00:00Z',
      generatedForMonthUtc: '2026-08-01T00:00:00Z',
      records: [],
    },
    isLoading: false,
    error: null,
    isPlaceholderData: false,
    refetch: vi.fn(),
  }),
}))

function setMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(() => ({
      matches,
      media: '(prefers-color-scheme: dark)',
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

function renderWithRouter(initialPath = '/') {
  const queryClient = new QueryClient()
  return render(
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <MemoryRouter initialEntries={[initialPath]}>
          <AppRouter />
        </MemoryRouter>
      </ThemeProvider>
    </QueryClientProvider>,
  )
}

describe('AppRouter shell and navigation', () => {
  beforeEach(() => {
    window.localStorage.clear()
    setMatchMedia(false)
  })

  it('renders all 12 navigation items', () => {
    renderWithRouter('/')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    expect(nav.querySelectorAll('a, span[aria-disabled="true"]').length).toBe(12)
  })

  it('applies active route state', () => {
    renderWithRouter('/live-data')
    const active = screen.getByRole('link', { name: 'Live Data' })
    expect(active).toHaveAttribute('aria-current', 'page')
  })

  it('opens and closes mobile drawer', async () => {
    const user = userEvent.setup()
    renderWithRouter('/')

    await user.click(screen.getByRole('button', { name: 'Menu' }))
    expect(screen.getByRole('heading', { name: 'Navigation' })).toBeInTheDocument()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Navigation' })).not.toBeInTheDocument()
    })
  })

  it('persists and restores theme preference', async () => {
    const user = userEvent.setup()
    renderWithRouter('/')

    await user.click(screen.getByRole('button', { name: 'Theme: Light' }))
    expect(window.localStorage.getItem('wakefield-theme-preference')).toBe('dark')

    renderWithRouter('/')
    expect(screen.getAllByRole('button', { name: 'Theme: Dark' }).length).toBeGreaterThan(0)
  })

  it('respects operating-system preference when no stored theme exists', () => {
    setMatchMedia(true)
    renderWithRouter('/')
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('supports modal focus handling in station information', async () => {
    const user = userEvent.setup()
    renderWithRouter('/station-information')

    await user.click(
      await screen.findByRole('button', { name: 'View data lifecycle definitions' }),
    )

    const closeButton = await screen.findByRole('button', { name: 'Close dialog' })
    expect(closeButton).toHaveFocus()

    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(closeButton).not.toBeInTheDocument()
    })
  })

  it('shows data corrections page with loading state', async () => {
    renderWithRouter('/data-corrections')
    expect(screen.getByRole('heading', { name: 'Data Corrections' })).toBeInTheDocument()
    // Permission check is in-progress (mocked to return 'loading')
    expect(await screen.findByLabelText(/checking permissions/i)).toBeInTheDocument()
  })
})
