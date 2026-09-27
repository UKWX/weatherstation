import { describe, expect, it } from 'vitest'
import {
  dailyCumulativeNormal,
  dailyNormalRain,
  monthNormal,
  normalToDate,
  RAIN_MONTHLY_NORMALS_MM,
  RAIN_NORMAL_PERIOD,
} from '@/features/normals/rainfallNormals'
import { daysInMonth } from '@/lib/climate'

function monthEndIndex(year: number, month: number): number {
  let total = 0
  for (let current = 1; current <= month; current += 1) {
    total += daysInMonth(year, current)
  }
  return total - 1
}

describe('rainfallNormals', () => {
  it('exposes the fixed rainfall normal period and monthly values', () => {
    expect(RAIN_NORMAL_PERIOD).toBe('1991–2020')
    expect(RAIN_MONTHLY_NORMALS_MM).toHaveLength(12)
    expect(RAIN_MONTHLY_NORMALS_MM.reduce((sum, value) => sum + value, 0)).toBeCloseTo(657.4, 6)
  })

  it('returns one cumulative value per day for common and leap years', () => {
    expect(dailyCumulativeNormal(2025)).toHaveLength(365)
    expect(dailyCumulativeNormal(2024)).toHaveLength(366)
  })

  it('hits each month-end cumulative total within tolerance', () => {
    const year = 2025
    const cumulative = dailyCumulativeNormal(year)
    let total = 0
    RAIN_MONTHLY_NORMALS_MM.forEach((value, index) => {
      total += value
      expect(cumulative[monthEndIndex(year, index + 1)]).toBeCloseTo(total, 1)
    })
  })

  it('is non-decreasing and ends at the annual total', () => {
    const cumulative = dailyCumulativeNormal(2026)
    for (let index = 1; index < cumulative.length; index += 1) {
      expect(cumulative[index]!).toBeGreaterThanOrEqual(cumulative[index - 1]! - 1e-9)
    }
    expect(cumulative.at(-1)).toBeCloseTo(657.4, 1)
  })

  it('derives daily normals and helpers consistently', () => {
    const year = 2026
    const daily = dailyNormalRain(year)
    const cumulative = dailyCumulativeNormal(year)
    expect(daily).toHaveLength(cumulative.length)
    expect(daily.reduce((sum, value) => sum + value, 0)).toBeCloseTo(657.4, 1)
    expect(normalToDate(year, '2026-08-31')).toBeCloseTo(cumulative[monthEndIndex(year, 8)]!, 6)
    expect(monthNormal(0)).toBeCloseTo(53.5, 6)
    expect(monthNormal(11)).toBeCloseTo(65.9, 6)
  })
})
