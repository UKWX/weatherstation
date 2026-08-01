import { loadMinuteArchiveRange } from '@/features/customGraphs/archive'
import {
  enumerateClimateDates,
  getLondonClimateDateForTimestamp,
} from '@/features/customGraphs/time'
import type { MinuteArchiveObservation } from '@/features/customGraphs/types'
import type { ClimateDateString, RecentObservation } from '@/types/weather'

export interface LiveRangeExtensionResult {
  readonly observations: readonly RecentObservation[]
  readonly requestedStartMs: number
  readonly requestedEndMs: number
  readonly coveredStartMs: number | null
  readonly coveredEndMs: number | null
  readonly isPartialCoverage: boolean
  readonly loadedDates: readonly ClimateDateString[]
  readonly warningMessages: readonly string[]
}

export async function extendRecentObservationsForRange(
  recentObservations: readonly RecentObservation[],
  requestedStartMs: number,
  requestedEndMs: number,
  signal?: AbortSignal,
): Promise<LiveRangeExtensionResult> {
  const loadedDates = determineArchiveDatesForRange(requestedStartMs, requestedEndMs)

  const archiveRange = await loadMinuteArchiveRange(loadedDates, { signal })
  const merged = mergeRecentAndArchiveObservations(
    recentObservations,
    archiveRange.observations.map(mapMinuteArchiveObservationToRecentObservation),
  ).filter((observation) => {
    const timestamp = new Date(observation.observationTimeUtc).valueOf()
    return !Number.isNaN(timestamp) && timestamp >= requestedStartMs && timestamp <= requestedEndMs
  })

  const sorted = [...merged].sort(
    (left, right) =>
      new Date(left.observationTimeUtc).valueOf() -
      new Date(right.observationTimeUtc).valueOf(),
  )
  const coveredStartMs =
    sorted.length > 0 ? new Date(sorted[0]!.observationTimeUtc).valueOf() : null
  const coveredEndMs =
    sorted.length > 0
      ? new Date(sorted[sorted.length - 1]!.observationTimeUtc).valueOf()
      : null

  return {
    observations: sorted,
    requestedStartMs,
    requestedEndMs,
    coveredStartMs,
    coveredEndMs,
    isPartialCoverage:
      coveredStartMs == null ||
      coveredEndMs == null ||
      coveredStartMs > requestedStartMs ||
      coveredEndMs < requestedEndMs,
    loadedDates,
    warningMessages: archiveRange.warningMessages,
  }
}

export function determineArchiveDatesForRange(
  requestedStartMs: number,
  requestedEndMs: number,
): readonly ClimateDateString[] {
  const startDate = getLondonClimateDateForTimestamp(requestedStartMs)
  const endDate = getLondonClimateDateForTimestamp(requestedEndMs)
  return enumerateClimateDates(startDate, endDate)
}

export function mergeRecentAndArchiveObservations(
  recentObservations: readonly RecentObservation[],
  archiveObservations: readonly RecentObservation[],
): RecentObservation[] {
  const merged = new Map<string, RecentObservation>()

  for (const observation of archiveObservations) {
    merged.set(observation.observationTimeUtc, observation)
  }

  for (const observation of recentObservations) {
    merged.set(observation.observationTimeUtc, observation)
  }

  return [...merged.values()].sort(
    (left, right) =>
      new Date(left.observationTimeUtc).valueOf() -
      new Date(right.observationTimeUtc).valueOf(),
  )
}

export function mapMinuteArchiveObservationToRecentObservation(
  observation: MinuteArchiveObservation,
): RecentObservation {
  return {
    observationTimeUtc: observation.observationTimeUtc,
    observationTimeLocal: null,
    temperatureC: observation.temperatureC,
    dewpointC: null,
    heatIndexC: null,
    windChillC: null,
    humidityPercent: observation.humidityPercent,
    pressureHpa: observation.pressureHpa,
    windSpeedKmh: null,
    windSpeedMph: observation.windSpeedMph,
    windGustKmh: null,
    windGustMph: observation.windGustMph,
    windDirectionDegrees: null,
    rainRateMmPerHour: observation.rainRateMmPerHour,
    rainTodayMm: observation.rainTodayMm,
    solarRadiationWm2: null,
    uvIndex: null,
  }
}
