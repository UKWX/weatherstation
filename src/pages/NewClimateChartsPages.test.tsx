import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import NormalsAnomaliesPage from './NormalsAnomaliesPage'
import RecordsPage from './RecordsPage'

vi.mock('@/hooks/usePublicWeatherQueries', () => {
  const payload = { year: 2024, records: [], complete: false, through: null }
  const result = (data: unknown) => ({ data, isLoading: false, error: null, refetch: vi.fn() })
  return {
    useClimateArchiveIndexQuery: () => result({ years: [{ year: 2024 }] }),
    useAnnualClimateQuery: () => result(payload),
    useAnnualClimateQueries: () => [result(payload)],
    useDailyNormalsQuery: () => result({ records: [] }),
    useMonthlyNormalsQuery: () => result({ months: [] }),
  }
})

function mount(page: ReactNode) {
  return render(<QueryClientProvider client={new QueryClient()}><MemoryRouter>{page}</MemoryRouter></QueryClientProvider>)
}

describe('climate chart page mounts', () => {
  it('mounts temperature anomaly, rainfall grid and quadrant on the normals page', () => {
    mount(<NormalsAnomaliesPage />)
    for (const title of ['Temperature anomaly grid', 'Rainfall grid', 'Warm/wet quadrant']) {
      expect(screen.getByRole('heading', { name: title })).toBeInTheDocument()
    }
  })

  it('mounts warm and frost spells on the records page', () => {
    mount(<RecordsPage />)
    expect(screen.getByRole('heading', { name: 'Warm and frost spells' })).toBeInTheDocument()
  })
})
