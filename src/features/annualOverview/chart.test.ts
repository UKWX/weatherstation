import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ANNUAL_OVERVIEW_EXPORT_WIDTH,
  buildAnnualOverviewExportSvg,
  downloadAnnualOverviewPng,
} from '@/features/annualOverview/chart'
import type { AnnualOverviewDataset } from '@/features/annualOverview/model'

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
      recordFlags: [],
    },
  ],
  recordEvents: [
    {
      date: '2026-01-01',
      type: 'record-high-max',
      currentValueC: 12,
      previousRecordC: 11,
      marginC: 1,
    },
  ],
  loadedHistoricalYears: [1995, 2025],
  latestObservedDate: '2026-01-02',
  normalPeriodLabel: '1995–2025',
  normalPeriodYears: [1995, 2025],
}

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
      subtitle:
        'Daily maximum & minimum vs. the 1995–2025 normal range and all-time daily records across the full year.',
      footnote:
        'Shaded band shows the 1995–2025 normal range between the average daily maximum and minimum, coloured by temperature, with record lines and new-record markers kept inside the export card.',
      recordSummary:
        '1 new all-time daily record for Wakefield was set in 2026 through 02 January 2026 with the matching summary wrapped inside the export card.',
    })

    expect(svg).toContain(`width="${ANNUAL_OVERVIEW_EXPORT_WIDTH}"`)
    expect(svg).toContain('<style>')
    expect(svg).toContain('<tspan')
    expect(svg).toContain('New daily records set in 2026')
    expect(svg).toContain('fill="#f5f7f9"')
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
    globalThis.Image = FakeImage as unknown as typeof Image

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
      URL.createObjectURL = originalCreateObjectURL
      URL.revokeObjectURL = originalRevokeObjectURL
    }
  })
})
