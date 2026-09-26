import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNUAL_OVERVIEW_CHART_HEIGHT,
  ANNUAL_OVERVIEW_EXPORT_WIDTH,
  buildAnnualOverviewExportSvg,
  downloadAnnualOverviewPng,
} from '@/features/annualOverview/chart'
import { buildAnnualOverviewMonthlyRecordsCardModel } from '@/features/annualOverview/monthlyRecords'
import type { AnnualOverviewDataset } from '@/features/annualOverview/model'
import type { AnnualClimatePayload, ClimateDateString, ClimateDay } from '@/types/weather'

const dataset: AnnualOverviewDataset = {
  days: [
    {
      index: 0,
      date: '2026-01-01',
      dateKey: '01-01',
      month: 1,
      day: 1,
      timestamp: Date.UTC(2026, 0, 1, 12),
      actualMaxC: 12,
      actualMinC: 4,
      actualMeanC: 8,
      rollingMeanC: 8,
      normalMaxC: 9,
      normalMinC: 3,
      recordHighMaxC: 11,
      recordLowMaxC: -2,
      recordHighMinC: 6,
      recordLowMinC: -5,
      recordHighMaxYears: [2025],
      recordLowMaxYears: [],
      recordHighMinYears: [],
      recordLowMinYears: [],
      recordFlags: ['record-high-max'],
    },
    {
      index: 1,
      date: '2026-01-02',
      dateKey: '01-02',
      month: 1,
      day: 2,
      timestamp: Date.UTC(2026, 0, 2, 12),
      actualMaxC: 11,
      actualMinC: 3,
      actualMeanC: 7,
      rollingMeanC: 7.5,
      normalMaxC: 9.5,
      normalMinC: 3.5,
      recordHighMaxC: 12,
      recordLowMaxC: -1.5,
      recordHighMinC: 5.5,
      recordLowMinC: -4.5,
      recordHighMaxYears: [2026],
      recordLowMaxYears: [],
      recordHighMinYears: [],
      recordLowMinYears: [],
      recordFlags: [],
    },
  ],
  recordEvents: [
    {
      date: '2026-01-01',
      type: 'record-high-max',
      currentValueC: 12,
      previousRecordC: 11,
      previousRecordYears: [2025],
      marginC: 1,
    },
  ],
  loadedHistoricalYears: [1995, 2025],
  latestObservedDate: '2026-01-02',
  normalPeriodLabel: '1995–2025',
  normalPeriodYears: [1995, 2025],
}

function makeRecord(
  date: ClimateDateString,
  overrides: Partial<ClimateDay> = {},
): ClimateDay {
  return {
    date,
    maxTempC: 10,
    minTempC: 2,
    meanTempC: 6,
    rainfallMm: null,
    status: 'finalised',
    ...overrides,
  }
}

function makePayload(year: number, records: readonly ClimateDay[]): AnnualClimatePayload {
  return {
    station: 'Wakefield',
    year,
    generatedAtUtc: null,
    complete: year < 2026,
    through: `${year}-12-31` as ClimateDateString,
    observationCount: records.length,
    units: { temperature: '°C', rainfall: 'mm', pressure: null, wind: null },
    records,
  }
}

const monthlyRecords = buildAnnualOverviewMonthlyRecordsCardModel({
  year: 2026,
  selectedYearRecords: [
    makeRecord('2026-01-01', { maxTempC: 12 }),
    makeRecord('2026-03-20', { maxTempC: 18 }),
  ],
  historicalPayloads: [
    makePayload(1995, [makeRecord('1995-01-05', { maxTempC: 11 })]),
    makePayload(2025, [makeRecord('2025-03-11', { maxTempC: 16 })]),
    makePayload(2026, [
      makeRecord('2026-01-01', { maxTempC: 12 }),
      makeRecord('2026-03-20', { maxTempC: 18 }),
    ]),
  ],
})

describe('annual overview export', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('builds a wrapped export layout that keeps chart metadata inside the SVG', () => {
    const svg = buildAnnualOverviewExportSvg({
      year: 2026,
      dataset,
      monthlyRecords,
      subtitle:
        'Daily maximum & minimum vs. the 1995–2025 normal range and all-time daily records across the full year.',
      footnote:
        'Shaded band shows the 1995–2025 normal range between the average daily maximum and minimum, coloured by temperature. Dashed lines mark the all-time daily record maximum and minimum for each calendar day. Outlined points are new all-time daily records set in 2026. Data year to date runs to 02 January 2026.',
      recordSummary:
        '1 new all-time daily record for Wakefield was set in 2026 through 02 January 2026 with the matching summary wrapped inside the export card.',
    })

    expect(svg).toContain(`width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}"`)
    expect(svg).toContain('<style>')
    expect(svg).toContain('<tspan')
    expect(svg).toContain('2026 Daily Temperature Data for Wakefield')
    expect(svg).not.toContain('Wakefield, United Kingdom')
    expect(svg).toContain(
      'Daily maximum &amp; minimum vs. the normal range and all-time daily records',
    )
    expect(svg).toContain(
      'Shaded band shows the normal range between the average daily maximum and minimum, coloured by temperature.',
    )
    expect(svg).toContain('New daily records set in 2026')
    expect(svg).toContain('Monthly records')
    expect(svg).toContain('fill="#f5f7f9"')
    expect(svg).toContain('Biggest margins')
    expect(svg).toContain('Stronger colour = bigger margin over previous record')
    expect(svg).toContain('was 11.0°C (2025)')
    expect(svg).not.toContain('SELECTED-YEAR VALUE')
    expect(svg).not.toContain('<script><![CDATA[')

    const chartTransformY = Number(
      svg.match(/<g transform="translate\(40 (\d+(?:\.\d+)?)\)">/)?.[1] ?? Number.NaN,
    )
    const footnoteY = Number(
      svg.match(/<text x="56" y="(\d+(?:\.\d+)?)" font-size="11\.5" fill="#5b6773">/)?.[1] ??
        Number.NaN,
    )
    const cardMatches = [
      ...svg.matchAll(
        /<rect x="32" y="(\d+(?:\.\d+)?)" width="1416" height="(\d+(?:\.\d+)?)" rx="16" fill="#ffffff" stroke="#e6e9ec"\/>/g,
      ),
    ]

    expect(chartTransformY).toBe(94)
    expect(footnoteY).toBe(chartTransformY + ANNUAL_OVERVIEW_CHART_HEIGHT + 28)
    expect(cardMatches).toHaveLength(3)

    const chartCardY = Number(cardMatches[0]?.[1] ?? Number.NaN)
    const chartCardHeight = Number(cardMatches[0]?.[2] ?? Number.NaN)
    const recordsCardY = Number(cardMatches[1]?.[1] ?? Number.NaN)
    const monthlyRecordsCardY = Number(cardMatches[2]?.[1] ?? Number.NaN)
    expect(chartCardHeight).toBe(706)
    expect(recordsCardY).toBe(chartCardY + chartCardHeight + 20)
    expect(monthlyRecordsCardY).toBeGreaterThan(recordsCardY)
  })

  it('supports exporting chart-only without record markers', () => {
    const svg = buildAnnualOverviewExportSvg({
      year: 2026,
      dataset,
      monthlyRecords,
      subtitle: 'Short subtitle',
      footnote: 'Short footnote',
      recordSummary: 'Summary',
      includeChart: true,
      includeRecords: false,
      showRecordOutlines: false,
    })

    expect(svg).not.toContain('New daily records set in 2026')
    expect(svg).not.toContain('<circle')
  })

  it('includes records-grid tooltip hooks when interactivity is enabled', () => {
    const svg = buildAnnualOverviewExportSvg({
      year: 2026,
      dataset,
      monthlyRecords,
      subtitle: 'Short subtitle',
      footnote: 'Short footnote',
      recordSummary: 'Summary',
      includeChart: false,
      includeRecords: true,
      interactiveRecords: true,
    })

    expect(svg).toContain('class="records-grid-cell--record"')
    expect(svg).toContain('id="records-tooltip-2026"')
    expect(svg).not.toContain('<script><![CDATA[')
  })

  it('optionally embeds records-grid tooltip script for web-hosted SVG usage', () => {
    const svg = buildAnnualOverviewExportSvg({
      year: 2026,
      dataset,
      monthlyRecords,
      subtitle: 'Short subtitle',
      footnote: 'Short footnote',
      recordSummary: 'Summary',
      includeChart: false,
      includeRecords: true,
      interactiveRecords: true,
      embedInteractiveScript: true,
    })

    expect(svg).toContain('<script><![CDATA[')
  })

  it('renders a PNG download from the generated SVG dimensions', async () => {
    class FakeImage {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null

      set src(_: string) {
        this.onload?.()
      }
    }

    const originalImage = globalThis.Image
    const originalFileReader = globalThis.FileReader
    globalThis.Image = FakeImage as unknown as typeof Image
    globalThis.FileReader = class FakeFileReader {
      onload: null | (() => void) = null
      onerror: null | (() => void) = null
      result: string | ArrayBuffer | null = null

      readAsDataURL() {
        this.result = 'data:image/svg+xml;base64,PHN2Zy8+'
        this.onload?.()
      }
    } as unknown as typeof FileReader

    const anchor = document.createElement('a')
    const click = vi.fn()
    anchor.click = click

    const context = {
      scale: vi.fn(),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '#ffffff',
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      toBlob: vi.fn((callback: BlobCallback) => {
        callback(new Blob(['png'], { type: 'image/png' }))
      }),
    }

    const originalCreateElement = document.createElement.bind(document)
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'canvas') {
        return canvas as unknown as HTMLCanvasElement
      }
      if (tagName === 'a') {
        return anchor
      }
      return originalCreateElement(tagName)
    })

    const originalCreateObjectURL = URL.createObjectURL
    const originalRevokeObjectURL = URL.revokeObjectURL
    URL.createObjectURL = vi.fn(() => 'blob:png-output')
    URL.revokeObjectURL = vi.fn()

    try {
      await downloadAnnualOverviewPng(
        '<svg width="1480" height="980" xmlns="http://www.w3.org/2000/svg"><rect width="1480" height="980" fill="#fff"/></svg>',
        'annual-overview.png',
      )

      vi.runAllTimers()

      expect(canvas.width).toBe(2960)
      expect(canvas.height).toBe(1960)
      expect(context.scale).toHaveBeenCalledWith(2, 2)
      expect(context.fillRect).toHaveBeenCalledWith(0, 0, 1480, 980)
      expect(context.drawImage).toHaveBeenCalled()
      expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
      expect(anchor.download).toBe('annual-overview.png')
      expect(anchor.href).toBe('blob:png-output')
      expect(click).toHaveBeenCalledTimes(1)
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:png-output')
    } finally {
      globalThis.Image = originalImage
      globalThis.FileReader = originalFileReader
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })
})
