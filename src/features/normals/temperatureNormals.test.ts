import { describe, expect, it } from 'vitest'
import { TEMP_MONTHLY_NORMALS_C } from './temperatureNormals'

describe('1991–2020 temperature normals', () => {
  it('matches the supplied January–December maximum, minimum, and mean normals', () => {
    expect(TEMP_MONTHLY_NORMALS_C).toEqual({
      max: [7.3, 8, 10.4, 13, 16.6, 19.1, 21.5, 21.5, 18.5, 14.3, 10, 7.8],
      min: [1.9, 1.9, 2.7, 4.7, 7.1, 10, 12.2, 12, 10, 7.2, 4.4, 2.5],
      mean: [4.6, 4.9, 6.5, 8.9, 11.8, 14.5, 16.9, 16.8, 14.2, 10.7, 7.2, 5.1],
    })
  })
})
