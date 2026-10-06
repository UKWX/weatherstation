export const TEMPERATURE_ANOMALY_LIMIT_C = 6
export const RAINFALL_PERCENT_LIMIT = 500

export function getWarmWetQuadrantAxisLimits(
  points: readonly {
    readonly anomalyC: number
    readonly rainfallPercent: number
  }[],
) {
  const maxAnomaly = points.reduce(
    (maximum, point) =>
      Number.isFinite(point.anomalyC)
        ? Math.max(maximum, Math.abs(point.anomalyC))
        : maximum,
    TEMPERATURE_ANOMALY_LIMIT_C,
  )
  const maxRainfall = points.reduce(
    (maximum, point) =>
      Number.isFinite(point.rainfallPercent)
        ? Math.max(maximum, point.rainfallPercent)
        : maximum,
    RAINFALL_PERCENT_LIMIT,
  )

  return {
    temperature: Math.ceil(maxAnomaly / 2) * 2,
    rainfall: Math.ceil(maxRainfall / 100) * 100,
  }
}
