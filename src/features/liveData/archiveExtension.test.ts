import { describe, expect, it } from 'vitest'
import type { RecentObservation } from '@/types/weather'
import {
  determineArchiveDatesForRange,
  mapMinuteArchiveObservationToRecentObservation,
  mergeRecentAndArchiveObservations,
} from '@/features/liveData/archiveExtension'

function makeObservation(
  observationTimeUtc: string,
  overrides: Partial<RecentObservation> = {},
): RecentObservation {
  return {
    observationTimeUtc,
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

describe('determineArchiveDatesForRange', () => {
  it('selects only the current and previous Europe/London archive dates for a 24-hour range', () => {
    const dates = determineArchiveDatesForRange(
      new Date('2026-08-01T00:30:00Z').valueOf(),
      new Date('2026-08-02T00:30:00Z').valueOf(),
    )

    expect(dates).toEqual(['2026-08-01', '2026-08-02'])
  })
})

describe('mergeRecentAndArchiveObservations', () => {
  it('deduplicates by timestamp and prefers recent.json values', () => {
    const merged = mergeRecentAndArchiveObservations(
      [
        makeObservation('2026-08-01T12:00:00Z', {
          temperatureC: 22,
          dewpointC: 14,
        }),
      ],
      [
        makeObservation('2026-08-01T11:00:00Z', { temperatureC: 20 }),
        makeObservation('2026-08-01T12:00:00Z', { temperatureC: 21 }),
      ],
    )

    expect(merged).toHaveLength(2)
    expect(merged[1]?.temperatureC).toBe(22)
    expect(merged[1]?.dewpointC).toBe(14)
  })
})

describe('mapMinuteArchiveObservationToRecentObservation', () => {
  it('maps archive minute observations without inventing unsupported fields', () => {
    const mapped = mapMinuteArchiveObservationToRecentObservation({
      observationTimeUtc: '2026-08-01T12:00:00Z',
      timestampMs: new Date('2026-08-01T12:00:00Z').valueOf(),
      temperatureC: 21,
      humidityPercent: 70,
      pressureHpa: 1008,
      windSpeedMph: 8,
      windGustMph: 12,
      rainRateMmPerHour: 0,
      rainTodayMm: 1.2,
    })

    expect(mapped.temperatureC).toBe(21)
    expect(mapped.humidityPercent).toBe(70)
    expect(mapped.dewpointC).toBeNull()
    expect(mapped.uvIndex).toBeNull()
  })
})
