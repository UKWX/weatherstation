export const TEMPERATURE_ANOMALY_LIMIT_C = 6
export const RAINFALL_PERCENT_LIMIT = 500

export interface QuadrantPoint {
  readonly x: number
  readonly y: number
  readonly clampedX: boolean
  readonly clampedY: boolean
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
