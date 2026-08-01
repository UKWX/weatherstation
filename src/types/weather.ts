export type ClimateDateString = `${number}-${number}-${number}`

export type IsoUtcTimestampString = string

export type NullableMeasurement = number | null

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
  observedAtUtc: IsoUtcTimestampString | null
  temperatureC: NullableMeasurement
  feelsLikeC: NullableMeasurement
  dewPointC: NullableMeasurement
  humidityPct: NullableMeasurement
  pressureHpa: NullableMeasurement
  windSpeedMph: NullableMeasurement
  windGustMph: NullableMeasurement
  windDirectionDegrees: NullableMeasurement
  rainRateMmPerHour: NullableMeasurement
  rainfallTodayMm: NullableMeasurement
}

export interface StationStatus {
  online: boolean
  observedAtUtc: IsoUtcTimestampString | null
  observationAgeSeconds: number | null
  lastSuccessfulUpdateUtc: IsoUtcTimestampString | null
  isStale: boolean
}

export interface RecentObservation {
  observedAtUtc: IsoUtcTimestampString
  temperatureC: NullableMeasurement
  pressureHpa: NullableMeasurement
  rainRateMmPerHour: NullableMeasurement
  rainfallTodayMm: NullableMeasurement
}

export interface ProvisionalTodaySummary {
  climateDate: ClimateDateString
  maxTempC: NullableMeasurement
  minTempC: NullableMeasurement
  rainfallMm: NullableMeasurement
  officialWindows: {
    maxTemperature: string
    minTemperature: string
    rainfall: string
  }
}

export interface DataSeriesCoverage {
  startDate: ClimateDateString
  endDate: ClimateDateString | null
  latestCompleteYear: number | null
}

export interface ClimateIndex {
  station: string
  generatedAtUtc: IsoUtcTimestampString | null
  latestAvailableDate: ClimateDateString | null
  latestAvailableYear: number | null
  temperatureCoverage: DataSeriesCoverage
  rainfallCoverage: DataSeriesCoverage
}

export interface ArchiveIndexYear {
  year: number
  startDate: ClimateDateString | null
  endDate: ClimateDateString | null
  observationCount: number | null
  complete: boolean
  rainfallComplete: boolean
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
  date: ClimateDateString
  month: number
  day: number
  maxTempC: NullableMeasurement
  minTempC: NullableMeasurement
  meanTempC: NullableMeasurement
}

export interface MonthlyNormal {
  month: number
  meanMaxTempC: NullableMeasurement
  meanMinTempC: NullableMeasurement
  meanTempC: NullableMeasurement
  rainfallMm: NullableMeasurement
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
  units: MeasurementUnits
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
