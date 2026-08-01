import { chartTokens } from '@/components/ui/chartTokens'
import { calculateSafeAverage, calculateSafeTotal, parseIsoClimateDate } from '@/lib/climate'
import {
  enumerateClimateDates,
  enumerateMinuteOrHourBuckets,
  floorMinuteOrHourBucket,
  formatBucketLabel,
  formatLondonDateTimeDisplay,
  getLondonClimateDateForTimestamp,
  getLondonDateTimeParts,
  isMinuteArchiveResolution,
  shiftClimateRangeByComparisonMode,
} from '@/features/customGraphs/time'
import type {
  ClimateDateString,
  ClimateDay,
  DailyNormal,
  MonthlyNormal,
} from '@/types/weather'
import type {
  CustomGraphWarning,
  CustomGraphAggregation,
  CustomGraphChartType,
  CustomGraphDataContext,
  CustomGraphFormState,
  CustomGraphResult,
  CustomGraphSeries,
  CustomGraphSeriesPoint,
  CustomGraphVariableKey,
  TemperatureRangeSeries,
  MinuteArchiveObservation,
  VariableDefinition,
} from '@/features/customGraphs/types'

export const CUSTOM_GRAPH_VARIABLES: readonly VariableDefinition[] = [
  {
    key: 'temperatureC',
    label: 'Air temperature',
    shortLabel: 'Temperature',
    unit: '°C',
    group: 'temperature',
    defaultChartType: 'line',
    supportedResolutions: ['minute', 'hourly'],
    isTemperature: true,
  },
  {
    key: 'humidityPercent',
    label: 'Relative humidity',
    shortLabel: 'Humidity',
    unit: '%',
    group: 'humidity',
    defaultChartType: 'line',
    supportedResolutions: ['minute', 'hourly'],
  },
  {
    key: 'pressureHpa',
    label: 'Pressure',
    shortLabel: 'Pressure',
    unit: 'hPa',
    group: 'pressure',
    defaultChartType: 'line',
    supportedResolutions: ['minute', 'hourly'],
  },
  {
    key: 'windSpeedMph',
    label: 'Wind speed',
    shortLabel: 'Wind',
    unit: 'mph',
    group: 'wind',
    defaultChartType: 'line',
    supportedResolutions: ['minute', 'hourly'],
  },
  {
    key: 'windGustMph',
    label: 'Wind gust',
    shortLabel: 'Gust',
    unit: 'mph',
    group: 'wind',
    defaultChartType: 'line',
    supportedResolutions: ['minute', 'hourly'],
  },
  {
    key: 'rainfallMm',
    label: 'Rainfall',
    shortLabel: 'Rainfall',
    unit: 'mm',
    group: 'rainfall',
    defaultChartType: 'bar',
    supportedResolutions: ['minute', 'hourly', 'daily', 'monthly', 'annual'],
    prefersBars: true,
    isRainfall: true,
  },
  {
    key: 'maxTempC',
    label: 'Maximum temperature',
    shortLabel: 'Max temp',
    unit: '°C',
    group: 'temperature',
    defaultChartType: 'line',
    supportedResolutions: ['daily', 'monthly', 'annual'],
    isTemperature: true,
  },
  {
    key: 'minTempC',
    label: 'Minimum temperature',
    shortLabel: 'Min temp',
    unit: '°C',
    group: 'temperature',
    defaultChartType: 'line',
    supportedResolutions: ['daily', 'monthly', 'annual'],
    isTemperature: true,
  },
  {
    key: 'meanTempC',
    label: 'Mean temperature',
    shortLabel: 'Mean temp',
    unit: '°C',
    group: 'temperature',
    defaultChartType: 'line',
    supportedResolutions: ['daily', 'monthly', 'annual'],
    isTemperature: true,
  },
] as const

const VARIABLE_DEFINITION_MAP = new Map(
  CUSTOM_GRAPH_VARIABLES.map((definition) => [definition.key, definition]),
)

const SERIES_COLORS = [
  chartTokens.series.observed,
  chartTokens.series.comparison,
  chartTokens.series.reference,
  chartTokens.series.provisional,
]

function definitionFor(variable: CustomGraphVariableKey): VariableDefinition {
  const definition = VARIABLE_DEFINITION_MAP.get(variable)
  if (definition == null) {
    throw new RangeError(`Unsupported variable: ${variable}`)
  }
  return definition
}

function aggregateValues(
  values: readonly (number | null)[],
  aggregation: CustomGraphAggregation,
): number | null {
  const validValues = values.filter((value): value is number => value != null && Number.isFinite(value))
  if (validValues.length === 0) {
    return null
  }

  if (aggregation === 'mean') {
    return calculateSafeAverage(validValues)
  }
  if (aggregation === 'total') {
    return calculateSafeTotal(validValues)
  }
  return aggregation === 'max' ? Math.max(...validValues) : Math.min(...validValues)
}

function runningMean(
  points: readonly CustomGraphSeriesPoint[],
  windowSize: number,
): CustomGraphSeriesPoint[] {
  if (windowSize <= 1) {
    return [...points]
  }

  return points.map((point, index) => {
    const slice = points.slice(Math.max(0, index - windowSize + 1), index + 1)
    const mean = calculateSafeAverage(slice.map((entry) => entry.value))
    return {
      ...point,
      value: mean,
    }
  })
}

function deriveRainfallIncrements(
  observations: readonly MinuteArchiveObservation[],
): Map<number, number | null> {
  const increments = new Map<number, number | null>()
  let previousClimateDate: ClimateDateString | null = null
  let previousRainToday: number | null = null

  for (const observation of observations) {
    const climateDate = getLondonClimateDateForTimestamp(observation.timestampMs)
    const currentValue = observation.rainTodayMm

    if (currentValue == null) {
      increments.set(observation.timestampMs, null)
      continue
    }

    if (previousClimateDate !== climateDate || previousRainToday == null || currentValue < previousRainToday) {
      increments.set(observation.timestampMs, currentValue)
    } else {
      increments.set(observation.timestampMs, Math.max(0, currentValue - previousRainToday))
    }

    previousClimateDate = climateDate
    previousRainToday = currentValue
  }

  return increments
}

function minuteObservationValue(
  observation: MinuteArchiveObservation,
  variable: CustomGraphVariableKey,
  rainfallIncrements: Map<number, number | null>,
): number | null {
  switch (variable) {
    case 'temperatureC':
      return observation.temperatureC
    case 'humidityPercent':
      return observation.humidityPercent
    case 'pressureHpa':
      return observation.pressureHpa
    case 'windSpeedMph':
      return observation.windSpeedMph
    case 'windGustMph':
      return observation.windGustMph
    case 'rainfallMm':
      return rainfallIncrements.get(observation.timestampMs) ?? null
    default:
      return null
  }
}

function bucketMinuteObservations(
  observations: readonly MinuteArchiveObservation[],
  variable: CustomGraphVariableKey,
  resolution: 'minute' | 'hourly',
  aggregation: CustomGraphAggregation,
  startMs: number,
  endMs: number,
): CustomGraphSeriesPoint[] {
  const rainfallIncrements = deriveRainfallIncrements(observations)
  const filtered = observations.filter(
    (observation) => observation.timestampMs >= startMs && observation.timestampMs <= endMs,
  )
  const bucketMap = new Map<number, (number | null)[]>()

  for (const observation of filtered) {
    const bucket = floorMinuteOrHourBucket(observation.timestampMs, resolution)
    const bucketValues = bucketMap.get(bucket) ?? []
    const value = minuteObservationValue(observation, variable, rainfallIncrements)
    bucketValues.push(value)
    bucketMap.set(bucket, bucketValues)
  }

  return enumerateMinuteOrHourBuckets(startMs, endMs, resolution).map((bucket) => ({
    timestamp: bucket,
    label: formatBucketLabel(bucket, resolution),
    value: aggregateValues(
      (bucketMap.get(bucket) ?? []) as readonly (number | null)[],
      variable === 'rainfallMm' ? 'total' : aggregation,
    ),
  }))
}

function climateDayValue(record: ClimateDay, variable: CustomGraphVariableKey): number | null {
  switch (variable) {
    case 'maxTempC':
      return record.maxTempC
    case 'minTempC':
      return record.minTempC
    case 'meanTempC':
      return record.meanTempC
    case 'rainfallMm':
      return record.rainfallMm
    default:
      return null
  }
}

function filterClimateDaysForRange(
  records: readonly ClimateDay[],
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): ClimateDay[] {
  return records.filter((record) => record.date >= startDate && record.date <= endDate)
}

function dailyPoints(
  records: readonly ClimateDay[],
  variable: CustomGraphVariableKey,
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): CustomGraphSeriesPoint[] {
  const recordMap = new Map(records.map((record) => [record.date, record]))
  return enumerateClimateDates(startDate, endDate).map((date) => {
    const record = recordMap.get(date)
    const parsed = parseIsoClimateDate(date)
    const timestamp = Date.UTC(parsed.year, parsed.month - 1, parsed.day, 12)
    return {
      timestamp,
      label: formatBucketLabel(timestamp, 'daily'),
      value: record == null ? null : climateDayValue(record, variable),
    }
  })
}

function groupedClimatePoints(
  records: readonly ClimateDay[],
  variable: CustomGraphVariableKey,
  resolution: 'monthly' | 'annual',
  aggregation: CustomGraphAggregation,
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): CustomGraphSeriesPoint[] {
  const filtered = filterClimateDaysForRange(records, startDate, endDate)
  const grouped = new Map<string, { values: (number | null)[]; timestamp: number }>()

  for (const record of filtered) {
    const { year, month } = parseIsoClimateDate(record.date)
    const key = resolution === 'monthly' ? `${year}-${String(month).padStart(2, '0')}` : String(year)
    const timestamp = resolution === 'monthly'
      ? Date.UTC(year, month - 1, 1, 12)
      : Date.UTC(year, 0, 1, 12)
    const bucket = grouped.get(key) ?? { values: [], timestamp }
    bucket.values.push(climateDayValue(record, variable))
    grouped.set(key, bucket)
  }

  return [...grouped.entries()]
    .sort((left, right) => left[1].timestamp - right[1].timestamp)
    .map(([, bucket]) => ({
      timestamp: bucket.timestamp,
      label: formatBucketLabel(bucket.timestamp, resolution),
      value: aggregateValues(bucket.values, variable === 'rainfallMm' ? 'total' : aggregation),
    }))
}

function buildClimateSeriesPoints(
  records: readonly ClimateDay[],
  variable: CustomGraphVariableKey,
  resolution: 'daily' | 'monthly' | 'annual',
  aggregation: CustomGraphAggregation,
  startDate: ClimateDateString,
  endDate: ClimateDateString,
): CustomGraphSeriesPoint[] {
  if (resolution === 'daily') {
    return dailyPoints(records, variable, startDate, endDate)
  }
  return groupedClimatePoints(records, variable, resolution, aggregation, startDate, endDate)
}

function buildNormalPoints(
  variable: CustomGraphVariableKey,
  resolution: 'daily' | 'monthly' | 'annual',
  primaryPoints: readonly CustomGraphSeriesPoint[],
  dailyNormals: readonly DailyNormal[],
  monthlyNormals: readonly MonthlyNormal[],
): CustomGraphSeriesPoint[] {
  if (!['maxTempC', 'minTempC', 'meanTempC', 'rainfallMm'].includes(variable)) {
    return []
  }

  if (resolution === 'daily') {
    const normalMap = new Map(
      dailyNormals.map((normal) => [normal.dateKey, normal]),
    )
    return primaryPoints.map((point) => {
      const date = getLondonClimateDateForTimestamp(point.timestamp)
      const { month, day } = parseIsoClimateDate(date)
      const key = `${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      const normal = normalMap.get(key)
      let value: number | null = null
      if (variable === 'maxTempC') {
        value = normal?.normalMaxTempC ?? null
      } else if (variable === 'minTempC') {
        value = normal?.normalMinTempC ?? null
      } else if (variable === 'meanTempC') {
        value = normal?.normalMeanTempC ?? null
      }
      return { ...point, value }
    })
  }

  if (resolution === 'monthly') {
    const normalMap = new Map(monthlyNormals.map((normal) => [normal.month, normal]))
    return primaryPoints.map((point) => {
      const month = getLondonDateTimeParts(new Date(point.timestamp)).month
      const normal = normalMap.get(month)
      let value: number | null = null
      if (variable === 'maxTempC') {
        value = normal?.meanMaxTempC ?? null
      } else if (variable === 'minTempC') {
        value = normal?.meanMinTempC ?? null
      } else if (variable === 'meanTempC') {
        value = normal?.meanTempC ?? null
      } else if (variable === 'rainfallMm') {
        value = normal?.rainfallMm ?? null
      }
      return { ...point, value }
    })
  }

  const annualNormal = {
    maxTempC: calculateSafeAverage(monthlyNormals.map((normal) => normal.meanMaxTempC)),
    minTempC: calculateSafeAverage(monthlyNormals.map((normal) => normal.meanMinTempC)),
    meanTempC: calculateSafeAverage(monthlyNormals.map((normal) => normal.meanTempC)),
    rainfallMm: calculateSafeTotal(monthlyNormals.map((normal) => normal.rainfallMm)),
  }

  return primaryPoints.map((point) => ({
    ...point,
    value:
      variable === 'maxTempC'
        ? annualNormal.maxTempC
        : variable === 'minTempC'
          ? annualNormal.minTempC
          : variable === 'meanTempC'
            ? annualNormal.meanTempC
            : variable === 'rainfallMm'
              ? annualNormal.rainfallMm
              : null,
  }))
}

function buildTemperatureRange(
  id: string,
  label: string,
  color: string,
  maxPoints: readonly CustomGraphSeriesPoint[],
  minPoints: readonly CustomGraphSeriesPoint[],
  dashed = false,
): TemperatureRangeSeries {
  const pointCount = Math.min(maxPoints.length, minPoints.length)
  return {
    id,
    label,
    color,
    dashed,
    points: Array.from({ length: pointCount }, (_, index) => ({
      timestamp: maxPoints[index]!.timestamp,
      label: maxPoints[index]!.label,
      min: minPoints[index]!.value,
      max: maxPoints[index]!.value,
    })),
  }
}

function cumulativeSeries(points: readonly CustomGraphSeriesPoint[]): CustomGraphSeriesPoint[] {
  let total = 0
  let seenValue = false
  return points.map((point) => {
    if (point.value == null) {
      return { ...point, value: seenValue ? total : null }
    }
    total += point.value
    seenValue = true
    return { ...point, value: total }
  })
}

function applyChartTypeDefaults(
  definition: VariableDefinition,
  chartType: CustomGraphChartType,
  cumulativeRainfall: boolean,
): CustomGraphChartType {
  if (definition.isRainfall && cumulativeRainfall) {
    return 'line'
  }
  if (chartType === 'range' && !definition.isTemperature) {
    return definition.defaultChartType
  }
  if (chartType === 'bar' && definition.isTemperature) {
    return 'line'
  }
  return chartType
}

function alignComparisonPoints(
  primaryPoints: readonly CustomGraphSeriesPoint[],
  comparisonPoints: readonly CustomGraphSeriesPoint[],
): CustomGraphSeriesPoint[] {
  return primaryPoints.map((point, index) => ({
    timestamp: point.timestamp,
    label: point.label,
    value: comparisonPoints[index]?.value ?? null,
  }))
}

function seriesSummary(series: readonly CustomGraphSeries[]): string {
  if (series.length === 0) {
    return 'No graph data is currently available for the selected filters.'
  }

  const seriesBits = series
    .filter((entry) => !entry.hidden)
    .map((entry) => {
      const validCount = entry.points.filter((point) => point.value != null).length
      const gapCount = entry.points.length - validCount
      return `${entry.label}: ${validCount} point${validCount === 1 ? '' : 's'}${gapCount > 0 ? `, ${gapCount} gap${gapCount === 1 ? '' : 's'}` : ''}`
    })

  return seriesBits.join('. ')
}

function startAndEndDatesFromRange(startMs: number, endMs: number): {
  startDate: ClimateDateString
  endDate: ClimateDateString
} {
  return {
    startDate: getLondonClimateDateForTimestamp(startMs),
    endDate: getLondonClimateDateForTimestamp(endMs),
  }
}

export function availableVariablesForResolution(
  resolution: CustomGraphFormState['resolution'],
): readonly VariableDefinition[] {
  return CUSTOM_GRAPH_VARIABLES.filter((definition) =>
    definition.supportedResolutions.includes(resolution),
  )
}

export function defaultVariablesForResolution(
  resolution: CustomGraphFormState['resolution'],
): readonly CustomGraphVariableKey[] {
  if (resolution === 'minute' || resolution === 'hourly') {
    return ['temperatureC', 'rainfallMm']
  }
  return ['meanTempC', 'rainfallMm']
}

export function defaultChartTypeForVariables(
  variables: readonly CustomGraphVariableKey[],
): CustomGraphChartType {
  if (variables.length === 1 && definitionFor(variables[0]!).isRainfall) {
    return 'bar'
  }
  if (variables.includes('maxTempC') && variables.includes('minTempC')) {
    return 'range'
  }
  return 'line'
}

export function buildCustomGraphResult(
  formState: CustomGraphFormState,
  context: CustomGraphDataContext,
  primaryRange: { startMs: number; endMs: number },
  comparisonRange: { startMs: number; endMs: number } | null,
): CustomGraphResult {
  const usesMinuteArchive = isMinuteArchiveResolution(formState.resolution)
  const warnings: CustomGraphWarning[] = []
  const series: CustomGraphSeries[] = []
  const temperatureRanges: TemperatureRangeSeries[] = []

  const primaryDates = startAndEndDatesFromRange(primaryRange.startMs, primaryRange.endMs)
  const comparisonDates =
    comparisonRange == null
      ? null
      : startAndEndDatesFromRange(comparisonRange.startMs, comparisonRange.endMs)

  for (const [index, variable] of formState.variables.entries()) {
    const definition = definitionFor(variable)
    let primaryPoints: CustomGraphSeriesPoint[]
    let comparisonPoints: CustomGraphSeriesPoint[] = []

    if (usesMinuteArchive) {
      const resolution = formState.resolution as 'minute' | 'hourly'
      primaryPoints = bucketMinuteObservations(
        context.minuteObservations,
        variable,
        resolution,
        formState.aggregation,
        primaryRange.startMs,
        primaryRange.endMs,
      )
      if (comparisonRange != null) {
        comparisonPoints = alignComparisonPoints(
          primaryPoints,
          bucketMinuteObservations(
            context.minuteObservations,
            variable,
            resolution,
            formState.aggregation,
            comparisonRange.startMs,
            comparisonRange.endMs,
          ),
        )
      }
    } else {
      const resolution = formState.resolution as 'daily' | 'monthly' | 'annual'
      primaryPoints = buildClimateSeriesPoints(
        context.climateRecords,
        variable,
        resolution,
        formState.aggregation,
        primaryDates.startDate,
        primaryDates.endDate,
      )
      if (comparisonDates != null) {
        comparisonPoints = alignComparisonPoints(
          primaryPoints,
          buildClimateSeriesPoints(
            context.climateRecords,
            variable,
            resolution,
            formState.aggregation,
            comparisonDates.startDate,
            comparisonDates.endDate,
          ),
        )
      }
    }

    if (formState.runningMean && !definition.isRainfall) {
      primaryPoints = runningMean(primaryPoints, formState.runningMeanWindow)
      if (comparisonPoints.length > 0) {
        comparisonPoints = runningMean(comparisonPoints, formState.runningMeanWindow)
      }
    }

    if (formState.cumulativeRainfall && definition.isRainfall) {
      primaryPoints = cumulativeSeries(primaryPoints)
      if (comparisonPoints.length > 0) {
        comparisonPoints = cumulativeSeries(comparisonPoints)
      }
    }

    const chartType = applyChartTypeDefaults(definition, formState.chartType, formState.cumulativeRainfall)
    series.push({
      id: `${definition.key}-primary`,
      label: definition.label,
      shortLabel: definition.shortLabel,
      unit: definition.unit,
      group: definition.group,
      color: SERIES_COLORS[index % SERIES_COLORS.length]!,
      chartType,
      points: primaryPoints,
    })

    if (comparisonPoints.length > 0) {
      series.push({
        id: `${definition.key}-comparison`,
        label: `${definition.label} comparison`,
        shortLabel: `${definition.shortLabel} comparison`,
        unit: definition.unit,
        group: definition.group,
        color: chartTokens.series.reference,
        chartType,
        points: comparisonPoints,
        dashed: true,
      })
    }

    if (!usesMinuteArchive && formState.normalOverlay) {
      const normalPoints = buildNormalPoints(
        variable,
        formState.resolution as 'daily' | 'monthly' | 'annual',
        primaryPoints,
        context.dailyNormals,
        context.monthlyNormals,
      )
      if (normalPoints.some((point) => point.value != null)) {
        series.push({
          id: `${definition.key}-normal`,
          label: `${definition.label} normal`,
          shortLabel: `${definition.shortLabel} normal`,
          unit: definition.unit,
          group: definition.group,
          color: chartTokens.series.comparison,
          chartType: 'line',
          points: normalPoints,
          dashed: true,
        })
      }
    }
  }

  const selectedTemperatureVariables = formState.variables.filter((variable) =>
    ['maxTempC', 'minTempC'].includes(variable),
  )

  if (!usesMinuteArchive && formState.temperatureRangeShading && selectedTemperatureVariables.length === 2) {
    const maxSeries = series.find((entry) => entry.id === 'maxTempC-primary')
    const minSeries = series.find((entry) => entry.id === 'minTempC-primary')
    if (maxSeries != null && minSeries != null) {
      temperatureRanges.push(
        buildTemperatureRange(
          'observed-temperature-range',
          'Observed temperature range',
          chartTokens.series.observed,
          maxSeries.points,
          minSeries.points,
        ),
      )
    }

    if (formState.normalOverlay) {
      const maxNormalSeries = series.find((entry) => entry.id === 'maxTempC-normal')
      const minNormalSeries = series.find((entry) => entry.id === 'minTempC-normal')
      if (maxNormalSeries != null && minNormalSeries != null) {
        temperatureRanges.push(
          buildTemperatureRange(
            'normal-temperature-range',
            'Normal temperature range',
            chartTokens.series.comparison,
            maxNormalSeries.points,
            minNormalSeries.points,
            true,
          ),
        )
      }
    }
  }

  if (series.every((entry) => entry.points.every((point) => point.value == null))) {
    warnings.push({
      code: 'NO_DATA',
      message: 'No valid values were available for the selected variables and period.',
    })
  }

  const summary = `${formState.variables.length > 0 ? formState.variables.map((variable) => definitionFor(variable).shortLabel).join(', ') : 'No variables'} from ${formatLondonDateTimeDisplay(primaryRange.startMs)} to ${formatLondonDateTimeDisplay(primaryRange.endMs)} at ${formState.resolution} resolution. ${seriesSummary(series)}`

  return {
    series,
    temperatureRanges,
    summary,
    warnings,
    fromMinuteArchive: usesMinuteArchive,
    observationCount: usesMinuteArchive ? context.minuteObservations.length : context.climateRecords.length,
    malformedLineCount: 0,
  }
}

export function buildClimateComparisonRange(
  startDate: ClimateDateString,
  endDate: ClimateDateString,
  comparisonMode: CustomGraphFormState['comparisonMode'],
): { startDate: ClimateDateString; endDate: ClimateDateString } | null {
  return shiftClimateRangeByComparisonMode(startDate, endDate, comparisonMode)
}
