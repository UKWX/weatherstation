export interface QuadrantPoint { readonly x: number; readonly y: number; readonly clampedX: boolean; readonly clampedY: boolean }
export function clampWarmWetQuadrant(anomalyC: number, rainfallPercent: number): QuadrantPoint {
  return { x: Math.max(-3, Math.min(3, anomalyC)), y: Math.max(0, Math.min(275, rainfallPercent)), clampedX: anomalyC < -3 || anomalyC > 3, clampedY: rainfallPercent < 0 || rainfallPercent > 275 }
}
