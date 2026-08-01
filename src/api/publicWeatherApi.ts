import { queryOptions, useQueries, useQuery, type UseQueryResult } from '@tanstack/react-query'
import { PUBLIC_STATION_DATA_BASE_URL } from '@/config/weather'
import type {
  AnnualClimatePayload,
  ArchiveIndex,
  ClimateIndex,
  ClimateValueStatus,
  CurrentConditions,
  DailyNormal,
  DailyNormalsPayload,
  JsonObject,
  JsonValue,
  MonthlyNormal,
  MonthlyNormalsPayload,
  ProvisionalTodaySummary,
  RecentObservation,
  RecentObservationsPayload,
  StationStatus,
  StructuredApiError,
} from '@/types/weather'

const DEFAULT_TIMEOUT_MS = 12_000
const LIVE_REFRESH_INTERVAL_MS = 60_000
const LIVE_STALE_TIME_MS = 45_000
const ARCHIVE_INDEX_STALE_TIME_MS = 30 * 60_000
const NORMALS_STALE_TIME_MS = 24 * 60 * 60_000
const CLIMATE_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/
const CLIMATE_DAY_KEY_PATTERN = /^(\d{2})-(\d{2})$/
const RECORD_PATH_SYMBOL: unique symbol = Symbol('recordPath')

type RawRecord = Record<string, unknown> & {
  [RECORD_PATH_SYMBOL]?: string
}
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
  inspection: unknown
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

export async function getRecentObservations(): Promise<RecentObservationsPayload> {
  return fetchTypedJson('/recent.json', {
    validate: (value) => adaptRecentObservations(validateRecentEnvelope(value)),
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

export async function getDailyNormals(): Promise<DailyNormalsPayload> {
  return fetchTypedJson('/climate/normals/daily.json', {
    validate: (value) => adaptDailyNormalsPayload(validateRecord(value, '/climate/normals/daily.json')),
  })
}

export async function getMonthlyNormals(): Promise<MonthlyNormalsPayload> {
  return fetchTypedJson('/climate/normals/monthly.json', {
    validate: (value) =>
      adaptMonthlyNormalsPayload(validateRecord(value, '/climate/normals/monthly.json')),
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

export function useAnnualClimateQueries(
  years: readonly number[],
  options: { enabled?: boolean } = {},
) {
  return useQueries({
    queries: years.map((year) => ({
      ...annualClimateQueryOptions(year),
      enabled: options.enabled ?? true,
    })),
  })
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
    adapt: (value) => adaptRecentObservations(value as RawRecentEnvelope),
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
    validate: (value) => validateRecord(value, '/climate/normals/daily.json'),
    adapt: (value) => adaptDailyNormalsPayload(value as RawRecord),
  },
  '/climate/normals/monthly.json': {
    validate: (value) => validateRecord(value, '/climate/normals/monthly.json'),
    adapt: (value) => adaptMonthlyNormalsPayload(value as RawRecord),
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
      inspection: deriveDiagnosticInspection(endpoint, payload),
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
      inspection: deriveDiagnosticInspection(endpoint, payload),
      counts: derivePayloadCounts(payload),
    }
  } catch (error) {
    return {
      validationSucceeded: true,
      validationErrors: [],
      adapterSucceeded: false,
      adapterErrors: [toDiagnosticError(error)],
      adaptedSample: null,
      inspection: deriveDiagnosticInspection(endpoint, payload),
      counts: derivePayloadCounts(payload),
    }
  }
}

function validateRecentEnvelope(value: unknown): RawRecentEnvelope {
  const root = validateRecord(value, '/recent.json')
  return {
    metadata: validateRecord(root.metadata, '/recent.json.metadata'),
    observations: validateArray(root.observations, '/recent.json.observations'),
  }
}

function deriveDiagnosticInspection(
  endpoint: PublicApiDiagnosticEndpoint,
  payload: unknown,
): unknown {
  if (endpoint === '/recent.json') {
    const root = safeRecord(payload)
    const observations = Array.isArray(root?.observations) ? root.observations : []
    const firstIndex = observations.length > 0 ? 0 : null
    const lastIndex = observations.length > 0 ? observations.length - 1 : null
    const bestIndex = findMostCompleteRecordIndex(observations)
    const firstObservation = firstIndex == null ? null : safeRecord(observations[firstIndex])
    const lastObservation = lastIndex == null ? null : safeRecord(observations[lastIndex])
    const mostCompleteObservation = bestIndex == null ? null : safeRecord(observations[bestIndex])
    const nullabilitySources = [firstObservation, lastObservation, mostCompleteObservation]
    return {
      observationsCount: observations.length,
      firstObservation:
        firstIndex == null
          ? null
          : {
              index: firstIndex,
              ...summariseObject(firstObservation, nullabilitySources),
            },
      lastObservation:
        lastIndex == null
          ? null
          : {
              index: lastIndex,
              ...summariseObject(lastObservation, nullabilitySources),
            },
      mostCompleteObservation:
        bestIndex == null
          ? null
          : {
              index: bestIndex,
              nonNullValueCount: countNonNullValues(observations[bestIndex]),
              ...summariseObject(mostCompleteObservation, nullabilitySources),
            },
    }
  }

  if (endpoint === '/today.json') {
    const root = safeRecord(payload)
    const maximumTemperature = safeRecord(root?.maximum_temperature)
    const minimumTemperature = safeRecord(root?.minimum_temperature)
    const rainfall = safeRecord(root?.rainfall)
    const calendarDayExtremes = safeRecord(root?.calendar_day_extremes)

    return {
      maximumTemperatureCoverage: summariseObject(safeRecord(maximumTemperature?.coverage)),
      minimumTemperatureCoverage: summariseObject(safeRecord(minimumTemperature?.coverage)),
      rainfallCoverage: summariseObject(safeRecord(rainfall?.coverage)),
      calendarDayExtremesTopLevelKeys: deriveTopLevelKeys(calendarDayExtremes),
      calendarDayExtremesChildren:
        calendarDayExtremes == null
          ? {}
          : Object.fromEntries(
              Object.entries(calendarDayExtremes).map(([key, value]) => [
                key,
                summariseObject(safeRecord(value)),
              ]),
            ),
    }
  }

  if (endpoint === '/climate/index.json') {
    const root = safeRecord(payload)
    const normals = safeRecord(root?.normals)
    const normalDaily = safeRecord(normals?.daily)
    const normalMonthly = safeRecord(normals?.monthly)

    return {
      normals: summariseObject(normals),
      normalsDaily: summariseObject(normalDaily),
      normalsMonthly: summariseObject(normalMonthly),
      dataQuality: summariseObject(safeRecord(root?.data_quality)),
      endpoints: summariseObject(safeRecord(root?.endpoints)),
    }
  }

  if (endpoint === '/climate/archive/index.json') {
    const root = safeRecord(payload)
    const years = Array.isArray(root?.years) ? root.years : []
    const firstYear = safeRecord(years[0])
    const latestYear = safeRecord(years.at(-1))
    const currentYear = new Date().getUTCFullYear()
    const completeHistoricalYear =
      years.find((entry) => {
        const record = safeRecord(entry)
        return (
          record != null &&
          typeof record.year === 'number' &&
          record.year < currentYear &&
          record.complete === true
        )
      }) ?? null
    const currentYearEntry =
      years.find((entry) => {
        const record = safeRecord(entry)
        return record != null && record.year === currentYear
      }) ?? null

    return {
      yearsCount: years.length,
      firstYearEntry: summariseObject(firstYear),
      lastYearEntry: summariseObject(latestYear),
      completeHistoricalYearEntry:
        completeHistoricalYear == null
          ? null
          : {
              ...summariseObject(safeRecord(completeHistoricalYear)),
              sample: compactDiagnosticValue(completeHistoricalYear),
            },
      currentYear,
      currentYearEntry:
        currentYearEntry == null
          ? null
          : {
              ...summariseObject(safeRecord(currentYearEntry)),
              sample: compactDiagnosticValue(currentYearEntry),
            },
    }
  }

  if (endpoint === '/climate/normals/daily.json') {
    const root = safeRecord(payload)
    const records = Array.isArray(root?.records) ? root.records : []
    const feb29Index = records.findIndex((entry) => {
      const record = safeRecord(entry)
      return record?.month === 2 && record?.day === 29
    })

    return {
      recordsCount: records.length,
      firstRecord:
        records.length === 0
          ? null
          : {
              index: 0,
              ...summariseObject(safeRecord(records[0])),
            },
      february29Record:
        feb29Index === -1
          ? null
          : {
              index: feb29Index,
              ...summariseObject(safeRecord(records[feb29Index])),
            },
    }
  }

  if (endpoint === '/climate/normals/monthly.json') {
    const root = safeRecord(payload)
    const months = Array.isArray(root?.months) ? root.months : []
    const summerMonthIndex = months.findIndex((entry) => {
      const record = safeRecord(entry)
      return (
        record != null &&
        typeof record.month === 'number' &&
        [6, 7, 8].includes(record.month)
      )
    })

    return {
      monthsCount: months.length,
      firstMonth:
        months.length === 0
          ? null
          : {
              index: 0,
              ...summariseObject(safeRecord(months[0])),
            },
      summerMonth:
        summerMonthIndex === -1
          ? null
          : {
              index: summerMonthIndex,
              ...summariseObject(safeRecord(months[summerMonthIndex])),
            },
    }
  }

  return null
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

function adaptRecentObservations(raw: RawRecentEnvelope): RecentObservationsPayload {
  return {
    metadata: validateJsonObject(raw.metadata, '/recent.json.metadata'),
    observations: raw.observations.map((entry, index) =>
      adaptRecentObservation(
        validateRecord(entry, `/recent.json.observations[${index}]`),
      ),
    ),
  }
}

function adaptCurrentConditions(raw: RawRecord): CurrentConditions {
  const heatIndexC = optionalNullableNumber(raw, 'heat_index_c')
  const windChillC = optionalNullableNumber(raw, 'wind_chill_c')

  return {
    observationTimeUtc: optionalString(raw, 'observation_time_utc'),
    observationTimeLocal: optionalString(raw, 'observation_time_local'),
    fetchedAtUtc: optionalString(raw, 'fetched_at_utc'),
    temperatureC: optionalNullableNumber(raw, 'temperature_c'),
    heatIndexC,
    windChillC,
    feelsLikeC: deriveFeelsLikeC(heatIndexC, windChillC),
    dewpointC: optionalNullableNumber(raw, 'dewpoint_c'),
    humidityPercent: optionalNullableNumber(raw, 'humidity_percent'),
    pressureHpa: optionalNullableNumber(raw, 'pressure_hpa'),
    windSpeedKmh: optionalNullableNumber(raw, 'wind_speed_kmh'),
    windSpeedMph: optionalNullableNumber(raw, 'wind_speed_mph'),
    windGustKmh: optionalNullableNumber(raw, 'wind_gust_kmh'),
    windGustMph: optionalNullableNumber(raw, 'wind_gust_mph'),
    windDirectionDegrees: optionalNullableNumber(raw, 'wind_direction_degrees'),
    rainRateMmPerHour: optionalNullableNumber(raw, 'rain_rate_mm_per_hour'),
    rainTodayMm: optionalNullableNumber(raw, 'rain_today_mm'),
    solarRadiationWm2: optionalNullableNumber(raw, 'solar_radiation_wm2'),
    uvIndex: optionalNullableNumber(raw, 'uv_index'),
  }
}

function adaptStationStatus(raw: RawRecord): StationStatus {
  const status = requiredString(raw, 'status')
  const collectorStatus = optionalString(raw, 'collector_status')
  const derivedState = deriveStationLiveState(status, collectorStatus)

  return {
    status,
    collectorStatus,
    message: optionalString(raw, 'message'),
    checkedAtUtc: optionalString(raw, 'checked_at_utc'),
    observationTimeUtc: optionalString(raw, 'observation_time_utc'),
    live: derivedState.live,
    online: derivedState.online,
    observationAgeSeconds: optionalNullableNumber(raw, 'observation_age_seconds'),
  }
}

function adaptRecentObservation(raw: RawRecord): RecentObservation {
  const heatIndexC = optionalNullableNumber(raw, 'heat_index_c')
  const windChillC = optionalNullableNumber(raw, 'wind_chill_c')

  return {
    observationTimeUtc: requiredString(raw, 'observation_time_utc'),
    observationTimeLocal: optionalString(raw, 'observation_time_local'),
    temperatureC: optionalNullableNumber(raw, 'temperature_c'),
    dewpointC: optionalNullableNumber(raw, 'dewpoint_c'),
    heatIndexC,
    windChillC,
    humidityPercent: optionalNullableNumber(raw, 'humidity_percent'),
    pressureHpa: optionalNullableNumber(raw, 'pressure_hpa'),
    windSpeedKmh: optionalNullableNumber(raw, 'wind_speed_kmh'),
    windSpeedMph: optionalNullableNumber(raw, 'wind_speed_mph'),
    windGustKmh: optionalNullableNumber(raw, 'wind_gust_kmh'),
    windGustMph: optionalNullableNumber(raw, 'wind_gust_mph'),
    windDirectionDegrees: optionalNullableNumber(raw, 'wind_direction_degrees'),
    rainRateMmPerHour: optionalNullableNumber(raw, 'rain_rate_mm_per_hour'),
    rainTodayMm: optionalNullableNumber(raw, 'rain_today_mm'),
    solarRadiationWm2: optionalNullableNumber(raw, 'solar_radiation_wm2'),
    uvIndex: optionalNullableNumber(raw, 'uv_index'),
  }
}

function adaptTodaySummary(raw: RawRecord): ProvisionalTodaySummary {
  return {
    metadata: validateJsonObject(
      validateRecord(raw.metadata, '/today.json.metadata'),
      '/today.json.metadata',
    ),
    currentObservation:
      raw.current_observation == null
        ? null
        : adaptCurrentConditions(
            validateRecord(raw.current_observation, '/today.json.current_observation'),
          ),
    maximumTemperature: adaptTodayTemperatureSummary(
      raw.maximum_temperature,
      '/today.json.maximum_temperature',
    ),
    minimumTemperature: adaptTodayTemperatureSummary(
      raw.minimum_temperature,
      '/today.json.minimum_temperature',
    ),
    rainfall: adaptTodayRainfallSummary(raw.rainfall, '/today.json.rainfall'),
    calendarDayExtremes: adaptCalendarDayExtremes(raw.calendar_day_extremes),
  }
}

function adaptClimateIndex(raw: RawRecord): ClimateIndex {
  const history = validateRecord(raw.history, '/climate/index.json.history')
  const station = validateRecord(raw.station, '/climate/index.json.station')

  return {
    status: optionalString(raw, 'status'),
    station: {
      id: requiredString(station, 'id'),
      name: requiredString(station, 'name'),
      country: requiredString(station, 'country'),
    },
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    history: {
      firstDate: optionalClimateDateString(history, 'first_date'),
      lastDate: optionalClimateDateString(history, 'last_date'),
      firstYear: optionalNullableNumber(history, 'first_year'),
      lastYear: optionalNullableNumber(history, 'last_year'),
      yearCount: optionalNullableNumber(history, 'year_count'),
    },
    normals: validateJsonObject(raw.normals, '/climate/index.json.normals'),
    dataQuality: validateJsonObject(raw.data_quality, '/climate/index.json.data_quality'),
    endpoints: validateJsonObject(raw.endpoints, '/climate/index.json.endpoints'),
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
      complete: optionalNullableBoolean(record, 'complete'),
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
      temperature: requiredString(units, 'temperature'),
      rainfall: requiredString(units, 'rainfall'),
      pressure: optionalString(units, 'pressure'),
      wind: optionalString(units, 'wind'),
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
    dateKey: requiredClimateDayKey(raw, 'date_key'),
    month: requiredNumber(raw, 'month'),
    day: requiredNumber(raw, 'day'),
    normalMaxTempC: optionalNullableNumber(raw, 'normal_max_temp_c'),
    normalMinTempC: optionalNullableNumber(raw, 'normal_min_temp_c'),
    normalMeanTempC: optionalNullableNumber(raw, 'normal_mean_temp_c'),
    maxSampleCount: requiredInteger(raw, 'max_sample_count'),
    minSampleCount: requiredInteger(raw, 'min_sample_count'),
  }
}

function adaptDailyNormalsPayload(raw: RawRecord): DailyNormalsPayload {
  const units = validateRecord(raw.units, '/climate/normals/daily.json.units')
  const records = validateArray(raw.records, '/climate/normals/daily.json.records').map(
    (entry, index) =>
      adaptDailyNormal(validateRecord(entry, `/climate/normals/daily.json.records[${index}]`)),
  )

  return {
    station: requiredString(raw, 'station'),
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    baseline: requiredString(raw, 'baseline'),
    units: {
      temperature: requiredString(units, 'temperature'),
    },
    recordCount: requiredNumber(raw, 'record_count'),
    records,
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

function adaptMonthlyNormalsPayload(raw: RawRecord): MonthlyNormalsPayload {
  const units = validateRecord(raw.units, '/climate/normals/monthly.json.units')
  const months = validateArray(raw.months, '/climate/normals/monthly.json.months').map(
    (entry, index) =>
      adaptMonthlyNormal(
        validateRecord(entry, `/climate/normals/monthly.json.months[${index}]`),
      ),
  )

  return {
    station: requiredString(raw, 'station'),
    generatedAtUtc: optionalString(raw, 'generated_at_utc'),
    baseline: requiredString(raw, 'baseline'),
    units: {
      temperature: requiredString(units, 'temperature'),
      rainfall: requiredString(units, 'rainfall'),
    },
    monthCount: requiredNumber(raw, 'month_count'),
    months,
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

function validateJsonObject(value: unknown, context: string): JsonObject {
  const record = validateRecord(value, context)
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key]) => key !== RECORD_PATH_SYMBOL.description)
      .map(([key, entryValue]) => [key, validateJsonValue(entryValue, `${context}.${key}`)]),
  )
}

function validateJsonValue(value: unknown, context: string): JsonValue {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) {
    return value ?? null
  }

  if (Array.isArray(value)) {
    return value.map((entry, index) => validateJsonValue(entry, `${context}[${index}]`))
  }

  if (typeof value === 'object') {
    return validateJsonObject(value, context)
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected JSON-compatible value for ${context}`,
    details: { path: context },
    retryable: false,
  })
}

function deriveFeelsLikeC(
  heatIndexC: number | null,
  windChillC: number | null,
): number | null {
  return heatIndexC ?? windChillC ?? null
}

function deriveStationLiveState(
  status: string,
  collectorStatus: string | null,
): Pick<StationStatus, 'online' | 'live'> {
  const normalizedStatus = status.trim().toLowerCase()
  const normalizedCollectorStatus = normalizeStatusValue(collectorStatus)
  const onlineStatusValues = new Set(['online', 'live', 'healthy', 'ok'])
  const liveCollectorStatusValues = new Set(['online', 'live', 'healthy', 'ok', 'running', 'collecting'])
  const offlineStatusValues = new Set(['offline', 'down', 'error', 'failed', 'stale'])

  if (
    offlineStatusValues.has(normalizedStatus) ||
    (normalizedCollectorStatus != null && offlineStatusValues.has(normalizedCollectorStatus))
  ) {
    return { online: false, live: false }
  }

  const online = onlineStatusValues.has(normalizedStatus)
  const live =
    online &&
    (normalizedCollectorStatus == null ||
      liveCollectorStatusValues.has(normalizedCollectorStatus))

  return {
    online: live || online,
    live,
  }
}

function normalizeStatusValue(value: string | null): string | null {
  return value == null ? null : value.trim().toLowerCase()
}

function adaptTodayTemperatureSummary(
  value: unknown,
  context: string,
): ProvisionalTodaySummary['maximumTemperature'] {
  if (value == null) {
    return null
  }

  const record = validateRecord(value, context)
  return {
    windowStartLocal: optionalString(record, 'window_start_local'),
    windowEndLocal: optionalString(record, 'window_end_local'),
    provisional: optionalNullableBoolean(record, 'provisional'),
    value: optionalNullableNumber(record, 'value'),
    timeLocal: optionalString(record, 'time_local'),
    coverage:
      record.coverage == null ? null : validateJsonObject(record.coverage, `${context}.coverage`),
  }
}

function adaptTodayRainfallSummary(
  value: unknown,
  context: string,
): ProvisionalTodaySummary['rainfall'] {
  if (value == null) {
    return null
  }

  const record = validateRecord(value, context)
  return {
    windowStartLocal: optionalString(record, 'window_start_local'),
    windowEndLocal: optionalString(record, 'window_end_local'),
    provisional: optionalNullableBoolean(record, 'provisional'),
    totalMm: optionalNullableNumber(record, 'total_mm'),
    timeLocal: optionalString(record, 'time_local'),
    coverage:
      record.coverage == null ? null : validateJsonObject(record.coverage, `${context}.coverage`),
  }
}

function adaptCalendarDayExtremes(
  value: unknown,
): ProvisionalTodaySummary['calendarDayExtremes'] {
  if (value == null) {
    return {}
  }

  const root = validateRecord(value, '/today.json.calendar_day_extremes')

  return Object.fromEntries(
    Object.entries(root).map(([key, entryValue]) => {
      const context = `/today.json.calendar_day_extremes.${key}`
      const record = validateRecord(entryValue, context)
      return [
        key,
        {
          value: validateJsonValue(record.value, `${context}.value`),
          timeLocal: optionalString(record, 'time_local'),
          provisional: optionalNullableBoolean(record, 'provisional'),
          coverage:
            record.coverage == null
              ? null
              : validateJsonObject(record.coverage, `${context}.coverage`),
          details: validateJsonObject(record, context),
        },
      ]
    }),
  )
}

function safeRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function deriveTopLevelKeys(value: unknown): readonly string[] {
  const record = safeRecord(value)
  return record == null ? [] : Object.keys(record)
}

function compactDiagnosticValue(value: unknown, depth = 0): unknown {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (depth >= 2) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`
    }

    return '[Object]'
  }

  if (Array.isArray(value)) {
    return {
      length: value.length,
      sample: value.slice(0, 2).map((entry) => compactDiagnosticValue(entry, depth + 1)),
    }
  }

  const record = safeRecord(value)
  if (record == null) {
    return String(value)
  }

  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 8)
      .map(([key, entryValue]) => [key, compactDiagnosticValue(entryValue, depth + 1)]),
  )
}

function summariseObject(
  record: Record<string, unknown> | null,
  nullabilitySources: readonly (Record<string, unknown> | null)[] = [record],
): {
  keys: readonly string[]
  fields: Record<
    string,
    {
      type: string
      mayBeNull: boolean
      sample: unknown
      arrayLength: number | null
    }
  >
} {
  if (record == null) {
    return {
      keys: [],
      fields: {},
    }
  }

  const keys = Object.keys(record)
  return {
    keys,
    fields: Object.fromEntries(
      keys.map((key) => {
        const value = record[key]
        const mayBeNull = nullabilitySources.some((source) => source?.[key] === null)
        return [
          key,
          {
            type: deriveDiagnosticValueType(value),
            mayBeNull,
            sample: compactDiagnosticValue(value, 1),
            arrayLength: Array.isArray(value) ? value.length : null,
          },
        ]
      }),
    ),
  }
}

function deriveDiagnosticValueType(value: unknown): string {
  if (value === null) {
    return 'null'
  }
  if (Array.isArray(value)) {
    return 'array'
  }
  return typeof value
}

function countNonNullValues(value: unknown): number {
  const record = safeRecord(value)
  if (record == null) {
    return 0
  }
  return Object.values(record).filter((entry) => entry != null).length
}

function findMostCompleteRecordIndex(values: readonly unknown[]): number | null {
  let bestIndex: number | null = null
  let bestScore = -1

  values.forEach((entry, index) => {
    const score = countNonNullValues(entry)
    if (score > bestScore) {
      bestScore = score
      bestIndex = index
    }
  })

  return bestIndex
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

function requiredClimateDayKey(record: RawRecord, key: string): string {
  const value = requiredString(record, key)
  const match = CLIMATE_DAY_KEY_PATTERN.exec(value)
  if (!match) {
    throw new PublicApiError({
      code: 'MALFORMED_DATA',
      message: `Expected MM-DD climate day key for "${key}"`,
      details: { key, path: `${deriveRecordPath(record)}.${key}` },
      retryable: false,
    })
  }

  const month = Number(match[1])
  const day = Number(match[2])
  const maxDayByMonth = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  const maxDay = maxDayByMonth[month - 1]
  if (!Number.isInteger(month) || !Number.isInteger(day) || month < 1 || month > 12 || day < 1) {
    throw new PublicApiError({
      code: 'MALFORMED_DATA',
      message: `Expected MM-DD climate day key for "${key}"`,
      details: { key, path: `${deriveRecordPath(record)}.${key}` },
      retryable: false,
    })
  }

  if (maxDay == null || day > maxDay) {
    throw new PublicApiError({
      code: 'MALFORMED_DATA',
      message: `Expected valid climate day key for "${key}"`,
      details: { key, path: `${deriveRecordPath(record)}.${key}` },
      retryable: false,
    })
  }

  return value
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

function requiredInteger(record: RawRecord, key: string): number {
  const value = requiredNumber(record, key)
  if (Number.isInteger(value)) {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected integer for "${key}"`,
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

function optionalNullableBoolean(record: RawRecord, key: string): boolean | null {
  const value = record[key]
  if (value == null) {
    return null
  }

  if (typeof value === 'boolean') {
    return value
  }

  throw new PublicApiError({
    code: 'MALFORMED_DATA',
    message: `Expected boolean or null for "${key}"`,
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
