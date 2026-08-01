import { describe, expect, it } from 'vitest'
import {
  computeObservationAgeSeconds,
  exportObservationsCsv,
  filterObservationsByRange,
  formatObservationAge,
  isFieldSupportedInWindow,
  isStaleObservation,
  sortObservations,
  deriveFeelsLikeFromObservation,
} from '@/features/liveData/liveDataUtils'
import type { RecentObservation } from '@/types/weather'

function makeObs(
  utc: string,
  overrides: Partial<RecentObservation> = {},
): RecentObservation {
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

const NOW = new Date('2026-08-01T12:00:00Z')

const OBS_3H_AGO = makeObs('2026-08-01T09:00:00Z', { temperatureC: 19.0 })
const OBS_2H_AGO = makeObs('2026-08-01T10:00:00Z', { temperatureC: 20.0 })
const OBS_1H_AGO = makeObs('2026-08-01T11:00:00Z', { temperatureC: 21.0 })
const OBS_NOW = makeObs('2026-08-01T12:00:00Z', { temperatureC: 22.0 })
const OBS_OUTSIDE_6H = makeObs('2026-08-01T05:00:00Z', { temperatureC: 15.0 })

const ALL_OBS = [OBS_OUTSIDE_6H, OBS_3H_AGO, OBS_2H_AGO, OBS_1H_AGO, OBS_NOW]

describe('filterObservationsByRange', () => {
  it('1h range returns only observations within last hour', () => {
    const result = filterObservationsByRange(ALL_OBS, 1, NOW)
    expect(result).toHaveLength(2)
    expect(result.map((o) => o.temperatureC)).toEqual(expect.arrayContaining([21.0, 22.0]))
    expect(result.map((o) => o.temperatureC)).not.toContain(20.0)
  })

  it('3h range returns observations within last 3 hours', () => {
    const result = filterObservationsByRange(ALL_OBS, 3, NOW)
    expect(result).toHaveLength(4)
    expect(result.some((o) => o.temperatureC === 15.0)).toBe(false)
  })

  it('6h range returns all observations within 6 hours', () => {
    const result = filterObservationsByRange(ALL_OBS, 6, NOW)
    expect(result).toHaveLength(4)
    // 7-hour-old obs is excluded
    expect(result.some((o) => o.temperatureC === 15.0)).toBe(false)
  })

  it('6h range excludes observations older than 6 hours', () => {
    const obs7h = makeObs('2026-08-01T05:00:00Z', { temperatureC: 15.0 })
    const result = filterObservationsByRange([obs7h], 6, NOW)
    expect(result).toHaveLength(0)
  })

  it('returns empty array when observations is empty', () => {
    expect(filterObservationsByRange([], 3, NOW)).toHaveLength(0)
  })

  it('includes observation exactly at cutoff boundary', () => {
    const cutoffObs = makeObs('2026-08-01T11:00:00Z', { temperatureC: 100 })
    const result = filterObservationsByRange([cutoffObs], 1, NOW)
    expect(result).toHaveLength(1)
  })
})

describe('sortObservations', () => {
  it('newest-first returns observations in descending time order', () => {
    const result = sortObservations([OBS_3H_AGO, OBS_NOW, OBS_1H_AGO], 'newest-first')
    expect(result[0]?.temperatureC).toBe(22.0)
    expect(result.at(-1)?.temperatureC).toBe(19.0)
  })

  it('oldest-first returns observations in ascending time order', () => {
    const result = sortObservations([OBS_NOW, OBS_1H_AGO, OBS_3H_AGO], 'oldest-first')
    expect(result[0]?.temperatureC).toBe(19.0)
    expect(result.at(-1)?.temperatureC).toBe(22.0)
  })

  it('does not mutate input array', () => {
    const input = [OBS_NOW, OBS_3H_AGO]
    sortObservations(input, 'oldest-first')
    expect(input[0]).toBe(OBS_NOW)
  })
})

describe('isFieldSupportedInWindow', () => {
  it('returns true when at least one observation has a non-null value', () => {
    const obs = [makeObs('2026-08-01T10:00:00Z', { temperatureC: 21.0 })]
    expect(isFieldSupportedInWindow(obs, 'temperatureC')).toBe(true)
  })

  it('returns false when all observations have null value', () => {
    const obs = [makeObs('2026-08-01T10:00:00Z')]
    expect(isFieldSupportedInWindow(obs, 'solarRadiationWm2')).toBe(false)
  })

  it('returns false for empty array', () => {
    expect(isFieldSupportedInWindow([], 'temperatureC')).toBe(false)
  })

  it('hides unsupported fields (all null across window)', () => {
    const obs = [
      makeObs('2026-08-01T10:00:00Z', { temperatureC: 21.0, solarRadiationWm2: null }),
      makeObs('2026-08-01T11:00:00Z', { temperatureC: 22.0, solarRadiationWm2: null }),
    ]
    expect(isFieldSupportedInWindow(obs, 'solarRadiationWm2')).toBe(false)
    expect(isFieldSupportedInWindow(obs, 'temperatureC')).toBe(true)
  })
})

describe('deriveFeelsLikeFromObservation', () => {
  it('returns heatIndexC when present', () => {
    const obs = makeObs('2026-08-01T10:00:00Z', { heatIndexC: 25.0, windChillC: null })
    expect(deriveFeelsLikeFromObservation(obs)).toBe(25.0)
  })

  it('returns windChillC when heatIndexC is null', () => {
    const obs = makeObs('2026-08-01T10:00:00Z', { heatIndexC: null, windChillC: 18.0 })
    expect(deriveFeelsLikeFromObservation(obs)).toBe(18.0)
  })

  it('returns null when both are null', () => {
    const obs = makeObs('2026-08-01T10:00:00Z', { heatIndexC: null, windChillC: null })
    expect(deriveFeelsLikeFromObservation(obs)).toBeNull()
  })
})

describe('exportObservationsCsv', () => {
  it('produces correct CSV header', () => {
    const csv = exportObservationsCsv([])
    const header = csv.split('\n')[0]!
    expect(header).toContain('timestamp_utc')
    expect(header).toContain('temperature_c')
    expect(header).toContain('feels_like_c')
    expect(header).toContain('rain_rate_mm_per_hour')
  })

  it('includes one data row per observation', () => {
    const obs = [
      makeObs('2026-08-01T10:00:00Z', { temperatureC: 20.5 }),
      makeObs('2026-08-01T11:00:00Z', { temperatureC: 21.5 }),
    ]
    const csv = exportObservationsCsv(obs)
    const lines = csv.split('\n')
    // header + 2 data rows
    expect(lines).toHaveLength(3)
  })

  it('outputs rows sorted by timestamp ascending', () => {
    const obs = [
      makeObs('2026-08-01T12:00:00Z', { temperatureC: 22.0 }),
      makeObs('2026-08-01T10:00:00Z', { temperatureC: 20.0 }),
    ]
    const csv = exportObservationsCsv(obs)
    const lines = csv.split('\n')
    expect(lines[1]).toContain('2026-08-01T10:00:00Z')
    expect(lines[2]).toContain('2026-08-01T12:00:00Z')
  })

  it('represents missing values as empty (not zero)', () => {
    const obs = [makeObs('2026-08-01T10:00:00Z', { temperatureC: null, pressureHpa: null })]
    const csv = exportObservationsCsv(obs)
    const dataRow = csv.split('\n')[1]!
    // temperature_c and related fields should be empty
    // The row has: timestamp_utc, timestamp_local, temperature_c, feels_like_c, ...
    const cells = dataRow.split(',')
    // temperature_c is at index 2
    expect(cells[2]).toBe('')
  })

  it('includes temperature value when present', () => {
    const obs = [makeObs('2026-08-01T10:00:00Z', { temperatureC: 21.3 })]
    const csv = exportObservationsCsv(obs)
    const dataRow = csv.split('\n')[1]!
    expect(dataRow).toContain('21.3')
  })

  it('derives feels-like from heatIndexC for CSV', () => {
    const obs = [makeObs('2026-08-01T10:00:00Z', { heatIndexC: 25.0, windChillC: null })]
    const csv = exportObservationsCsv(obs)
    const dataRow = csv.split('\n')[1]!
    expect(dataRow).toContain('25')
  })

  it('quotes values containing commas', () => {
    const obs = [
      makeObs('2026-08-01T10:00:00Z', {
        observationTimeLocal: '10:00, BST',
      } as Partial<RecentObservation>),
    ]
    const csv = exportObservationsCsv(obs)
    expect(csv).toContain('"10:00, BST"')
  })
})

describe('computeObservationAgeSeconds', () => {
  it('returns correct age in seconds', () => {
    const obs = '2026-08-01T11:55:00Z'
    const result = computeObservationAgeSeconds(obs, NOW)
    expect(result).toBe(5 * 60) // 5 minutes
  })

  it('returns null for null input', () => {
    expect(computeObservationAgeSeconds(null, NOW)).toBeNull()
  })

  it('returns null for invalid timestamp', () => {
    expect(computeObservationAgeSeconds('not-a-date', NOW)).toBeNull()
  })

  it('returns 0 for future observation times', () => {
    const future = '2026-08-01T13:00:00Z'
    expect(computeObservationAgeSeconds(future, NOW)).toBe(0)
  })
})

describe('formatObservationAge', () => {
  it('returns seconds for <60s', () => {
    expect(formatObservationAge(45)).toBe('45s')
  })

  it('returns minutes for <60min', () => {
    expect(formatObservationAge(5 * 60)).toBe('5 min')
  })

  it('returns hours for >=60min with no remainder', () => {
    expect(formatObservationAge(2 * 60 * 60)).toBe('2h')
  })

  it('returns hours and minutes when there is a remainder', () => {
    expect(formatObservationAge(90 * 60)).toBe('1h 30m')
  })

  it('returns — for null', () => {
    expect(formatObservationAge(null)).toBe('—')
  })
})

describe('isStaleObservation', () => {
  it('returns false for recent observation', () => {
    expect(isStaleObservation(5 * 60)).toBe(false)
  })

  it('returns true for observation older than 15 minutes', () => {
    expect(isStaleObservation(16 * 60)).toBe(true)
  })

  it('returns false for null age', () => {
    expect(isStaleObservation(null)).toBe(false)
  })

  it('respects custom threshold', () => {
    expect(isStaleObservation(300, 600)).toBe(false)
    expect(isStaleObservation(700, 600)).toBe(true)
  })
})
