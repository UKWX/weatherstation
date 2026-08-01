import { describe, expect, it } from 'vitest'
import {
  buildCustomGraphResult,
  defaultChartTypeForVariables,
  defaultVariablesForResolution,
} from '@/features/customGraphs/aggregation'
import type { CustomGraphFormState, MinuteArchiveObservation } from '@/features/customGraphs/types'
import type { ClimateDay, DailyNormal, MonthlyNormal } from '@/types/weather'

function makeMinuteObservation(
  observationTimeUtc: string,
  overrides: Partial<MinuteArchiveObservation> = {},
): MinuteArchiveObservation {
  return {
    observationTimeUtc,
    timestampMs: new Date(observationTimeUtc).valueOf(),
    temperatureC: 10,
    humidityPercent: 80,
    pressureHpa: 1000,
    windSpeedMph: 5,
    windGustMph: 10,
    rainRateMmPerHour: 0,
    rainTodayMm: 0,
    ...overrides,
  }
}

function makeClimateDay(date: string, overrides: Partial<ClimateDay> = {}): ClimateDay {
  return {
    date: date as ClimateDay['date'],
    maxTempC: 15,
    minTempC: 6,
    meanTempC: 10.5,
    rainfallMm: 1,
    status: 'finalised',
    ...overrides,
  }
}

const dailyNormals: DailyNormal[] = [
  {
    dateKey: '06-01',
    month: 6,
    day: 1,
    normalMaxTempC: 16,
    normalMinTempC: 7,
    normalMeanTempC: 11,
    maxSampleCount: 30,
    minSampleCount: 30,
  },
  {
    dateKey: '06-02',
    month: 6,
    day: 2,
    normalMaxTempC: 17,
    normalMinTempC: 8,
    normalMeanTempC: 12,
    maxSampleCount: 30,
    minSampleCount: 30,
  },
]

const monthlyNormals: MonthlyNormal[] = [
  { month: 5, meanMaxTempC: 16, meanMinTempC: 8, meanTempC: 12, rainfallMm: 50 },
  { month: 6, meanMaxTempC: 19, meanMinTempC: 10, meanTempC: 14.5, rainfallMm: 60 },
]

function formState(overrides: Partial<CustomGraphFormState> = {}): CustomGraphFormState {
  return {
    startDateTime: '2024-06-01T00:00',
    endDateTime: '2024-06-02T23:00',
    resolution: 'daily',
    variables: ['meanTempC'],
    aggregation: 'mean',
    chartType: 'line',
    comparisonMode: 'none',
    normalOverlay: false,
    runningMean: false,
    runningMeanWindow: 3,
    cumulativeRainfall: false,
    temperatureRangeShading: false,
    ...overrides,
  }
}

describe('custom graph aggregation', () => {
  it('keeps null gaps in hourly series', () => {
    const result = buildCustomGraphResult(
      formState({
        resolution: 'hourly',
        variables: ['temperatureC'],
        startDateTime: '2024-06-01T00:00',
        endDateTime: '2024-06-01T02:59',
      }),
      {
        minuteObservations: [
          makeMinuteObservation('2024-06-01T00:10:00Z', { temperatureC: 12 }),
          makeMinuteObservation('2024-06-01T02:10:00Z', { temperatureC: 14 }),
        ],
        climateRecords: [],
        dailyNormals: [],
        monthlyNormals: [],
      },
      {
        startMs: new Date('2024-06-01T00:00:00Z').valueOf(),
        endMs: new Date('2024-06-01T02:59:00Z').valueOf(),
      },
      null,
    )

    expect(result.series[0]?.points.map((point) => point.value)).toEqual([12, null, 14])
  })

  it('uses Europe/London hourly boundaries across DST changes', () => {
    const result = buildCustomGraphResult(
      formState({
        resolution: 'hourly',
        variables: ['temperatureC'],
        startDateTime: '2024-03-31T00:00',
        endDateTime: '2024-03-31T03:00',
      }),
      {
        minuteObservations: [
          makeMinuteObservation('2024-03-31T00:30:00Z', { temperatureC: 8 }),
          makeMinuteObservation('2024-03-31T01:30:00Z', { temperatureC: 10 }),
        ],
        climateRecords: [],
        dailyNormals: [],
        monthlyNormals: [],
      },
      {
        startMs: new Date('2024-03-31T00:00:00Z').valueOf(),
        endMs: new Date('2024-03-31T02:00:00Z').valueOf(),
      },
      null,
    )

    expect(result.series[0]?.points.map((point) => point.label)).toEqual([
      '31 Mar, 00:00',
      '31 Mar, 02:00',
      '31 Mar, 03:00',
    ])
  })

  it('accumulates rainfall from minute rain-today readings without treating gaps as zero', () => {
    const result = buildCustomGraphResult(
      formState({
        resolution: 'hourly',
        variables: ['rainfallMm'],
        aggregation: 'total',
        chartType: 'bar',
        cumulativeRainfall: true,
        startDateTime: '2024-06-01T00:00',
        endDateTime: '2024-06-01T01:59',
      }),
      {
        minuteObservations: [
          makeMinuteObservation('2024-06-01T00:05:00Z', { rainTodayMm: 0.2 }),
          makeMinuteObservation('2024-06-01T00:30:00Z', { rainTodayMm: 0.5 }),
          makeMinuteObservation('2024-06-01T01:10:00Z', { rainTodayMm: 1.0 }),
        ],
        climateRecords: [],
        dailyNormals: [],
        monthlyNormals: [],
      },
      {
        startMs: new Date('2024-06-01T00:00:00Z').valueOf(),
        endMs: new Date('2024-06-01T01:59:00Z').valueOf(),
      },
      null,
    )

    expect(result.series[0]?.points.map((point) => point.value)).toEqual([0.5, 1.0])
  })

  it('builds daily normal overlays and temperature shading', () => {
    const result = buildCustomGraphResult(
      formState({
        variables: ['maxTempC', 'minTempC'],
        resolution: 'daily',
        normalOverlay: true,
        temperatureRangeShading: true,
      }),
      {
        minuteObservations: [],
        climateRecords: [
          makeClimateDay('2024-06-01', { maxTempC: 20, minTempC: 10 }),
          makeClimateDay('2024-06-02', { maxTempC: 19, minTempC: null }),
        ],
        dailyNormals,
        monthlyNormals,
      },
      {
        startMs: new Date('2024-06-01T00:00:00Z').valueOf(),
        endMs: new Date('2024-06-02T23:00:00Z').valueOf(),
      },
      null,
    )

    expect(result.series.find((series) => series.id === 'maxTempC-normal')?.points[0]?.value).toBe(16)
    expect(result.temperatureRanges).toHaveLength(2)
    expect(result.temperatureRanges[0]?.points[1]?.min).toBeNull()
  })

  it('provides sensible defaults by resolution and variable mix', () => {
    expect(defaultVariablesForResolution('hourly')).toEqual(['temperatureC', 'rainfallMm'])
    expect(defaultChartTypeForVariables(['rainfallMm'])).toBe('bar')
    expect(defaultChartTypeForVariables(['maxTempC', 'minTempC'])).toBe('range')
  })
})
