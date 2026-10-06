export const TEMPERATURE_ANOMALY_LIMIT_C = 6
export const RAINFALL_PERCENT_LIMIT = 500

export interface QuadrantPoint {
  readonly x: number
  readonly y: number
  readonly clampedX: boolean
  readonly clampedY: boolean
}

export function warmWetQuadrantBounds(points: readonly QuadrantPoint[]) {
  let minAnomalyC = 0
  let maxAnomalyC = 0
  let maxRainfallPercent = 100
  for (const point of points) {
    minAnomalyC = Math.min(minAnomalyC, point.x)
    maxAnomalyC = Math.max(maxAnomalyC, point.x)
    maxRainfallPercent = Math.max(maxRainfallPercent, point.y)
  }
  return {
    minAnomalyC: minAnomalyC === maxAnomalyC ? -1 : minAnomalyC,
    maxAnomalyC: minAnomalyC === maxAnomalyC ? 1 : maxAnomalyC,
    maxRainfallPercent,
  }
}

export function clampWarmWetQuadrant(
  anomalyC: number,
  rainfallPercent: number,
): QuadrantPoint {
  return {
    x: Math.max(
      -TEMPERATURE_ANOMALY_LIMIT_C,
      Math.min(TEMPERATURE_ANOMALY_LIMIT_C, anomalyC),
    ),
    y: Math.max(0, Math.min(RAINFALL_PERCENT_LIMIT, rainfallPercent)),
    clampedX:
      anomalyC < -TEMPERATURE_ANOMALY_LIMIT_C ||
      anomalyC > TEMPERATURE_ANOMALY_LIMIT_C,
    clampedY: rainfallPercent < 0 || rainfallPercent > RAINFALL_PERCENT_LIMIT,
  }
}
