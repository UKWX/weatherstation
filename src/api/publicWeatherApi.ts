import { queryOptions, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { PUBLIC_STATION_DATA_BASE_URL, WEATHER_UNITS } from '@/config/weather'
import type {
  AnnualClimatePayload,
  ArchiveIndex,
  ClimateIndex,
  ClimateValueStatus,
  CurrentConditions,
  DailyNormal,
  MonthlyNormal,
  ProvisionalTodaySummary,
  RecentObservation,
  StationStatus,
  StructuredApiError,
} from '@/types/weather'

const DEFAULT_TIMEOUT_MS = 12_000
const LIVE_REFRESH_INTERVAL_MS = 60_000
const LIVE_STALE_TIME_MS = 45_000
const ARCHIVE_INDEX_STALE_TIME_MS = 30 * 60_000
const NORMALS_STALE_TIME_MS = 24 * 60 * 60_000
const CLIMATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/

type RawRecord = Record<string, unknown>
type RawRecentEnvelope = {
  metadata: RawRecord
  observations: readonly unknown[]
}

export const PUBLIC_API_DIAGNOSTIC_ENDPOINTS = [
  '/current.json',
  '/status.json',
  '/recent.json',
  '/today.json',
  '/climate/index.json',
  '/climate/archive/index.json',
  '/climate/archive/2026.json',
  '/climate/normals/daily.json',
  '/climate/normals/monthly.json',
] as const

export type PublicApiDiagnosticEndpoint =
  (typeof PUBLIC_API_DIAGNOSTIC_ENDPOINTS)[number]

export type PublicApiErrorCode =
  | 'HTTP_ERROR'
  | 'NOT_FOUND'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'ABORTED'
  | 'INVALID_JSON'
  | 'MALFORMED_DATA'

export class PublicApiError extends Error {
  status: number
  code: PublicApiErrorCode
  details: Record<string, unknown> | null
  retryable: boolean
  offline: boolean

  constructor(input: {
    message: string
    status?: number
    code: PublicApiErrorCode
    details?: Record<string, unknown> | null
    retryable?: boolean
    offline?: boolean
  }) {
    super(input.message)
    this.name = 'PublicApiError'
    this.status = input.status ?? 0
    this.code = input.code
    this.details = input.details ?? null
    this.retryable = input.retryable ?? false
    this.offline = input.offline ?? false
  }

  toStructuredApiError(): StructuredApiError {
    return {
      status: this.status,
      message: this.message,
      code: this.code,
      details: this.details,
    }
  }
}

export interface PublicDataState {
  loading: boolean
  empty: boolean
  stale: boolean
  offline: boolean
  retry: boolean
  malformedData: boolean
}

export interface FetchJsonOptions<T> {
  signal?: AbortSignal
  timeoutMs?: number
  notFoundValue?: T
  validate: (value: unknown) => T
}

export interface PublicEndpointDiagnosticsEvaluation {
  validationSucceeded: boolean
  validationErrors: readonly string[]
  adapterSucceeded: boolean
  adapterErrors: readonly string[]
  adaptedSample: unknown
  counts: {
    topLevelKeys: number
    arrayLength: number | null
    recordCount: number | null
  }
}

export const weatherQueryKeys = {
  root: ['weather'] as const,
  liveRoot: ['weather', 'live'] as const,
  current: ['weather', 'live', 'current'] as const,
  status: ['weather', 'live', 'status'] as const,
  recent: ['weather', 'live', 'recent'] as const,
  today: ['weather', 'live', 'today'] as const,
  climateRoot: ['weather', 'climate'] as const,
  climateIndex: ['weather', 'climate', 'index'] as const,
  archiveIndex: ['weather', 'climate', 'archive', 'index'] as const,
  archiveYear: (year: number) =>
    ['weather', 'climate', 'archive', 'year', year] as const,
  climateYearSummary: (year: number) =>
    ['weather', 'climate', 'summary', 'year', year] as const,
  normalsDaily: ['weather', 'climate', 'normals', 'daily'] as const,
  normalsMonthly: ['weather', 'climate', 'normals', 'monthly'] as const,
  invalidationKeysForYear: (year: number) =>
    [
      ['weather', 'climate', 'archive', 'year', year],
      ['weather', 'climate', 'summary', 'year', year],
      ['weather', 'climate', 'archive', 'index'],
      ['weather', 'climate', 'index'],
    ] as const,
}

export function shouldRetryPublicRequest(
  failureCount: number,
  error: unknown,
): boolean {
  if (!(error instanceof PublicApiError)) {
    return failureCount < 2
  }

  if (!error.retryable) {
    return false
  }

  return failureCount < 2
}

export function defaultRetryDelay(attemptIndex: number): number {
  return Math.min(1_000 * 2 ** attemptIndex, 10_000)
}

export async function fetchTypedJson<T>(
  path: string,
  options: FetchJsonOptions<T>,
): Promise<T> {
  const url = `${PUBLIC_STATION_DATA_BASE_URL}${path}`
  const timeoutController = new AbortController()
  const requestController = new AbortController()
  const signal = mergeAbortSignals(
    [requestController.signal, timeoutController.signal, options.signal],
    requestController,
  )
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs)

  try {
    const response = await fetch(url, { signal })

    if (response.status === 404 && options.notFoundValue !== undefined) {
      return options.notFoundValue
    }

    if (!response.ok) {
      throw new PublicApiError({
        status: response.status,
        code: response.status === 404 ? 'NOT_FOUND' : 'HTTP_ERROR',
        message: `Request failed with status ${response.status}`,
        details: { path, statusText: response.statusText },
        retryable: response.status >= 500 || response.status === 429,
      })
    }

    const rawText = await response.text()
    const payload = parseJsonSafely(rawText, path)

    try {
      return options.validate(payload)
    } catch (error) {
      if (error instanceof PublicApiError) {
        throw error
      }

      throw new PublicApiError({
        code: 'MALFORMED_DATA',
        message: `Malformed response payload for ${path}`,
        details: {
          cause: error instanceof Error ? error.message : 'Unknown validation failure',
        },
        retryable: false,
      })
    }
  } catch (error) {
    if (error instanceof PublicApiError) {
      throw error
    }

    if (timeoutController.signal.aborted) {
      throw new PublicApiError({
        code: 'TIMEOUT',
        message: `Request timed out after ${timeoutMs}ms`,
        details: { path, timeoutMs },
        retryable: true,
      })
    }

    if (options.signal?.aborted || requestController.signal.aborted) {
      throw new PublicApiError({
        code: 'ABORTED',
        message: `Request was cancelled for ${path}`,
        details: { path },
        retryable: false,
      })
    }

    throw new PublicApiError({
      code: 'NETWORK_ERROR',
      message: `Network error while requesting ${path}`,
      details: {
        path,
        cause: error instanceof Error ? error.message : 'Unknown network failure',
      },
      retryable: true,
      offline: !isOnline(),
    })
  } finally {
    clearTimeout(timeoutId)
    requestController.abort()
  }
}

export async function getCurrentConditions(): Promise<CurrentConditions> {
  return fetchTypedJson('/current.json', {
    validate: (value) => adaptCurrentConditions(validateRecord(value, '/current.json')),
  })
}

export async function getStationStatus(): Promise<StationStatus> {
  return fetchTypedJson('/status.json', {
    validate: (value) => adaptStationStatus(validateRecord(value, '/status.json')),
  })
}

export async function getRecentObservations(): Promise<readonly RecentObservation[]> {
  return fetchTypedJson('/recent.json', {
    validate: (value) =>
      validateArray(value, '/recent.json').map((entry) =>
        adaptRecentObservation(validateRecord(entry, '/recent.json')),
      ),
  })
}

export async function getTodaySummary(): Promise<ProvisionalTodaySummary | null> {
  return fetchTypedJson('/today.json', {
    notFoundValue: null,
    validate: (value) => {
      if (value == null) {
        return null
      }

      return adaptTodaySummary(validateRecord(value, '/today.json'))
    },
  })
}

export async function getClimateIndex(): Promise<ClimateIndex> {
  return fetchTypedJson('/climate/index.json', {
    validate: (value) => adaptClimateIndex(validateRecord(value, '/climate/index.json')),
  })
}

export async function getClimateArchiveIndex(): Promise<ArchiveIndex> {
  return fetchTypedJson('/climate/archive/index.json', {
    validate: (value) =>
      adaptClimateArchiveIndex(validateRecord(value, '/climate/archive/index.json')),
  })
}

export async function getAnnualClimate(
  year: number,
): Promise<AnnualClimatePayload | null> {
  return fetchTypedJson(`/climate/archive/${year}.json`, {
    notFoundValue: null,
    validate: (value) => {
      if (value == null) {
        return null
      }

      return adaptAnnualClimate(validateRecord(value, `/climate/archive/${year}.json`))
    },
  })
}

export async function getDailyNormals(): Promise<readonly DailyNormal[]> {
  return fetchTypedJson('/climate/normals/daily.json', {
    validate: (value) =>
      validateArray(value, '/climate/normals/daily.json').map((entry) =>
        adaptDailyNormal(validateRecord(entry, '/climate/normals/daily.json')),
      ),
  })
}

export async function getMonthlyNormals(): Promise<readonly MonthlyNormal[]> {
  return fetchTypedJson('/climate/normals/monthly.json', {
    validate: (value) =>
      validateArray(value, '/climate/normals/monthly.json').map((entry) =>
        adaptMonthlyNormal(validateRecord(entry, '/climate/normals/monthly.json')),
      ),
  })
}

export const currentConditionsQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.current,
  queryFn: getCurrentConditions,
  refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  staleTime: LIVE_STALE_TIME_MS,
  placeholderData: (previousData) => previousData,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const stationStatusQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.status,
  queryFn: getStationStatus,
  refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  staleTime: LIVE_STALE_TIME_MS,
  placeholderData: (previousData) => previousData,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const recentObservationsQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.recent,
  queryFn: getRecentObservations,
  refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  staleTime: LIVE_STALE_TIME_MS,
  placeholderData: (previousData) => previousData,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const todaySummaryQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.today,
  queryFn: getTodaySummary,
  refetchInterval: LIVE_REFRESH_INTERVAL_MS,
  staleTime: LIVE_STALE_TIME_MS,
  placeholderData: (previousData) => previousData,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const climateIndexQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.climateIndex,
  queryFn: getClimateIndex,
  staleTime: ARCHIVE_INDEX_STALE_TIME_MS,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const climateArchiveIndexQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.archiveIndex,
  queryFn: getClimateArchiveIndex,
  staleTime: ARCHIVE_INDEX_STALE_TIME_MS,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export function annualClimateQueryOptions(year: number) {
  return queryOptions({
    queryKey: weatherQueryKeys.archiveYear(year),
    queryFn: () => getAnnualClimate(year),
    enabled: Number.isInteger(year),
    staleTime: ARCHIVE_INDEX_STALE_TIME_MS,
    retry: shouldRetryPublicRequest,
    retryDelay: defaultRetryDelay,
  })
}

export const dailyNormalsQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.normalsDaily,
  queryFn: getDailyNormals,
  staleTime: NORMALS_STALE_TIME_MS,
  gcTime: NORMALS_STALE_TIME_MS * 2,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export const monthlyNormalsQueryOptions = queryOptions({
  queryKey: weatherQueryKeys.normalsMonthly,
  queryFn: getMonthlyNormals,
  staleTime: NORMALS_STALE_TIME_MS,
  gcTime: NORMALS_STALE_TIME_MS * 2,
  retry: shouldRetryPublicRequest,
  retryDelay: defaultRetryDelay,
})

export function useCurrentConditionsQuery() {
  return useQuery(currentConditionsQueryOptions)
}

export function useStationStatusQuery() {
  return useQuery(stationStatusQueryOptions)
}

export function useRecentObservationsQuery() {
  return useQuery(recentObservationsQueryOptions)
}

export function useTodaySummaryQuery() {
  return useQuery(todaySummaryQueryOptions)
}

export function useClimateIndexQuery() {
  return useQuery(climateIndexQueryOptions)
}

export function useClimateArchiveIndexQuery() {
  return useQuery(climateArchiveIndexQueryOptions)
}

export function useAnnualClimateQuery(year: number) {
  return useQuery(annualClimateQueryOptions(year))
}

export function useDailyNormalsQuery() {
  return useQuery(dailyNormalsQueryOptions)
}

export function useMonthlyNormalsQuery() {
  return useQuery(monthlyNormalsQueryOptions)
}

export function derivePublicDataState<T>(
  query: UseQueryResult<T, PublicApiError>,
  options: {
    isEmpty: (value: T) => boolean
    staleWhen?: (value: T) => boolean
  },
): PublicDataState {
  const hasData = query.data !== undefined
  const malformedData = query.error?.code === 'MALFORMED_DATA'
  const empty = query.data === undefined ? false : options.isEmpty(query.data)

  return {
    loading: query.isLoading && !hasData,
    empty,
    stale:
      query.isStale ||
      query.isPlaceholderData ||
      (query.data === undefined
        ? false
        : options.staleWhen == null
          ? false
          : options.staleWhen(query.data)),
    offline: query.error?.offline === true || !isOnline(),
    retry: query.error?.retryable === true,
    malformedData,
  }
}

type DiagnosticPipeline<TValidated, TAdapted> = {
  validate: (value: unknown) => TValidated
  adapt: (value: TValidated) => TAdapted
}

const publicEndpointDiagnosticPipelines: {
  [TPath in PublicApiDiagnosticEndpoint]: DiagnosticPipeline<unknown, unknown>
} = {
  '/current.json': {
    validate: (value) => validateRecord(value, '/current.json'),
    adapt: (value) => adaptCurrentConditions(value as RawRecord),
  },
  '/status.json': {
    validate: (value) => validateRecord(value, '/status.json'),
    adapt: (value) => adaptStationStatus(value as RawRecord),
  },
  '/recent.json': {
    validate: (value) => validateRecentEnvelope(value),
    adapt: (value) =>
      (value as RawRecentEnvelope).observations.map((entry, index) =>
        adaptRecentObservation(
          validateRecord(entry, `/recent.json.observations[${index}]`),
        ),
      ),
  },
  '/today.json': {
    validate: (value) =>
      value == null ? null : validateRecord(value, '/today.json'),
    adapt: (value) =>
      value == null ? null : adaptTodaySummary(value as RawRecord),
  },
  '/climate/index.json': {
    validate: (value) => validateRecord(value, '/climate/index.json'),
    adapt: (value) => adaptClimateIndex(value as RawRecord),
  },
  '/climate/archive/index.json': {
    validate: (value) => validateRecord(value, '/climate/archive/index.json'),
    adapt: (value) => adaptClimateArchiveIndex(value as RawRecord),
  },
  '/climate/archive/2026.json': {
    validate: (value) => validateRecord(value, '/climate/archive/2026.json'),
    adapt: (value) => adaptAnnualClimate(value as RawRecord),
  },
  '/climate/normals/daily.json': {
    validate: (value) =>
      validateArray(value, '/climate/normals/daily.json'),
    adapt: (value) =>
      (value as readonly unknown[]).map((entry, index) =>
        adaptDailyNormal(
          validateRecord(
            entry,
            `/climate/normals/daily.json[${index}]`,
          ),
        ),
      ),
  },
  '/climate/normals/monthly.json': {
    validate: (value) =>
      validateArray(value, '/climate/normals/monthly.json'),
    adapt: (value) =>
      (value as readonly unknown[]).map((entry, index) =>
        adaptMonthlyNormal(
          validateRecord(
            entry,
            `/climate/normals/monthly.json[${index}]`,
          ),
        ),
      ),
  },
}

export function evaluatePublicEndpointDiagnostics(
  endpoint: PublicApiDiagnosticEndpoint,
  payload: unknown,
): PublicEndpointDiagnosticsEvaluation {
  const pipeline = publicEndpointDiagnosticPipelines[endpoint]
  let validated: unknown = null
  let validationErrors: readonly string[] = []

  try {
    validated = pipeline.validate(payload)
  } catch (error) {
    validationErrors = [toDiagnosticError(error)]
  }

  if (validationErrors.length > 0) {
    return {
      validationSucceeded: false,
      validationErrors,
      adapterSucceeded: false,
      adapterErrors: [],
      adaptedSample: null,
      counts: derivePayloadCounts(payload),
    }
  }

  try {
    const adapted = pipeline.adapt(validated)
    return {
      validationSucceeded: true,
      validationErrors: [],
      adapterSucceeded: true,
      adapterErrors: [],
      adaptedSample: adapted,
      counts: derivePayloadCounts(payload),
    }
  } catch (error) {
    return {
      validationSucceeded: true,
      validationErrors: [],
      adapterSucceeded: false,
      adapterErrors: [toDiagnosticError(error)],
      adaptedSample: null,
      counts: derivePayloadCounts(payload),
    }
  }
}

function mergeAbortSignals(
  signals: readonly (AbortSignal | undefined)[],
  controller: AbortController,
): AbortSignal {
  const activeSignals = signals.filter((signal): signal is AbortSignal => signal != null)

  for (const signal of activeSignals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }

    function validateRecentEnvelope(value: unknown): RawRecentEnvelope {
      const root = validateRecord(value, '/recent.json')
      return {
        metadata: validateRecord(root.metadata, '/recent.json.metadata'),
        observations: validateArray(root.observations, '/recent.json.observations'),
      }
    }

    function derivePayloadCounts(payload: unknown): PublicEndpointDiagnosticsEvaluation['counts'] {
      if (Array.isArray(payload)) {
        return {
          topLevelKeys: 0,
          arrayLength: payload.length,
          recordCount: payload.filter(
            (entry) => entry != null && typeof entry === 'object' && !Array.isArray(entry),
          ).length,
        }
      }

      if (payload != null && typeof payload === 'object') {
        const keys = Object.keys(payload)
        return {
          topLevelKeys: keys.length,
          arrayLength: null,
          recordCount: 1,
        }
      }

      return {
        topLevelKeys: 0,
        arrayLength: null,
        recordCount: null,
      }
    }

    function toDiagnosticError(error: unknown): string {
      if (error instanceof PublicApiError) {
        const path =
          typeof error.details?.path === 'string'
            ? error.details.path
            : typeof error.details?.key === 'string'
              ? error.details.key
              : null

        return path == null ? error.message : `${path}: ${error.message}`
      }

      return error instanceof Error ? error.message : 'Unknown diagnostics error'
    }
  }

  for (const signal of activeSignals) {
    signal.addEventListener(
      'abort',
      () => {
        controller.abort()
      },
      { once: true },
    )
  }

  return controller.signal
}

function parseJsonSafely(rawText: string, path: string): unknown {
  if (rawText.trim().length === 0) {
    return null
  }

  try {
    return JSON.parse(rawText) as unknown
  } catch (error) {
    throw new PublicApiError({
      code: 'INVALID_JSON',
      message: `Invalid JSON response for ${path}`,
      details: { path, cause: error instanceof Error ? error.message : 'Unknown parse failure' },
      retryable: false,
    })
  }
}

function adaptCurrentConditions(raw: RawRecord): CurrentConditions {
  return {
    observedAtUtc: optionalString(raw, 'observed_at_utc'),
    temperatureC: optionalNullableNumber(raw, 'temperature_c'),
    feelsLikeC: optionalNullableNumber(raw, 'feels_like_c'),
    dewPointC: optionalNullableNumber(raw, 'dew_point_c'),
    humidityPct: optionalNullableNumber(raw, 'humidity_pct'),
    pressureHpa: optionalNullableNumber(raw, 'pressure_hpa'),
    windSpeedMph: optionalNullableNumber(raw, 'wind_speed_mph'),
    windGustMph: optionalNullableNumber(raw, 'wind_gust_mph'),
    windDirectionDegrees: optionalNullableNumber(raw, 'wind_direction_degrees'),
    rainRateMmPerHour: optionalNullableNumber(raw, 'rain_rate_mm_per_hour'),
    rainfallTodayMm: optionalNullableNumber(raw, 'rainfall_today_mm'),
  }
}

function adaptStationStatus(raw: RawRecord): StationStatus {
  return {
    online: requiredBoolean(raw, 'online'),
    observedAtUtc: optionalString(raw, 'observed_at_utc'),
    observationAgeSeconds: optionalNullableNumber(raw, 'observation_age_seconds'),
    lastSuccessfulUpdateUtc: optionalString(raw, 'last_successful_update_utc'),
    isStale: requiredBoolean(raw, 'is_stale'),
  }
}

function adaptRecentObservation(raw: RawRecord): RecentObservation {
  return {
    observedAtUtc: requiredString(raw, 'observed_at_utc'),
    temperatureC: optionalNullableNumber(raw, 'temperature_c'),
    pressureHpa: optionalNullableNumber(raw, 'pressure_hpa'),
    rainRateMmPerHour: optionalNullableNumber(raw, 'rain_rate_mm_per_hour'),
    rainfallTodayMm: optionalNullableNumber(raw, 'rainfall_today_mm'),
  }
}

function adaptTodaySummary(raw: RawRecord): ProvisionalTodaySummary {
  const officialWindows = validateRecord(raw.official_windows, '/today.json.official_windows')

  return {
    climateDate: requiredClimateDateString(raw, 'date'),
    maxTempC: optionalNullableNumber(raw, 'max_temp_c'),
    minTempC: optionalNullableNumber(raw, 'min_temp_c'),
    rainfallMm: optionalNullableNumber(raw, 'rainfall_mm'),
    officialWindows: {
      maxTemperature: requiredString(officialWindows, 'max_temperature'),
      minTemperature: requiredString(officialWindows, 'min_temperature'),
      rainfall: requiredString(officialWindows, 'rainfall'),
    },
  }
}

function adaptClimateIndex(raw: RawRecord): ClimateIndex {
  const temperatureCoverage = validateRecord(
    raw.temperature_coverage,
    '/climate/index.json.temperature_coverage',
  )
  const rainfallCoverage = validateRecord(
    raw.rainfall_coverage,
    '/climate/index.json.rainfall_coverage',
  )

  return {
    station: requiredString(raw, 'station'),
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    latestAvailableDate: optionalClimateDateString(raw, 'latest_available_date'),
    latestAvailableYear: optionalNullableNumber(raw, 'latest_available_year'),
    temperatureCoverage: {
      startDate: requiredClimateDateString(temperatureCoverage, 'start_date'),
      endDate: optionalClimateDateString(temperatureCoverage, 'end_date'),
      latestCompleteYear: optionalNullableNumber(temperatureCoverage, 'latest_complete_year'),
    },
    rainfallCoverage: {
      startDate: requiredClimateDateString(rainfallCoverage, 'start_date'),
      endDate: optionalClimateDateString(rainfallCoverage, 'end_date'),
      latestCompleteYear: optionalNullableNumber(rainfallCoverage, 'latest_complete_year'),
    },
  }
}

function adaptClimateArchiveIndex(raw: RawRecord): ArchiveIndex {
  const years = validateArray(raw.years, '/climate/archive/index.json.years').map((entry, index) => {
    const record = validateRecord(entry, `/climate/archive/index.json.years[${index}]`)
    return {
      year: requiredNumber(record, 'year'),
      startDate: optionalClimateDateString(record, 'start_date'),
      endDate: optionalClimateDateString(record, 'end_date'),
      observationCount: optionalNullableNumber(record, 'observation_count'),
      complete: requiredBoolean(record, 'complete'),
      rainfallComplete: requiredBoolean(record, 'rainfall_complete'),
    }
  })

  return {
    station: requiredString(raw, 'station'),
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    years,
  }
}

function adaptAnnualClimate(raw: RawRecord): AnnualClimatePayload {
  const records = validateArray(raw.records, '/climate/archive/{year}.json.records').map(
    (entry, index) =>
      adaptAnnualRecord(
        validateRecord(entry, `/climate/archive/{year}.json.records[${index}]`),
      ),
  )
  const units = validateRecord(raw.units, '/climate/archive/{year}.json.units')

  return {
    station: requiredString(raw, 'station'),
    year: requiredNumber(raw, 'year'),
    complete: requiredBoolean(raw, 'complete'),
    through: optionalClimateDateString(raw, 'through'),
    observationCount: optionalNullableNumber(raw, 'observation_count'),
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    units: {
      temperature: requiredLiteral(units, 'temperature', WEATHER_UNITS.temperature),
      rainfall: requiredLiteral(units, 'rainfall', WEATHER_UNITS.rainfall),
      pressure: requiredLiteral(units, 'pressure', WEATHER_UNITS.pressure),
      wind: requiredLiteral(units, 'wind', WEATHER_UNITS.wind),
    },
    records,
  }
}

function adaptAnnualRecord(raw: RawRecord): AnnualClimatePayload['records'][number] {
  const status = optionalString(raw, 'status')
  return {
    date: requiredClimateDateString(raw, 'date'),
    maxTempC: optionalNullableNumber(raw, 'max_temp_c'),
    minTempC: optionalNullableNumber(raw, 'min_temp_c'),
    meanTempC: optionalNullableNumber(raw, 'mean_temp_c'),
    rainfallMm: optionalNullableNumber(raw, 'rainfall_mm'),
    status: status == null ? 'finalised' : validateClimateStatus(status),
  }
}

function adaptDailyNormal(raw: RawRecord): DailyNormal {
  return {
    date: requiredClimateDateString(raw, 'date'),
    month: requiredNumber(raw, 'month'),
    day: requiredNumber(raw, 'day'),
    maxTempC: optionalNullableNumber(raw, 'max_temp_c'),
    minTempC: optionalNullableNumber(raw, 'min_temp_c'),
    meanTempC: optionalNullableNumber(raw, 'mean_temp_c'),
  }
}

function adaptMonthlyNormal(raw: RawRecord): MonthlyNormal {
  return {
    month: requiredNumber(raw, 'month'),
    meanMaxTempC: optionalNullableNumber(raw, 'mean_max_temp_c'),
    meanMinTempC: optionalNullableNumber(raw, 'mean_min_temp_c'),
    meanTempC: optionalNullableNumber(raw, 'mean_temp_c'),
    rainfallMm: optionalNullableNumber(raw, 'rainfall_mm'),
  }
}

function validateClimateStatus(value: string): ClimateValueStatus {
  if (
    value === 'finalised' ||
    value === 'provisional' ||
    value === 'incomplete' ||
    value === 'unavailable'
  ) {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Unsupported climate status value "${value}"`,
    retryable: false,
  })
}

function validateRecord(value: unknown, context: string): RawRecord {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as RawRecord
    if (typeof record[RECORD_PATH_SYMBOL] !== 'string') {
      Object.defineProperty(record, RECORD_PATH_SYMBOL, {
        value: context,
        enumerable: false,
        configurable: true,
      })
    }
    return record
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected object payload for ${context}`,
    details: { path: context },
    retryable: false,
  })
}

function validateArray(value: unknown, context: string): readonly unknown[] {
  if (Array.isArray(value)) {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected array payload for ${context}`,
    details: { path: context },
    retryable: false,
  })
}

function requiredString(record: RawRecord, key: string): string {
  const value = record[key]
  if (typeof value === 'string') {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected string for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function requiredClimateDateString(
  record: RawRecord,
  key: string,
): `${number}-${number}-${number}` {
  const value = requiredString(record, key)
  if (CLIMATE_DATE_PATTERN.test(value)) {
    return value as `${number}-${number}-${number}`
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected climate date for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function optionalString(record: RawRecord, key: string): string | null {
  const value = record[key]
  if (value == null) {
    return null
  }

  if (typeof value === 'string') {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected string or null for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function optionalClimateDateString(
  record: RawRecord,
  key: string,
): `${number}-${number}-${number}` | null {
  const value = optionalString(record, key)
  if (value == null) {
    return null
  }

  if (CLIMATE_DATE_PATTERN.test(value)) {
    return value as `${number}-${number}-${number}`
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected climate date or null for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function requiredNumber(record: RawRecord, key: string): number {
  const value = record[key]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected number for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function optionalNullableNumber(record: RawRecord, key: string): number | null {
  const value = record[key]
  if (value == null) {
    return null
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected number or null for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function requiredBoolean(record: RawRecord, key: string): boolean {
  const value = record[key]
  if (typeof value === 'boolean') {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected boolean for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

function requiredLiteral<T extends string>(
  record: RawRecord,
  key: string,
  literal: T,
): T {
  const value = record[key]
  if (value === literal) {
    return literal
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected "${literal}" for "${key}"`,
    details: { key, path: `${deriveRecordPath(record)}.${key}` },
    retryable: false,
  })
}

const RECORD_PATH_SYMBOL = Symbol('recordPath')

function deriveRecordPath(record: RawRecord): string {
  const path = record[RECORD_PATH_SYMBOL]
  return typeof path === 'string' ? path : '<unknown>'
}

function isOnline(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }

  return navigator.onLine
}
