import type { ClimateDateString, ClimateDay, DailyNormal, MonthlyNormal } from '@/types/weather'

export type CustomGraphResolution = 'minute' | 'hourly' | 'daily' | 'monthly' | 'annual'
export type CustomGraphAggregation = 'mean' | 'min' | 'max' | 'total'
export type CustomGraphChartType = 'line' | 'bar' | 'area' | 'range'
export type CustomGraphComparisonMode = 'none' | 'previous-period' | 'previous-year'

export type CustomGraphVariableKey =
  | 'temperatureC'
  | 'humidityPercent'
  | 'pressureHpa'
  | 'windSpeedMph'
  | 'windGustMph'
  | 'rainfallMm'
  | 'maxTempC'
  | 'minTempC'
  | 'meanTempC'

export type VariableGroup = 'temperature' | 'humidity' | 'pressure' | 'wind' | 'rainfall'

export interface VariableDefinition {
  readonly key: CustomGraphVariableKey
  readonly label: string
  readonly shortLabel: string
  readonly unit: string
  readonly group: VariableGroup
  readonly defaultChartType: CustomGraphChartType
  readonly supportedResolutions: readonly CustomGraphResolution[]
  readonly prefersBars?: boolean
  readonly isRainfall?: boolean
  readonly isTemperature?: boolean
}

export interface MinuteArchiveObservation {
  readonly observationTimeUtc: string
  readonly timestampMs: number
  readonly temperatureC: number | null
  readonly humidityPercent: number | null
  readonly pressureHpa: number | null
  readonly windSpeedMph: number | null
  readonly windGustMph: number | null
  readonly rainRateMmPerHour: number | null
  readonly rainTodayMm: number | null
}

export interface ParsedMinuteArchiveChunk {
  readonly observations: readonly MinuteArchiveObservation[]
  readonly malformedLineCount: number
  readonly processedLineCount: number
}

export interface ParsedMinuteArchiveResult extends ParsedMinuteArchiveChunk {
  readonly warningMessages: readonly string[]
}

export interface CustomGraphRequestRange {
  readonly startDateTime: string
  readonly endDateTime: string
}

export interface CustomGraphFormState extends CustomGraphRequestRange {
  readonly variables: readonly CustomGraphVariableKey[]
  readonly resolution: CustomGraphResolution
  readonly aggregation: CustomGraphAggregation
  readonly chartType: CustomGraphChartType
  readonly comparisonMode: CustomGraphComparisonMode
  readonly normalOverlay: boolean
  readonly runningMean: boolean
  readonly runningMeanWindow: number
  readonly cumulativeRainfall: boolean
  readonly temperatureRangeShading: boolean
}

export interface CustomGraphSeriesPoint {
  readonly timestamp: number
  readonly label: string
  readonly value: number | null
}

export interface CustomGraphSeries {
  readonly id: string
  readonly label: string
  readonly shortLabel: string
  readonly unit: string
  readonly group: VariableGroup
  readonly color: string
  readonly chartType: CustomGraphChartType
  readonly points: readonly CustomGraphSeriesPoint[]
  readonly dashed?: boolean
  readonly hidden?: boolean
}

export interface TemperatureRangeSeries {
  readonly id: string
  readonly label: string
  readonly color: string
  readonly points: readonly {
    timestamp: number
    label: string
    min: number | null
    max: number | null
  }[]
  readonly dashed?: boolean
}

export interface CustomGraphWarning {
  readonly code:
    | 'MINUTE_RANGE_LIMIT'
    | 'MALFORMED_LINES'
    | 'PARTIAL_SUCCESS'
    | 'CANCELLED'
    | 'NO_DATA'
    | 'INVALID_RANGE'
    | 'FILE_COUNT'
  readonly message: string
}

export interface CustomGraphResult {
  readonly series: readonly CustomGraphSeries[]
  readonly temperatureRanges: readonly TemperatureRangeSeries[]
  readonly summary: string
  readonly warnings: readonly CustomGraphWarning[]
  readonly fromMinuteArchive: boolean
  readonly observationCount: number
  readonly malformedLineCount: number
}

export interface CustomGraphDataContext {
  readonly minuteObservations: readonly MinuteArchiveObservation[]
  readonly climateRecords: readonly ClimateDay[]
  readonly dailyNormals: readonly DailyNormal[]
  readonly monthlyNormals: readonly MonthlyNormal[]
}

export interface CustomGraphRequestPlan {
  readonly primaryRange: {
    readonly startMs: number
    readonly endMs: number
  }
  readonly comparisonRange: {
    readonly startMs: number
    readonly endMs: number
  } | null
  readonly minuteArchiveDates: readonly ClimateDateString[]
  readonly comparisonMinuteArchiveDates: readonly ClimateDateString[]
  readonly annualYears: readonly number[]
  readonly comparisonAnnualYears: readonly number[]
  readonly minuteFileCountEstimate: number
  readonly usesMinuteArchive: boolean
}
