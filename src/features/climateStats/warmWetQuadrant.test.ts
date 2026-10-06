import { describe, expect, it } from 'vitest'
import { clampWarmWetQuadrant, warmWetQuadrantBounds } from './warmWetQuadrant'

describe('warm/wet quadrant bounds', () => {
  it('fits the data extrema without rounding the axes up', () => {
    expect(
      warmWetQuadrantBounds([
        clampWarmWetQuadrant(-2.3, 80),
        clampWarmWetQuadrant(4.5, 255),
      ]),
    ).toEqual({
      minAnomalyC: -2.3,
      maxAnomalyC: 4.5,
      maxRainfallPercent: 255,
    })
  })

  it('retains the hard caps when observations exceed them', () => {
    expect(
      warmWetQuadrantBounds([
        clampWarmWetQuadrant(-9, 700),
        clampWarmWetQuadrant(8, 200),
      ]),
    ).toEqual({
      minAnomalyC: -6,
      maxAnomalyC: 6,
      maxRainfallPercent: 500,
    })
  })

  it('keeps the normal reference visible for one-sided or dry data', () => {
    expect(warmWetQuadrantBounds([clampWarmWetQuadrant(4.5, 0)])).toEqual({
      minAnomalyC: 0,
      maxAnomalyC: 4.5,
      maxRainfallPercent: 100,
    })
    expect(warmWetQuadrantBounds([clampWarmWetQuadrant(-2.3, 50)])).toEqual({
      minAnomalyC: -2.3,
      maxAnomalyC: 0,
      maxRainfallPercent: 100,
    })
  })

  it('avoids a zero-width temperature axis for empty or zero-anomaly data', () => {
    for (const points of [[], [clampWarmWetQuadrant(0, 255)]]) {
      expect(warmWetQuadrantBounds(points)).toMatchObject({
        minAnomalyC: -1,
        maxAnomalyC: 1,
      })
    }
  })
})

describe('warm/wet quadrant clipping', () => {
  it('retains values inside the maximum axis ranges', () => {
    expect(clampWarmWetQuadrant(1.5, 100)).toEqual({
      x: 1.5,
      y: 100,
      clampedX: false,
      clampedY: false,
    })
    expect(clampWarmWetQuadrant(-6, 500)).toEqual({
      x: -6,
      y: 500,
      clampedX: false,
      clampedY: false,
    })
  })

  it('pins out-of-range values to the axis limits and reports each clipped axis', () => {
    expect(clampWarmWetQuadrant(-9, 700)).toEqual({
      x: -6,
      y: 500,
      clampedX: true,
      clampedY: true,
    })
    expect(clampWarmWetQuadrant(7, -10)).toEqual({
      x: 6,
      y: 0,
      clampedX: true,
      clampedY: true,
    })
    expect(clampWarmWetQuadrant(0, 700)).toMatchObject({
      clampedX: false,
      clampedY: true,
    })
  })
})
