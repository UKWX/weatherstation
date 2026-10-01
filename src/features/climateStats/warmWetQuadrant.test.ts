import { describe, expect, it } from 'vitest'
import { clampWarmWetQuadrant } from './warmWetQuadrant'

describe('warm/wet quadrant clipping', () => {
  it('retains interior values without marking them clamped', () => {
    expect(clampWarmWetQuadrant(1.5, 100)).toEqual({
      x: 1.5, y: 100, clampedX: false, clampedY: false,
    })
    expect(clampWarmWetQuadrant(-3, 275)).toEqual({
      x: -3, y: 275, clampedX: false, clampedY: false,
    })
  })

  it('clips both axes at their limits and reports each clipped axis independently', () => {
    expect(clampWarmWetQuadrant(-9, 300)).toEqual({
      x: -3, y: 275, clampedX: true, clampedY: true,
    })
    expect(clampWarmWetQuadrant(7, -10)).toEqual({
      x: 3, y: 0, clampedX: true, clampedY: true,
    })
    expect(clampWarmWetQuadrant(0, 300)).toMatchObject({ clampedX: false, clampedY: true })
  })
})
