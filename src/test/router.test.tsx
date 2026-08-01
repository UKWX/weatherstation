import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AppRouter } from '@/app/router'
import { ThemeProvider } from '@/app/theme'

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useStationStatusQuery: () => ({
    data: { online: true },
    error: null,
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

  it('shows unavailable data corrections state', async () => {
    renderWithRouter('/data-corrections')
    expect(screen.getByRole('heading', { name: 'Data Corrections' })).toBeInTheDocument()
    expect(await screen.findByText('Data Corrections locked')).toBeInTheDocument()
  })
})
