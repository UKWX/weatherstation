import { describe, expect, it } from 'vitest'
import { flatlineTemperature, inQcWindow, QC_DAILY_MAX } from './qc'

describe('quality-control windows', () => {
  it('holds the bonfire-night hour (5 Nov 2026 18:39-19:39 UTC) at the last good reading', () => {
    const rows = [
      { observationTimeUtc: '2026-11-05T18:37:00Z', temperatureC: 9.3 },
      { observationTimeUtc: '2026-11-05T18:55:00Z', temperatureC: 11.2 },
      { observationTimeUtc: '2026-11-05T19:39:30Z', temperatureC: 9.5 },
      { observationTimeUtc: '2026-11-05T19:41:00Z', temperatureC: 9.4 },
    ]
    expect(flatlineTemperature(rows).map((r) => r.temperatureC)).toEqual([9.3, 9.3, 9.3, 9.4])
    expect(rows[1].temperatureC).toBe(11.2)
  })
  it('recognises times in a window, and the corrected high for that day', () => {
    expect(inQcWindow('2026-11-05T18:55:00+00:00')).toBe(true)
    expect(inQcWindow('2026-11-05T13:31:00+00:00')).toBe(false)
    expect(QC_DAILY_MAX['2026-11-05'].maxTempC).toBe(10.1)
  })
})
