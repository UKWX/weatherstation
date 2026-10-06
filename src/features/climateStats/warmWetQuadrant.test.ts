import { describe, expect, it } from 'vitest'
import { clampWarmWetQuadrant } from './warmWetQuadrant'

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
