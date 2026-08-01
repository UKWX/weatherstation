export type ClimateDateString = `${number}-${number}-${number}`

export type IsoUtcTimestampString = string

export type NullableMeasurement = number | null

export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonObject | readonly JsonValue[]
export interface JsonObject {
  readonly [key: string]: JsonValue
}

export type MeteorologicalSeason = 'winter' | 'spring' | 'summer' | 'autumn'

export type ComparisonMode = 'season-vs-season' | 'same-period' | 'custom'

export type PeriodKind = 'monthly' | 'annual'

export type ClimateValueStatus =
  | 'finalised'
  | 'provisional'
  | 'incomplete'
  | 'unavailable'

export interface MeasurementUnits {
  temperature: '°C'
  rainfall: 'mm'
  pressure: 'hPa'
  wind: 'mph'
}

export interface CurrentConditions {
  observationTimeUtc: IsoUtcTimestampString | null
  observationTimeLocal: string | null
  fetchedAtUtc: IsoUtcTimestampString | null
  temperatureC: NullableMeasurement
  heatIndexC: NullableMeasurement
  windChillC: NullableMeasurement
  feelsLikeC: NullableMeasurement
  dewpointC: NullableMeasurement
  humidityPercent: NullableMeasurement
  pressureHpa: NullableMeasurement
  windSpeedKmh: NullableMeasurement
  windSpeedMph: NullableMeasurement
  windGustKmh: NullableMeasurement
  windGustMph: NullableMeasurement
  windDirectionDegrees: NullableMeasurement
  rainRateMmPerHour: NullableMeasurement
  rainTodayMm: NullableMeasurement
  solarRadiationWm2: NullableMeasurement
  uvIndex: NullableMeasurement
}

export interface StationStatus {
  status: string
  collectorStatus: string | null
  message: string | null
  checkedAtUtc: IsoUtcTimestampString | null
  observationTimeUtc: IsoUtcTimestampString | null
  live: boolean
  online: boolean
  observationAgeSeconds: number | null
}

export interface RecentObservation {
  observationTimeUtc: IsoUtcTimestampString
  observationTimeLocal: string | null
  temperatureC: NullableMeasurement
  dewpointC: NullableMeasurement
  heatIndexC: NullableMeasurement
  windChillC: NullableMeasurement
  humidityPercent: NullableMeasurement
  pressureHpa: NullableMeasurement
  windSpeedKmh: NullableMeasurement
  windSpeedMph: NullableMeasurement
  windGustKmh: NullableMeasurement
  windGustMph: NullableMeasurement
  windDirectionDegrees: NullableMeasurement
  rainRateMmPerHour: NullableMeasurement
  rainTodayMm: NullableMeasurement
  solarRadiationWm2: NullableMeasurement
  uvIndex: NullableMeasurement
}

export interface RecentObservationsPayload {
  metadata: JsonObject
  observations: readonly RecentObservation[]
}

export interface TodayMeasurementWindow {
  windowStartLocal: string | null
  windowEndLocal: string | null
  provisional: boolean | null
  timeLocal: string | null
  coverage: JsonObject | null
}

export interface TodayTemperatureSummary extends TodayMeasurementWindow {
  value: NullableMeasurement
}

export interface TodayRainfallSummary extends TodayMeasurementWindow {
  totalMm: NullableMeasurement
}

export interface CalendarDayExtreme {
  value: JsonValue
  timeLocal: string | null
  provisional: boolean | null
  coverage: JsonObject | null
  details: JsonObject
}

export interface ProvisionalTodaySummary {
  metadata: JsonObject
  currentObservation: CurrentConditions | null
  maximumTemperature: TodayTemperatureSummary | null
  minimumTemperature: TodayTemperatureSummary | null
  rainfall: TodayRainfallSummary | null
  calendarDayExtremes: Record<string, CalendarDayExtreme>
}

export interface ClimateIndexHistory {
  firstDate: ClimateDateString | null
  lastDate: ClimateDateString | null
  firstYear: number | null
  lastYear: number | null
  yearCount: number | null
}

export interface ClimateStationIdentity {
  id: string
  name: string
  country: string
}

export interface ClimateIndex {
  status: string | null
  station: ClimateStationIdentity
  generatedAtUtc: IsoUtcTimestampString | null
  history: ClimateIndexHistory
  normals: JsonObject
  dataQuality: JsonObject
  endpoints: JsonObject
}

export interface ArchiveIndexYear {
  year: number
  startDate: ClimateDateString | null
  endDate: ClimateDateString | null
  observationCount: number | null
  complete: boolean | null
}

export interface ArchiveIndex {
  station: string
  generatedAtUtc: IsoUtcTimestampString | null
  years: readonly ArchiveIndexYear[]
}

export interface ClimateDay {
  date: ClimateDateString
  maxTempC: NullableMeasurement
  minTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  rainfallMm: NullableMeasurement
  status: ClimateValueStatus
}

export interface DailyNormal {
  dateKey: string
  month: number
  day: number
  normalMaxTempC: NullableMeasurement
  normalMinTempC: NullableMeasurement
  normalMeanTempC: NullableMeasurement
  maxSampleCount: number
  minSampleCount: number
  baseline: string
}

export interface MonthlyNormal {
  month: number
  meanMaxTempC: NullableMeasurement
  meanMinTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  rainfallMm: NullableMeasurement
}

export interface DailyNormalsPayload {
  station: string
  generatedAtUtc: IsoUtcTimestampString | null
  baseline: string
  units: {
    temperature: string
  }
  recordCount: number
  records: readonly DailyNormal[]
}

export interface MonthlyNormalsPayload {
  station: string
  generatedAtUtc: IsoUtcTimestampString | null
  baseline: string
  units: {
    temperature: string
    rainfall: string
  }
  monthCount: number
  months: readonly MonthlyNormal[]
}

export interface ObservationCounts {
  valid: number
  missing: number
  unavailable: number
}

export interface MetricCoverage extends ObservationCounts {
  availableDays: number
  complete: boolean
}

export interface PeriodCoverage {
  startDate: ClimateDateString
  endDate: ClimateDateString
  expectedDays: number
  provisional: boolean
  maxTemperature: MetricCoverage
  minTemperature: MetricCoverage
  meanTemperature: MetricCoverage
  rainfall: MetricCoverage
}

export interface TiedDatesMetric {
  value: NullableMeasurement
  dates: readonly ClimateDateString[]
}

export interface MonthlySummary {
  year: number
  month: number
  highestMax: TiedDatesMetric
  lowestMin: TiedDatesMetric
  meanMaxTempC: NullableMeasurement
  meanMinTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  meanMaxTempAnomalyC: NullableMeasurement
  meanMinTempAnomalyC: NullableMeasurement
  meanTempAnomalyC: NullableMeasurement
  rainfallTotalMm: NullableMeasurement
  rainfallPercentageOfNormal: NullableMeasurement
  rainfallDifferenceFromNormalMm: NullableMeasurement
  rainDays: number
  wettestDay: TiedDatesMetric
  coverage: PeriodCoverage
}

export interface AnnualSummary {
  year: number
  highestMax: TiedDatesMetric
  lowestMin: TiedDatesMetric
  meanMaxTempC: NullableMeasurement
  meanMinTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  meanMaxTempAnomalyC: NullableMeasurement
  meanMinTempAnomalyC: NullableMeasurement
  meanTempAnomalyC: NullableMeasurement
  rainfallTotalMm: NullableMeasurement
  rainfallPercentageOfNormal: NullableMeasurement
  rainfallDifferenceFromNormalMm: NullableMeasurement
  rainDays: number
  wettestDay: TiedDatesMetric
  coverage: PeriodCoverage
  monthlySummaries: readonly MonthlySummary[]
}

export interface AnnualClimatePayload {
  station: string
  year: number
  generatedAtUtc: IsoUtcTimestampString | null
  complete: boolean
  through: ClimateDateString | null
  observationCount: number | null
  units: {
    temperature: string
    rainfall: string
    pressure: string | null
    wind: string | null
  }
  records: readonly ClimateDay[]
}

export interface RecordHolder {
  date: ClimateDateString
  year: number
  label: string
}

export interface RecordEntry {
  metric: string
  value: NullableMeasurement
  holders: readonly RecordHolder[]
}

export interface ComparisonPeriod {
  label: string
  startDate: ClimateDateString
  endDate: ClimateDateString
  season: MeteorologicalSeason | null
}

export interface ComparisonSelection {
  mode: ComparisonMode
  left: ComparisonPeriod
  right: ComparisonPeriod
}

export interface ComparisonPeriodResult {
  selection: ComparisonPeriod
  meanMaxTempC: NullableMeasurement
  meanMinTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  highestMax: TiedDatesMetric
  lowestMin: TiedDatesMetric
  rainfallTotalMm: NullableMeasurement
  rainfallPercentageOfNormal: NullableMeasurement
  rainfallDifferenceFromNormalMm: NullableMeasurement
  rainDays: number
  wettestDay: TiedDatesMetric
  temperatureAnomalyC: NullableMeasurement
  coverage: PeriodCoverage
}

export interface ComparisonResult {
  selection: ComparisonSelection
  left: ComparisonPeriodResult
  right: ComparisonPeriodResult
  meanTempDifferenceC: NullableMeasurement
  rainfallDifferenceMm: NullableMeasurement
  rainfallPercentageDifference: NullableMeasurement
}

export interface MonthlyReportData {
  kind: 'monthly'
  title: string
  generatedAtUtc: IsoUtcTimestampString | null
  summary: MonthlySummary
  records: readonly RecordEntry[]
}

export interface AnnualReportData {
  kind: 'annual'
  title: string
  generatedAtUtc: IsoUtcTimestampString | null
  summary: AnnualSummary
  records: readonly RecordEntry[]
}

export type ReportData = MonthlyReportData | AnnualReportData

export interface AdminDailyRecord {
  date: ClimateDateString
  year: number
  month: number
  day: number
  maxTempC: NullableMeasurement
  minTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  rainfallMm: NullableMeasurement
  temperatureSource: string | null
  rainfallSource: string | null
}

export interface AuditEntry {
  id: number
  action: string
  climateDate: ClimateDateString
  adminUserId: string | null
  reason: string
  createdAtUtc: IsoUtcTimestampString
  revertedAtUtc: IsoUtcTimestampString | null
  revertedByUserId: string | null
  relatedAuditId: number | null
  previousRecord: AdminDailyRecord | null
  newRecord: AdminDailyRecord | null
}

export interface StructuredApiError {
  status: number
  message: string
  code: string | null
  details: Record<string, unknown> | null
}
