import {
  MONTHLY_NORMAL_BASELINE,
  RAIN_DAY_THRESHOLD_MM,
  RAINFALL_START_DATE,
  WEATHER_UNITS,
} from '@/config/weather'
import {
  buildAnnualSummary,
  buildMonthlySummary,
  isRainfallAvailableForMonth,
  isRainfallAvailableForYear,
} from '@/features/climateArchive/calculations'
import { buildRecordsIndex } from '@/features/records/analysis'
import {
  getAnnualRankings,
  getMonthlyRankings,
} from '@/features/records/calculations'
import {
  calculateColdStreak,
  calculateDryStreak,
  calculateSafeTotal,
  calculateThresholdCounts,
  calculateWarmStreak,
  calculateWetStreak,
  collectTiedValues,
  formatEuropeLondonDisplay,
} from '@/lib/climate'
import type {
  AnnualClimatePayload,
  ClimateDateString,
  ClimateDay,
  MonthlyNormal,
} from '@/types/weather'

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const

export interface RankingSummary {
  rank: number | null
  totalEligible: number
  tied: boolean
  label: string
}

export interface ThresholdSummary {
  atOrAbove20C: number
  atOrAbove25C: number
  atOrAbove30C: number
  frostDays: number
  rainDays: number
  heavyRainDays: number
}

export interface LongestSpellSummary {
  label: string
  length: number
  startDate: ClimateDateString | null
  endDate: ClimateDateString | null
}

export interface MonthlyReportModel {
  kind: 'monthly'
  year: number
  month: number
  monthName: string
  baselineLabel: string
  tMax: { value: number | null; dates: readonly ClimateDateString[] }
  tMin: { value: number | null; dates: readonly ClimateDateString[] }
  tMean: { value: number | null; anomaly: number | null }
  meanMax: { value: number | null; anomaly: number | null }
  meanMin: { value: number | null; anomaly: number | null }
  rainfallTotalMm: number | null
  rainfallNormalMm: number | null
  rainfallPercentage: number | null
  rainDays: number
  wettestDay: { value: number | null; dates: readonly ClimateDateString[] }
  yearToDateRainfallMm: number | null
  expectedYearToDateRainfallMm: number | null
  temperatureRanking: RankingSummary
  rainfallRanking: RankingSummary | null
  recordsSetOrTied: readonly string[]
  counts: {
    temperatureValidDays: number
    rainfallValidDays: number
    expectedDays: number
    temperatureMissingDays: number
    rainfallMissingDays: number
  }
  provisional: boolean
  complete: boolean
  summaryText: string
  compactText: string
}

export interface AnnualReportModel {
  kind: 'annual'
  year: number
  baselineLabel: string
  meanMax: { value: number | null; anomaly: number | null }
  meanMin: { value: number | null; anomaly: number | null }
  meanTemp: { value: number | null; anomaly: number | null }
  highestMax: { value: number | null; dates: readonly ClimateDateString[] }
  lowestMin: { value: number | null; dates: readonly ClimateDateString[] }
  rainfallTotalMm: number | null
  rainfallPercentage: number | null
  rainDays: number
  wettestDay: { value: number | null; dates: readonly ClimateDateString[] }
  monthlyBreakdown: ReturnType<typeof buildAnnualSummary>['monthlySummaries']
  annualTemperatureRanking: RankingSummary
  annualRainfallRanking: RankingSummary | null
  thresholds: ThresholdSummary
  longestSpells: readonly LongestSpellSummary[]
  recordsSetOrTied: readonly string[]
  completenessStatement: string
  provisional: boolean
  complete: boolean
  summaryText: string
  compactText: string
}

export function buildMonthlyReportModel(input: {
  year: number
  month: number
  selectedYearPayload: AnnualClimatePayload
  comparablePayloads: readonly AnnualClimatePayload[]
  monthlyNormals: readonly MonthlyNormal[]
}): MonthlyReportModel {
  const { year, month, selectedYearPayload, comparablePayloads, monthlyNormals } = input
  const monthName = MONTH_NAMES[month - 1] ?? String(month)
  const monthNormal = monthlyNormals.find((normal) => normal.month === month) ?? null
  const summary = buildMonthlySummary(
    year,
    month,
    selectedYearPayload.records,
    monthNormal,
  )
  const recordsIndex = buildRecordsIndex(comparablePayloads, monthlyNormals)
  const tempRankings = getMonthlyRankings(recordsIndex, 'mean-temp', {
    monthFilter: month,
    yearFrom: null,
    yearTo: null,
    requireComplete: true,
  })
  const rainRankings = getMonthlyRankings(recordsIndex, 'rainfall', {
    monthFilter: month,
    yearFrom: null,
    yearTo: null,
    requireComplete: true,
  })

  const monthRecords = selectedYearPayload.records.filter((record) => {
    const [recordYear, recordMonth] = record.date.split('-').map(Number)
    return recordYear === year && recordMonth === month
  })
  const tMax = toTiedMetric(collectTiedValues(monthRecords, (record) => record.maxTempC, 'max'))
  const tMin = toTiedMetric(collectTiedValues(monthRecords, (record) => record.minTempC, 'min'))
  const rainfallAvailable = isRainfallAvailableForMonth(year, month)
  const yearRainfallComplete = isRainfallAvailableForYear(year)
  const ytdRecords = selectedYearPayload.records.filter((record) => {
    const [recordYear, recordMonth] = record.date.split('-').map(Number)
    return recordYear === year && recordMonth <= month
  })
  const ytdRainValues = ytdRecords
    .filter((record) => record.rainfallMm != null)
    .map((record) => record.rainfallMm)
  const yearToDateRainfallMm =
    rainfallAvailable && ytdRainValues.length > 0
      ? calculateSafeTotal(ytdRainValues)
      : null
  const expectedYearToDateRainfallMm = yearRainfallComplete
    ? calculateSafeTotal(
        monthlyNormals
          .filter((normal) => normal.month <= month)
          .map((normal) => normal.rainfallMm),
      )
    : null
  const temperatureRanking = buildRankingSummary(
    tempRankings.map((entry) => ({
      year: entry.year,
      rank: entry.rank,
      value: entry.value,
    })),
    year,
  )
  const rainfallRanking =
    rainfallAvailable &&
    summary.coverage.rainfall.complete &&
    rainRankings.length > 0
      ? buildRankingSummary(
          rainRankings.map((entry) => ({
            year: entry.year,
            rank: entry.rank,
            value: entry.value,
          })),
          year,
        )
      : null
  const recordsSetOrTied = buildMonthlyRecordNotes({
    summary,
    tMax,
    tMin,
    wettest: summary.wettestDay,
    temperatureRanking,
    rainfallRanking,
    allRecords: comparablePayloads.flatMap((payload) => payload.records),
  })
  const complete =
    !summary.coverage.provisional &&
    summary.coverage.maxTemperature.complete &&
    (!rainfallAvailable || summary.coverage.rainfall.complete)
  const counts = {
    temperatureValidDays: summary.coverage.maxTemperature.valid,
    rainfallValidDays: summary.coverage.rainfall.valid,
    expectedDays: summary.coverage.expectedDays,
    temperatureMissingDays: summary.coverage.maxTemperature.missing,
    rainfallMissingDays: summary.coverage.rainfall.missing,
  }
  const summaryText = buildMonthlyNarrativeText({
    monthName,
    year,
    tMax,
    tMin,
    meanTempC: summary.meanTempC,
    meanTempAnomalyC: summary.meanTempAnomalyC,
    rainfallTotalMm: summary.rainfallTotalMm,
    rainfallPercentage: summary.rainfallPercentageOfNormal,
    rainDays: summary.rainDays,
    provisional: summary.coverage.provisional,
    complete,
    counts,
  })

  const compactText = buildMonthlyCompactText({
    monthName,
    year,
    tMax,
    tMin,
    meanTempC: summary.meanTempC,
    meanTempAnomalyC: summary.meanTempAnomalyC,
    meanMaxTempC: summary.meanMaxTempC,
    meanMaxAnomalyC: summary.meanMaxTempAnomalyC,
    meanMinTempC: summary.meanMinTempC,
    meanMinAnomalyC: summary.meanMinTempAnomalyC,
    rainfallTotalMm: summary.rainfallTotalMm,
    rainfallPercentage: summary.rainfallPercentageOfNormal,
    rainDays: summary.rainDays,
    wettestDay: summary.wettestDay,
    yearToDateRainfallMm,
  })

  return {
    kind: 'monthly',
    year,
    month,
    monthName,
    baselineLabel: MONTHLY_NORMAL_BASELINE,
    tMax,
    tMin,
    tMean: { value: summary.meanTempC, anomaly: summary.meanTempAnomalyC },
    meanMax: { value: summary.meanMaxTempC, anomaly: summary.meanMaxTempAnomalyC },
    meanMin: { value: summary.meanMinTempC, anomaly: summary.meanMinTempAnomalyC },
    rainfallTotalMm: rainfallAvailable ? summary.rainfallTotalMm : null,
    rainfallNormalMm: rainfallAvailable ? (monthNormal?.rainfallMm ?? null) : null,
    rainfallPercentage: rainfallAvailable ? summary.rainfallPercentageOfNormal : null,
    rainDays: rainfallAvailable ? summary.rainDays : 0,
    wettestDay: rainfallAvailable
      ? summary.wettestDay
      : { value: null, dates: [] },
    yearToDateRainfallMm,
    expectedYearToDateRainfallMm,
    temperatureRanking,
    rainfallRanking,
    recordsSetOrTied,
    counts,
    provisional: summary.coverage.provisional,
    complete,
    summaryText,
    compactText,
  }
}

export function buildAnnualReportModel(input: {
  year: number
  selectedYearPayload: AnnualClimatePayload
  comparablePayloads: readonly AnnualClimatePayload[]
  monthlyNormals: readonly MonthlyNormal[]
}): AnnualReportModel {
  const { year, selectedYearPayload, comparablePayloads, monthlyNormals } = input
  const summary = buildAnnualSummary(year, selectedYearPayload.records, monthlyNormals)
  const recordsIndex = buildRecordsIndex(comparablePayloads, monthlyNormals)
  const annualTempRankings = getAnnualRankings(recordsIndex, 'mean-temp')
  const annualRainRankings = getAnnualRankings(recordsIndex, 'rainfall')
  const annualTemperatureRanking = buildRankingSummary(
    annualTempRankings.map((entry) => ({
      year: entry.year,
      rank: entry.rank,
      value: entry.value,
    })),
    year,
  )
  const annualRainfallRanking =
    isRainfallAvailableForYear(year) &&
    summary.coverage.rainfall.complete &&
    annualRainRankings.length > 0
      ? buildRankingSummary(
          annualRainRankings.map((entry) => ({
            year: entry.year,
            rank: entry.rank,
            value: entry.value,
          })),
          year,
        )
      : null
  const thresholds = calculateThresholdCounts(selectedYearPayload.records, 10)
  const longestSpells: readonly LongestSpellSummary[] = [
    toSpellSummary('Longest dry spell', calculateDryStreak(selectedYearPayload.records)),
    toSpellSummary('Longest wet spell', calculateWetStreak(selectedYearPayload.records)),
    toSpellSummary('Longest warm spell (≥20°C)', calculateWarmStreak(selectedYearPayload.records, 20)),
    toSpellSummary('Longest frost spell (<0°C min)', calculateColdStreak(selectedYearPayload.records, 0)),
  ]
  const recordsSetOrTied = buildAnnualRecordNotes({
    summary,
    annualTemperatureRanking,
    annualRainfallRanking,
    allRecords: comparablePayloads.flatMap((payload) => payload.records),
  })
  const complete =
    !summary.coverage.provisional &&
    summary.coverage.maxTemperature.complete &&
    (!isRainfallAvailableForYear(year) || summary.coverage.rainfall.complete)
  const completenessStatement = [
    summary.coverage.provisional ? 'Provisional year.' : 'Closed year.',
    `Temperature coverage ${summary.coverage.maxTemperature.valid}/${summary.coverage.expectedDays} valid days.`,
    isRainfallAvailableForYear(year)
      ? `Rainfall coverage ${summary.coverage.rainfall.valid}/${summary.coverage.rainfall.availableDays} valid days (${summary.coverage.rainfall.missing} missing).`
      : 'Rainfall is not fully comparable because annual rainfall records start in May 2020.',
  ].join(' ')
  const summaryText = [
    `${year} annual report.`,
    `Mean temperature ${formatSignedMeasurement(summary.meanTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(summary.meanTempAnomalyC)} vs ${MONTHLY_NORMAL_BASELINE}).`,
    `Rainfall ${formatMeasurement(summary.rainfallTotalMm, WEATHER_UNITS.rainfall)}${summary.rainfallPercentageOfNormal == null ? '' : ` (${summary.rainfallPercentageOfNormal.toFixed(1)}% of normal)`}.`,
    summary.coverage.provisional ? 'Year remains provisional.' : 'Year is not provisional.',
    complete ? 'Coverage is complete.' : 'Coverage is not complete.',
  ].join(' ')
  const compactText = buildAnnualCompactText({
    year,
    summary,
    temperatureRank: annualTemperatureRanking,
    rainfallRank: annualRainfallRanking,
    thresholds,
  })

  return {
    kind: 'annual',
    year,
    baselineLabel: MONTHLY_NORMAL_BASELINE,
    meanMax: { value: summary.meanMaxTempC, anomaly: summary.meanMaxTempAnomalyC },
    meanMin: { value: summary.meanMinTempC, anomaly: summary.meanMinTempAnomalyC },
    meanTemp: { value: summary.meanTempC, anomaly: summary.meanTempAnomalyC },
    highestMax: summary.highestMax,
    lowestMin: summary.lowestMin,
    rainfallTotalMm: summary.rainfallTotalMm,
    rainfallPercentage: summary.rainfallPercentageOfNormal,
    rainDays: summary.rainDays,
    wettestDay: summary.wettestDay,
    monthlyBreakdown: summary.monthlySummaries,
    annualTemperatureRanking,
    annualRainfallRanking,
    thresholds,
    longestSpells,
    recordsSetOrTied,
    completenessStatement,
    provisional: summary.coverage.provisional,
    complete,
    summaryText,
    compactText,
  }
}

export function buildMonthlyReportCsv(report: MonthlyReportModel): string {
  const rows = [
    ['Type', 'Monthly report'],
    ['Period', `${report.monthName} ${report.year}`],
    ['TMax (°C)', toCsvValue(report.tMax.value)],
    ['TMax dates', report.tMax.dates.join('; ')],
    ['TMin (°C)', toCsvValue(report.tMin.value)],
    ['TMin dates', report.tMin.dates.join('; ')],
    ['TMean (°C)', toCsvValue(report.tMean.value)],
    ['TMean anomaly (°C)', toCsvValue(report.tMean.anomaly)],
    ['Mean max (°C)', toCsvValue(report.meanMax.value)],
    ['Mean min (°C)', toCsvValue(report.meanMin.value)],
    ['Rainfall total (mm)', toCsvValue(report.rainfallTotalMm)],
    ['Rainfall normal (mm)', toCsvValue(report.rainfallNormalMm)],
    ['Rainfall %', toCsvValue(report.rainfallPercentage)],
    ['Rain days >0.1 mm', String(report.rainDays)],
    ['Wettest day (mm)', toCsvValue(report.wettestDay.value)],
    ['Wettest day dates', report.wettestDay.dates.join('; ')],
    ['YTD rainfall (mm)', toCsvValue(report.yearToDateRainfallMm)],
    ['Expected YTD rainfall (mm)', toCsvValue(report.expectedYearToDateRainfallMm)],
    ['Temperature ranking', report.temperatureRanking.label],
    ['Rainfall ranking', report.rainfallRanking?.label ?? 'Not ranked'],
    ['Temperature valid days', String(report.counts.temperatureValidDays)],
    ['Rainfall valid days', String(report.counts.rainfallValidDays)],
    ['Expected days', String(report.counts.expectedDays)],
    ['Temperature missing days', String(report.counts.temperatureMissingDays)],
    ['Rainfall missing days', String(report.counts.rainfallMissingDays)],
    ['Provisional', String(report.provisional)],
    ['Complete', String(report.complete)],
  ]
  return rows.map((row) => row.map(csvEscape).join(',')).join('\r\n')
}

export function buildAnnualReportCsv(report: AnnualReportModel): string {
  const headerRows = [
    ['Type', 'Annual report'],
    ['Year', String(report.year)],
    ['Annual mean max (°C)', toCsvValue(report.meanMax.value)],
    ['Annual mean min (°C)', toCsvValue(report.meanMin.value)],
    ['Annual mean temperature (°C)', toCsvValue(report.meanTemp.value)],
    ['Temperature anomaly (°C)', toCsvValue(report.meanTemp.anomaly)],
    ['Highest max (°C)', toCsvValue(report.highestMax.value)],
    ['Highest max dates', report.highestMax.dates.join('; ')],
    ['Lowest min (°C)', toCsvValue(report.lowestMin.value)],
    ['Lowest min dates', report.lowestMin.dates.join('; ')],
    ['Annual rainfall (mm)', toCsvValue(report.rainfallTotalMm)],
    ['Rainfall % normal', toCsvValue(report.rainfallPercentage)],
    ['Rain days >0.1 mm', String(report.rainDays)],
    ['Wettest day (mm)', toCsvValue(report.wettestDay.value)],
    ['Wettest day dates', report.wettestDay.dates.join('; ')],
    ['Annual temperature ranking', report.annualTemperatureRanking.label],
    ['Annual rainfall ranking', report.annualRainfallRanking?.label ?? 'Not ranked'],
    ['Provisional', String(report.provisional)],
    ['Complete', String(report.complete)],
    ['Completeness statement', report.completenessStatement],
    [],
    ['Month', 'Mean max (°C)', 'Mean min (°C)', 'Mean temp (°C)', 'Rainfall (mm)', 'Rain days'],
  ]
  const monthlyRows = report.monthlyBreakdown.map((monthSummary) => {
    const monthName = MONTH_NAMES[monthSummary.month - 1] ?? String(monthSummary.month)
    const rainfallValue =
      isRainfallAvailableForMonth(report.year, monthSummary.month)
        ? toCsvValue(monthSummary.rainfallTotalMm)
        : 'Unavailable'
    return [
      monthName,
      toCsvValue(monthSummary.meanMaxTempC),
      toCsvValue(monthSummary.meanMinTempC),
      toCsvValue(monthSummary.meanTempC),
      rainfallValue,
      String(monthSummary.rainDays),
    ]
  })
  return [...headerRows, ...monthlyRows]
    .map((row) => row.map(csvEscape).join(','))
    .join('\r\n')
}

function buildMonthlyRecordNotes(input: {
  summary: ReturnType<typeof buildMonthlySummary>
  tMax: { value: number | null; dates: readonly ClimateDateString[] }
  tMin: { value: number | null; dates: readonly ClimateDateString[] }
  wettest: { value: number | null; dates: readonly ClimateDateString[] }
  temperatureRanking: RankingSummary
  rainfallRanking: RankingSummary | null
  allRecords: readonly ClimateDay[]
}): readonly string[] {
  const notes: string[] = []
  const maxRecord = collectTiedValues(input.allRecords, (record) => record.maxTempC, 'max')
  if (maxRecord != null && input.tMax.value != null && input.tMax.value === maxRecord.value) {
    notes.push('TMax set or tied the station daily maximum record.')
  }
  const minRecord = collectTiedValues(input.allRecords, (record) => record.minTempC, 'min')
  if (minRecord != null && input.tMin.value != null && input.tMin.value === minRecord.value) {
    notes.push('TMin set or tied the station daily minimum record.')
  }
  const wettestRecord = collectTiedValues(
    input.allRecords.filter((record) => record.date >= RAINFALL_START_DATE),
    (record) => record.rainfallMm,
    'max',
  )
  if (
    wettestRecord != null &&
    input.wettest.value != null &&
    input.wettest.value === wettestRecord.value
  ) {
    notes.push('Wettest day set or tied the station daily rainfall record.')
  }
  if (input.temperatureRanking.rank === 1) {
    notes.push(
      input.temperatureRanking.tied
        ? 'Monthly mean temperature tied the warmest rank for this calendar month.'
        : 'Monthly mean temperature set the warmest rank for this calendar month.',
    )
  }
  if (input.rainfallRanking?.rank === 1) {
    notes.push(
      input.rainfallRanking.tied
        ? 'Monthly rainfall tied the wettest rank for this calendar month.'
        : 'Monthly rainfall set the wettest rank for this calendar month.',
    )
  }
  return notes.length > 0
    ? notes
    : ['No station records were set or tied in this reporting period.']
}

function buildAnnualRecordNotes(input: {
  summary: ReturnType<typeof buildAnnualSummary>
  annualTemperatureRanking: RankingSummary
  annualRainfallRanking: RankingSummary | null
  allRecords: readonly ClimateDay[]
}): readonly string[] {
  const notes: string[] = []
  const maxRecord = collectTiedValues(input.allRecords, (record) => record.maxTempC, 'max')
  if (maxRecord != null && input.summary.highestMax.value === maxRecord.value) {
    notes.push('Annual highest maximum matched the station daily maximum record.')
  }
  const minRecord = collectTiedValues(input.allRecords, (record) => record.minTempC, 'min')
  if (minRecord != null && input.summary.lowestMin.value === minRecord.value) {
    notes.push('Annual lowest minimum matched the station daily minimum record.')
  }
  if (input.annualTemperatureRanking.rank === 1) {
    notes.push(
      input.annualTemperatureRanking.tied
        ? 'Annual mean temperature tied the warmest annual ranking.'
        : 'Annual mean temperature set the warmest annual ranking.',
    )
  }
  if (input.annualRainfallRanking?.rank === 1) {
    notes.push(
      input.annualRainfallRanking.tied
        ? 'Annual rainfall tied the wettest annual ranking.'
        : 'Annual rainfall set the wettest annual ranking.',
    )
  }
  return notes.length > 0
    ? notes
    : ['No station records were set or tied in this reporting period.']
}

function buildMonthlyNarrativeText(input: {
  monthName: string
  year: number
  tMax: { value: number | null; dates: readonly ClimateDateString[] }
  tMin: { value: number | null; dates: readonly ClimateDateString[] }
  meanTempC: number | null
  meanTempAnomalyC: number | null
  rainfallTotalMm: number | null
  rainfallPercentage: number | null
  rainDays: number
  provisional: boolean
  complete: boolean
  counts: MonthlyReportModel['counts']
}): string {
  return [
    `${input.monthName} ${input.year} monthly report.`,
    `TMax ${formatMeasurement(input.tMax.value, WEATHER_UNITS.temperature)}; TMin ${formatMeasurement(input.tMin.value, WEATHER_UNITS.temperature)}.`,
    `Mean temperature ${formatMeasurement(input.meanTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.meanTempAnomalyC)} vs ${MONTHLY_NORMAL_BASELINE}).`,
    `Rainfall ${formatMeasurement(input.rainfallTotalMm, WEATHER_UNITS.rainfall)}${input.rainfallPercentage == null ? '' : ` (${input.rainfallPercentage.toFixed(1)}% of normal)`}; rain days above ${RAIN_DAY_THRESHOLD_MM} mm: ${input.rainDays}.`,
    `Coverage ${input.counts.temperatureValidDays}/${input.counts.expectedDays} temperature days valid and ${input.counts.rainfallValidDays} rainfall days valid.`,
    input.provisional ? 'Report is provisional.' : 'Report is not provisional.',
    input.complete ? 'Coverage is complete.' : 'Coverage is not complete.',
  ].join(' ')
}

function buildMonthlyCompactText(input: {
  monthName: string
  year: number
  tMax: { value: number | null; dates: readonly ClimateDateString[] }
  tMin: { value: number | null; dates: readonly ClimateDateString[] }
  meanTempC: number | null
  meanTempAnomalyC: number | null
  meanMaxTempC: number | null
  meanMaxAnomalyC: number | null
  meanMinTempC: number | null
  meanMinAnomalyC: number | null
  rainfallTotalMm: number | null
  rainfallPercentage: number | null
  rainDays: number
  wettestDay: { value: number | null; dates: readonly ClimateDateString[] }
  yearToDateRainfallMm: number | null
}): string {
  return [
    `${input.monthName} ${input.year}`,
    `TMax ${formatMeasurement(input.tMax.value, WEATHER_UNITS.temperature)}${formatDateListSuffix(input.tMax.dates)}`,
    `TMin ${formatMeasurement(input.tMin.value, WEATHER_UNITS.temperature)}${formatDateListSuffix(input.tMin.dates)}`,
    `TMean ${formatMeasurement(input.meanTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.meanTempAnomalyC)} avg)`,
    `Mean max ${formatMeasurement(input.meanMaxTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.meanMaxAnomalyC)} avg)`,
    `Mean min ${formatMeasurement(input.meanMinTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.meanMinAnomalyC)} avg)`,
    `Rainfall ${formatMeasurement(input.rainfallTotalMm, WEATHER_UNITS.rainfall)}${input.rainfallPercentage == null ? '' : ` (${input.rainfallPercentage.toFixed(1)}% avg)`}`,
    `Rain days (>0.1 mm) ${input.rainDays}`,
    `Wettest day ${formatMeasurement(input.wettestDay.value, WEATHER_UNITS.rainfall)}${formatDateListSuffix(input.wettestDay.dates)}`,
    `Annual rainfall ${formatMeasurement(input.yearToDateRainfallMm, WEATHER_UNITS.rainfall)}`,
  ].join('\n')
}

function buildAnnualCompactText(input: {
  year: number
  summary: ReturnType<typeof buildAnnualSummary>
  temperatureRank: RankingSummary
  rainfallRank: RankingSummary | null
  thresholds: ThresholdSummary
}): string {
  return [
    `${input.year} annual report`,
    `Mean max ${formatMeasurement(input.summary.meanMaxTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.summary.meanMaxTempAnomalyC)} avg)`,
    `Mean min ${formatMeasurement(input.summary.meanMinTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.summary.meanMinTempAnomalyC)} avg)`,
    `Mean temp ${formatMeasurement(input.summary.meanTempC, WEATHER_UNITS.temperature)} (${formatSignedAnomaly(input.summary.meanTempAnomalyC)} avg)`,
    `Highest max ${formatMeasurement(input.summary.highestMax.value, WEATHER_UNITS.temperature)}${formatDateListSuffix(input.summary.highestMax.dates)}`,
    `Lowest min ${formatMeasurement(input.summary.lowestMin.value, WEATHER_UNITS.temperature)}${formatDateListSuffix(input.summary.lowestMin.dates)}`,
    `Rainfall ${formatMeasurement(input.summary.rainfallTotalMm, WEATHER_UNITS.rainfall)}${input.summary.rainfallPercentageOfNormal == null ? '' : ` (${input.summary.rainfallPercentageOfNormal.toFixed(1)}% avg)`}`,
    `Rain days (>0.1 mm) ${input.summary.rainDays}`,
    `Wettest day ${formatMeasurement(input.summary.wettestDay.value, WEATHER_UNITS.rainfall)}${formatDateListSuffix(input.summary.wettestDay.dates)}`,
    `Temperature ranking ${input.temperatureRank.label}`,
    `Rainfall ranking ${input.rainfallRank?.label ?? 'Not ranked'}`,
    `Days ≥20°C ${input.thresholds.atOrAbove20C}, ≥25°C ${input.thresholds.atOrAbove25C}, ≥30°C ${input.thresholds.atOrAbove30C}, Frost ${input.thresholds.frostDays}`,
  ].join('\n')
}

function toTiedMetric(
  tied: ReturnType<typeof collectTiedValues<ClimateDay>>,
): { value: number | null; dates: readonly ClimateDateString[] } {
  return {
    value: tied?.value ?? null,
    dates: tied?.items.map((item) => item.date) ?? [],
  }
}

function buildRankingSummary(
  entries: readonly { year: number; rank: number; value: number }[],
  year: number,
): RankingSummary {
  const self = entries.find((entry) => entry.year === year) ?? null
  if (self == null) {
    return {
      rank: null,
      totalEligible: entries.length,
      tied: false,
      label: `Not ranked (${entries.length} eligible)`,
    }
  }
  const tiedCount = entries.filter((entry) => entry.value === self.value).length
  const tied = tiedCount > 1
  return {
    rank: self.rank,
    totalEligible: entries.length,
    tied,
    label: `#${self.rank} of ${entries.length}${tied ? ` (${tiedCount} tied)` : ''}`,
  }
}

function toSpellSummary(
  label: string,
  spell: ReturnType<typeof calculateDryStreak>,
): LongestSpellSummary {
  return {
    label,
    length: spell.length,
    startDate: spell.startDate,
    endDate: spell.endDate,
  }
}

function toCsvValue(value: number | null): string {
  return value == null ? '' : String(value)
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function formatMeasurement(value: number | null, unit: string): string {
  return value == null ? '—' : `${value.toFixed(1)} ${unit}`
}

function formatSignedMeasurement(value: number | null, unit: string): string {
  if (value == null) {
    return '—'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)} ${unit}`
}

function formatSignedAnomaly(value: number | null): string {
  if (value == null) {
    return '—'
  }
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(1)}°C`
}

function formatDateListSuffix(dates: readonly ClimateDateString[]): string {
  if (dates.length === 0) {
    return ''
  }
  const formatted = dates.map((date) =>
    formatEuropeLondonDisplay(date, { day: 'numeric', month: 'short' }),
  )
  return ` (${formatted.join(', ')})`
}
