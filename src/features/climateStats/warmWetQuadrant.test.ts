import { describe, expect, it } from 'vitest'
import { clampWarmWetQuadrant } from './warmWetQuadrant'

describe('warm/wet quadrant clipping', () => {
  it('retains interior values without marking them clamped', () => {
    expect(clampWarmWetQuadrant(1.5, 100)).toEqual({
      x: 1.5, y: 100, clampedX: false, clampedY: false,
    })
    expect(clampWarmWetQuadrant(-6, 500)).toEqual({
      x: -6, y: 500, clampedX: false, clampedY: false,
    })
  })

  it('clips both axes at their limits and reports each clipped axis independently', () => {
    expect(clampWarmWetQuadrant(-9, 700)).toEqual({
      x: -6, y: 500, clampedX: true, clampedY: true,
    })
    expect(clampWarmWetQuadrant(7, -10)).toEqual({
      x: 6, y: 0, clampedX: true, clampedY: true,
    })
    expect(clampWarmWetQuadrant(0, 700)).toMatchObject({ clampedX: false, clampedY: true })
  })
})
