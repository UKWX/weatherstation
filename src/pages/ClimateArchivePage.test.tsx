import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ClimateArchivePage from '@/pages/ClimateArchivePage'
import type { ClimateDateString, ClimateDay } from '@/types/weather'

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 20,
    minTempC: 10,
    meanTempC: 15,
    rainfallMm: 1.0,
    status: 'finalised',
    ...overrides,
  }
}

function daysForMonth(
  year: number,
  month: number,
  overrides: Partial<ClimateDay> = {},
): ClimateDay[] {
  const count = new Date(Date.UTC(year, month, 0)).getUTCDate()
  return Array.from({ length: count }, (_, i) => {
    const d = i + 1
    const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}` as ClimateDateString
    return makeRecord(date, overrides)
  })
}

// ── Mock state ────────────────────────────────────────────────────────────────

type QueryState<T> = {
  data: T | null | undefined
  isLoading?: boolean
  error?: Error | null
}

const refetch = vi.fn().mockResolvedValue(undefined)

function toResult<T>(s: QueryState<T>) {
  return { data: s.data, isLoading: s.isLoading ?? false, error: s.error ?? null, refetch }
}

const state = {
  archiveIndex: { data: null } as QueryState<any>,
  annual: { data: null } as QueryState<any>,
  monthlyNormals: { data: null } as QueryState<any>,
  dailyNormals: { data: null } as QueryState<any>,
}

vi.mock('@/hooks/usePublicWeatherQueries', () => ({
  useClimateArchiveIndexQuery: () => toResult(state.archiveIndex),
  useAnnualClimateQuery: () => toResult(state.annual),
  useAnnualClimateQueries: () =>
    ((state.archiveIndex.data?.years ?? []) as Array<{ year: number }>).map((entry) =>
      toResult({
        data:
          state.annual.data == null
            ? null
            : {
                ...state.annual.data,
                year: entry.year,
                records: (state.annual.data.records ?? [])
                  .filter(
                    (record: ClimateDay) =>
                      record.date.slice(5) !== '02-29' ||
                      entry.year % 400 === 0 ||
                      (entry.year % 4 === 0 && entry.year % 100 !== 0),
                  )
                  .map((record: ClimateDay) => ({
                    ...record,
                    date: `${entry.year}${record.date.slice(4)}` as ClimateDateString,
                  })),
              },
      }),
    ),
  useMonthlyNormalsQuery: () => toResult(state.monthlyNormals),
  useDailyNormalsQuery: () => toResult(state.dailyNormals),
}))

// ── Render helper ─────────────────────────────────────────────────────────────

function renderPage(initialEntries: string[] = ['/climate-archive']) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={initialEntries}>
        <ClimateArchivePage />
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
        { year: 2021, startDate: '2021-01-01', endDate: '2021-12-31', observationCount: 365, complete: true },
        { year: 2022, startDate: '2022-01-01', endDate: '2022-12-31', observationCount: 365, complete: true },
        { year: 2023, startDate: '2023-01-01', endDate: '2023-12-31', observationCount: 365, complete: true },
        { year, startDate: `${year}-01-01`, endDate: `${year}-12-31`, observationCount: 366, complete: year < 2026 },
      ],
    },
  }

  const allRecords: ClimateDay[] = []
  for (let m = 1; m <= 12; m++) {
    allRecords.push(...daysForMonth(year, m, { rainfallMm: m >= 5 || year > 2020 ? 1.5 : null }))
  }

  state.annual = {
    data: {
      station: 'Wakefield',
      year,
      generatedAtUtc: null,
      complete: year < 2026,
      through: null,
      observationCount: allRecords.length,
      units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
      records: allRecords,
    },
  }

  state.monthlyNormals = {
    data: {
      station: 'Wakefield',
      generatedAtUtc: null,
      baseline: '1991-2020',
      units: { temperature: '°C', rainfall: 'mm' },
      monthCount: 12,
      months: Array.from({ length: 12 }, (_, i) => ({
        month: i + 1,
        meanMaxTempC: 15,
        meanMinTempC: 5,
        meanTempC: 10,
        rainfallMm: 50,
      })),
    },
  }

  state.dailyNormals = {
    data: {
      station: 'Wakefield',
      generatedAtUtc: null,
      baseline: '1995-2024',
      units: { temperature: '°C' },
      recordCount: 366,
      records: [],
    },
  }
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ClimateArchivePage', () => {
  beforeEach(() => {
    Object.assign(state, {
      archiveIndex: { data: null },
      annual: { data: null },
      monthlyNormals: { data: null },
      dailyNormals: { data: null },
    })
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('shows loading skeleton when archive index is loading', () => {
    state.archiveIndex = { data: null, isLoading: true }
    renderPage()
    expect(screen.getByText('Loading climate archive index')).toBeDefined()
  })

  it('shows error state when archive index fails', () => {
    state.archiveIndex = { data: null, error: new Error('Network failure') }
    renderPage()
    expect(screen.getByText('Archive index unavailable')).toBeDefined()
  })

  it('renders the coverage header when archive index loads', () => {
    setBaseState(2024)
    renderPage()
    expect(screen.getByText('Archive coverage')).toBeDefined()
    expect(screen.getByText('Wakefield')).toBeDefined()
    expect(screen.getByText('From 1995')).toBeDefined()
    expect(screen.getByText('From 1 May 2020')).toBeDefined()
  })

  it('renders year selector with available years descending', () => {
    setBaseState(2024)
    renderPage()
    const select = screen.getByRole('combobox', { name: /year/i }) as HTMLSelectElement
    const options = Array.from(select.options).map((o) => o.value)
    expect(options).toEqual(['2024', '2023', '2022', '2021'])
  })

  it('shows annual view by default', () => {
    setBaseState(2024)
    renderPage()
    expect(screen.getByText('Annual summary — 2024')).toBeDefined()
    expect(screen.getByRole('heading', { name: 'Monthly spread' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Rainfall year on year' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Dry spells' })).toBeInTheDocument()
  })

  it('shows provisional warning for current year', () => {
    setBaseState(2026)
    // Override to have 2026 as provisional
    state.annual.data = {
      ...state.annual.data,
      complete: false,
      through: '2026-07-31' as ClimateDateString,
    }
    renderPage()
    expect(screen.getAllByText('Provisional').length).toBeGreaterThan(0)
  })

  it('shows 2020 rainfall incomplete warning', () => {
    setBaseState(2020)
    renderPage(['/climate-archive?year=2020'])
    // IncompleteDataWarning renders as Badge + text; use getAllByText to check the message text is present
    expect(screen.getByText(/not a complete rainfall year/)).toBeDefined()
  })

  it('renders annual stats with highest max and tied dates', () => {
    setBaseState(2024)
    // Add two records with matching high max
    const records = [...(state.annual.data?.records ?? [])]
    const idx1 = records.findIndex((r) => r.date === '2024-07-15')
    const idx2 = records.findIndex((r) => r.date === '2024-07-20')
    if (idx1 >= 0) records[idx1] = { ...records[idx1]!, maxTempC: 35.5 }
    if (idx2 >= 0) records[idx2] = { ...records[idx2]!, maxTempC: 35.5 }
    state.annual.data = { ...state.annual.data, records }
    renderPage()
    expect(screen.getByText(/Annual summary/)).toBeDefined()
  })

  it('shows annual mean stats', () => {
    setBaseState(2024)
    renderPage()
    expect(screen.getByText('Annual mean max')).toBeDefined()
    expect(screen.getByText('Annual mean min')).toBeDefined()
    expect(screen.getByText('Annual mean temperature')).toBeDefined()
  })

  it('shows monthly breakdown table', () => {
    setBaseState(2024)
    renderPage()
    expect(screen.getByText('Monthly breakdown')).toBeDefined()
    expect(screen.getByRole('table', { name: /monthly climate breakdown/i })).toBeDefined()
  })

  it('switches to monthly view when clicking a month in the breakdown table', () => {
    setBaseState(2024)
    renderPage()
    const juneBtn = screen.getByRole('button', { name: 'June' })
    fireEvent.click(juneBtn)
    expect(screen.getAllByText(/June 2024/).length).toBeGreaterThan(0)
    expect(screen.getByText('Monthly summary')).toBeDefined()
  })

  it('restores to annual view when clicking annual button', () => {
    setBaseState(2024)
    renderPage()
    const annualBtn = screen.getByRole('button', { name: /annual/i })
    fireEvent.click(annualBtn)
    expect(screen.getByText('Annual summary — 2024')).toBeDefined()
  })

  describe('URL restoration', () => {
    it('restores year from URL query param', () => {
      setBaseState(2022)
      state.archiveIndex.data = {
        ...state.archiveIndex.data,
        years: [
          { year: 2021, startDate: '2021-01-01', endDate: '2021-12-31', observationCount: 365, complete: true },
          { year: 2022, startDate: '2022-01-01', endDate: '2022-12-31', observationCount: 365, complete: true },
          { year: 2023, startDate: '2023-01-01', endDate: '2023-12-31', observationCount: 365, complete: true },
        ],
      }
      renderPage(['/climate-archive?year=2022'])
      const select = screen.getByRole('combobox', { name: /year/i }) as HTMLSelectElement
      expect(select.value).toBe('2022')
    })

    it('restores month and shows monthly view from URL', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=8'])
      const select = screen.getByRole('combobox', { name: /month/i }) as HTMLSelectElement
      expect(select.value).toBe('8')
      expect(screen.getAllByText(/August 2024/).length).toBeGreaterThan(0)
    })

    it('falls back to latest year for invalid year param', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=9999'])
      const select = screen.getByRole('combobox', { name: /year/i }) as HTMLSelectElement
      // Should default to latest available year (2024)
      expect(select.value).toBe('2024')
    })
  })

  describe('Monthly view', () => {
    it('shows monthly summary stats', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])
      expect(screen.getByText('Monthly summary')).toBeDefined()
      expect(screen.getByText('Highest maximum')).toBeDefined()
      expect(screen.getByText('Lowest minimum')).toBeDefined()
      expect(screen.getByText('Mean maximum')).toBeDefined()
    })

    it('shows rainfall data for available months', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])
      expect(screen.getByText(/Rainfall total/)).toBeDefined()
      expect(screen.getByText(/Rain days/)).toBeDefined()
    })

    it('shows rainfall unavailable message for pre-2020-05 months', () => {
      setBaseState(2020)
      renderPage(['/climate-archive?year=2020&month=3'])
      expect(screen.getByText(/Unavailable \(pre-May 2020\)/)).toBeDefined()
    })

    it('shows daily observations table', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])
      expect(screen.getByText('Daily observations')).toBeDefined()
      const table = screen.getByRole('table', { name: /daily observations for june/i })
      expect(table).toBeDefined()
    })

    it('shows 30 rows for June', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])
      const table = screen.getByRole('table', { name: /daily observations for june/i })
      const rows = table.querySelectorAll('tbody tr')
      expect(rows).toHaveLength(30)
    })

    it('sorts by max temperature descending', () => {
      setBaseState(2024)
      // Make one day have a high max
      const records = [...(state.annual.data?.records ?? [])]
      const hotDay = records.findIndex((r) => r.date === '2024-06-15')
      if (hotDay >= 0) records[hotDay] = { ...records[hotDay]!, maxTempC: 33.0 }
      state.annual.data = { ...state.annual.data, records }

      renderPage(['/climate-archive?year=2024&month=6'])

      // Click Max sort button twice to get descending
      const maxSortBtn = screen.getByRole('button', { name: /^Max/ })
      fireEvent.click(maxSortBtn) // ascending
      fireEvent.click(maxSortBtn) // descending

      const table = screen.getByRole('table', { name: /daily observations for june/i })
      const firstRow = table.querySelector('tbody tr:first-child')
      // First row should contain 15 Jun (highest max)
      expect(firstRow?.textContent).toContain('15')
    })

    it('opens day details drawer on row click', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])

      const table = screen.getByRole('table', { name: /daily observations for june/i })
      const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement
      fireEvent.click(firstRow)

      expect(screen.getByRole('dialog')).toBeDefined()
      expect(screen.getByText('Observations')).toBeDefined()
    })

    it('closes day details drawer with close button', async () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])

      const table = screen.getByRole('table', { name: /daily observations for june/i })
      const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement
      fireEvent.click(firstRow)

      const closeBtn = screen.getByRole('button', { name: /close/i })
      fireEvent.click(closeBtn)

      await waitFor(() => {
        expect(screen.queryByRole('dialog')).toBeNull()
      })
    })

    it('shows links to On This Day and Data Corrections in day drawer', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])

      const table = screen.getByRole('table', { name: /daily observations for june/i })
      const firstRow = table.querySelector('tbody tr') as HTMLTableRowElement
      fireEvent.click(firstRow)

      expect(screen.getByText(/On This Day/)).toBeDefined()
      expect(screen.getByText(/Data Corrections/)).toBeDefined()
    })

    it('navigates back to annual view via back button', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])

      const backBtn = screen.getByRole('button', { name: /annual view/i })
      fireEvent.click(backBtn)

      expect(screen.getByText('Annual summary — 2024')).toBeDefined()
    })
  })

  describe('Missing dates handling', () => {
    it('does not silently remove missing days from count', () => {
      setBaseState(2024)
      // Remove June 15 from records to create a missing day
      const records = (state.annual.data?.records ?? []).filter(
        (r: ClimateDay) => r.date !== ('2024-06-15' as ClimateDateString),
      )
      state.annual.data = { ...state.annual.data, records }

      renderPage(['/climate-archive?year=2024&month=6'])

      // Should show 29/30 valid rather than pretending the month is complete
      expect(screen.getByText(/Max temperature: 29\/30 days valid/)).toBeDefined()
    })
  })

  describe('2020 rainfall handling', () => {
    it('marks January 2020 rainfall as unavailable in daily table', () => {
      setBaseState(2020)
      // Verify the pre-May 2020 records have null rainfall
      const janRecord = state.annual.data?.records?.find(
        (r: ClimateDay) => r.date === '2020-01-01',
      )
      expect(janRecord?.rainfallMm).toBeNull()
      renderPage(['/climate-archive?year=2020&month=1'])

      // Unavailable should appear in the daily table cells
      const cells = screen.getAllByText('Unavailable')
      expect(cells.length).toBeGreaterThan(0)
    })

    it('shows rainfall for post-May 2020 months', () => {
      setBaseState(2020)
      renderPage(['/climate-archive?year=2020&month=7'])
      expect(screen.getByText(/Rainfall total/)).toBeDefined()
      // Should NOT show unavailable message
      expect(screen.queryByText(/Unavailable \(pre-May 2020\)/)).toBeNull()
    })
  })

  describe('CSV export', () => {
    it('provides export buttons in annual and monthly views', () => {
      setBaseState(2024)
      renderPage()
      expect(screen.getByRole('button', { name: 'Export monthly CSV' })).toBeDefined()
    })

    it('provides daily CSV export in monthly view', () => {
      setBaseState(2024)
      renderPage(['/climate-archive?year=2024&month=6'])
      expect(screen.getByRole('button', { name: 'Export daily CSV' })).toBeDefined()
    })
  })

  describe('Ties handling', () => {
    it('shows tied count badge when multiple dates share the highest max', () => {
      setBaseState(2024)
      const records = [...(state.annual.data?.records ?? [])]
      const days = ['2024-07-10', '2024-07-20', '2024-07-25']
      days.forEach((date) => {
        const idx = records.findIndex((r) => r.date === date)
        if (idx >= 0) records[idx] = { ...records[idx]!, maxTempC: 37.0 }
      })
      state.annual.data = { ...state.annual.data, records }

      renderPage()

      expect(screen.getByText(/3 tied/)).toBeDefined()
    })
  })
})

// ── CSV utility tests ─────────────────────────────────────────────────────────

import { buildDailyCsv, buildAnnualMonthlyCsv } from '@/features/climateArchive/csv'

describe('buildDailyCsv', () => {
  it('includes a header row and one row per day', () => {
    const records: ClimateDay[] = [
      makeRecord('2024-06-01' as ClimateDateString, { maxTempC: 22, minTempC: 12, meanTempC: 17, rainfallMm: 0 }),
      makeRecord('2024-06-02' as ClimateDateString, { maxTempC: 25, minTempC: 15, meanTempC: 20, rainfallMm: 5.2 }),
    ]

    const csv = buildDailyCsv(records, 2024, 6)
    const lines = csv.split('\r\n')

    expect(lines[0]).toBe('Date,Max (°C),Min (°C),Mean (°C),Rainfall (mm),Status')
    expect(lines).toHaveLength(3)
    expect(lines[1]).toContain('2024-06-01')
    expect(lines[1]).toContain('22.0')
    expect(lines[1]).toContain('0.0')
    expect(lines[2]).toContain('5.2')
  })

  it('marks pre-2020-05-01 dates as Unavailable for rainfall', () => {
    const records: ClimateDay[] = [
      makeRecord('2020-01-15' as ClimateDateString, { rainfallMm: null }),
      makeRecord('2020-05-01' as ClimateDateString, { rainfallMm: 2.5 }),
    ]

    const csv = buildDailyCsv(records, 2020)
    const lines = csv.split('\r\n').filter((l) => l.trim())

    const jan = lines.find((l) => l.includes('2020-01-15'))
    const may = lines.find((l) => l.includes('2020-05-01'))

    expect(jan).toContain('Unavailable')
    expect(may).toContain('2.5')
  })

  it('leaves rainfall empty (not zero) for missing post-May-2020 records', () => {
    const records: ClimateDay[] = [
      makeRecord('2024-06-10' as ClimateDateString, { rainfallMm: null }),
    ]

    const csv = buildDailyCsv(records, 2024, 6)
    const lines = csv.split('\r\n')
    // Rainfall field should be empty (between commas), not "0.0" and not "Unavailable"
    // CSV: date,max,min,mean,rainfall,status → empty rainfall = two adjacent commas before status
    expect(lines[1]).toMatch(/,,finalised/)
    // The rainfall field (column 4) should be empty, not "0.0" - check by splitting
    const cols = lines[1].split(',')
    expect(cols[4]).toBe('') // rainfall field is empty
    expect(lines[1]).not.toContain('Unavailable')
  })

  it('sorts records by date in output', () => {
    const records: ClimateDay[] = [
      makeRecord('2024-06-03' as ClimateDateString),
      makeRecord('2024-06-01' as ClimateDateString),
      makeRecord('2024-06-02' as ClimateDateString),
    ]

    const csv = buildDailyCsv(records, 2024, 6)
    const lines = csv.split('\r\n').slice(1)

    expect(lines[0]).toContain('2024-06-01')
    expect(lines[1]).toContain('2024-06-02')
    expect(lines[2]).toContain('2024-06-03')
  })
})

describe('buildAnnualMonthlyCsv', () => {
  it('includes header and 12 rows', () => {
    const summaries = Array.from({ length: 12 }, (_, i) => ({
      year: 2024,
      month: i + 1,
      highestMax: { value: 25, dates: [] as ClimateDateString[] },
      lowestMin: { value: 0, dates: [] as ClimateDateString[] },
      meanMaxTempC: 20,
      meanMinTempC: 8,
      meanTempC: 14,
      meanMaxTempAnomalyC: null,
      meanMinTempAnomalyC: null,
      meanTempAnomalyC: null,
      rainfallTotalMm: 45,
      rainfallPercentageOfNormal: 90,
      rainfallDifferenceFromNormalMm: -5,
      rainDays: 10,
      wettestDay: { value: 12, dates: [] as ClimateDateString[] },
      coverage: {
        startDate: '2024-01-01' as ClimateDateString,
        endDate: '2024-01-31' as ClimateDateString,
        expectedDays: 31,
        provisional: false,
        maxTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        minTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        meanTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        rainfall: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
      },
    }))

    const csv = buildAnnualMonthlyCsv(2024, summaries)
    const lines = csv.split('\r\n')

    // First line is "Year: 2024", second is header, then 12 data rows
    expect(lines[0]).toBe('Year: 2024')
    expect(lines[1]).toContain('Month')
    expect(lines).toHaveLength(14)
  })

  it('marks pre-May-2020 months as Unavailable for rainfall', () => {
    const jan2020 = {
      year: 2020,
      month: 1,
      highestMax: { value: null, dates: [] as ClimateDateString[] },
      lowestMin: { value: null, dates: [] as ClimateDateString[] },
      meanMaxTempC: null,
      meanMinTempC: null,
      meanTempC: null,
      meanMaxTempAnomalyC: null,
      meanMinTempAnomalyC: null,
      meanTempAnomalyC: null,
      rainfallTotalMm: null,
      rainfallPercentageOfNormal: null,
      rainfallDifferenceFromNormalMm: null,
      rainDays: 0,
      wettestDay: { value: null, dates: [] as ClimateDateString[] },
      coverage: {
        startDate: '2020-01-01' as ClimateDateString,
        endDate: '2020-01-31' as ClimateDateString,
        expectedDays: 31,
        provisional: false,
        maxTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        minTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        meanTemperature: { valid: 31, missing: 0, unavailable: 0, availableDays: 31, complete: true },
        rainfall: { valid: 0, missing: 0, unavailable: 31, availableDays: 0, complete: false },
      },
    }

    const csv = buildAnnualMonthlyCsv(2020, [jan2020])
    expect(csv).toContain('Unavailable')
  })
})
