import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import { AppRouter } from '@/app/router'

function renderWithRouter(initialPath = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AppRouter />
    </MemoryRouter>,
  )
}

describe('AppRouter placeholder routes', () => {
  it('renders Overview at /', async () => {
    renderWithRouter('/')
    expect(await screen.findByRole('heading', { name: 'Overview' })).toBeTruthy()
  })

  it('renders Live Data at /live-data', async () => {
    renderWithRouter('/live-data')
    expect(
      await screen.findByRole('heading', { name: 'Live Data' }),
    ).toBeTruthy()
  })

  it('renders Climate Archive at /climate-archive', async () => {
    renderWithRouter('/climate-archive')
    expect(
      await screen.findByRole('heading', { name: 'Climate Archive' }),
    ).toBeTruthy()
  })

  it('renders Data Corrections at /data-corrections', async () => {
    renderWithRouter('/data-corrections')
    expect(
      await screen.findByRole('heading', { name: 'Data Corrections' }),
    ).toBeTruthy()
  })

  it('renders all 12 navigation links', () => {
    renderWithRouter('/')
    const nav = screen.getByRole('navigation', { name: 'Main navigation' })
    const links = nav.querySelectorAll('a')
    expect(links.length).toBe(12)
  })

  it('renders dev diagnostics route when DEV mode is enabled', async () => {
    if (!import.meta.env.DEV) {
      return
    }

    renderWithRouter('/dev/api-diagnostics')
    expect(
      await screen.findByRole('heading', { name: 'API Diagnostics (DEV)' }),
    ).toBeTruthy()
  })
})
