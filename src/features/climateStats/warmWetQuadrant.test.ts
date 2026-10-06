import { describe, expect, it } from 'vitest'
import { getWarmWetQuadrantAxisLimits } from './warmWetQuadrant'

describe('warm/wet quadrant axis limits', () => {
  it('keeps the axes at least as wide as the supported ranges', () => {
    expect(
      getWarmWetQuadrantAxisLimits([{ anomalyC: 1.5, rainfallPercent: 100 }]),
    ).toEqual({
      temperature: 6,
      rainfall: 500,
    })
  })

  it('expands axes to include values beyond the supported ranges', () => {
    expect(
      getWarmWetQuadrantAxisLimits([
        { anomalyC: -9, rainfallPercent: 700 },
        { anomalyC: 7, rainfallPercent: 501 },
      ]),
    ).toEqual({
      temperature: 10,
      rainfall: 700,
    })
  })

  it('ignores non-finite values when finding axis limits', () => {
    expect(
      getWarmWetQuadrantAxisLimits([
        { anomalyC: Number.NaN, rainfallPercent: Number.POSITIVE_INFINITY },
      ]),
    ).toEqual({
      temperature: 6,
      rainfall: 500,
    })
  })
})
