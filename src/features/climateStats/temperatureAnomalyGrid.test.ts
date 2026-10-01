import { describe, expect, it } from 'vitest'
import { TEMP_MONTHLY_NORMALS_C } from '@/features/normals/temperatureNormals'
import type { ClimateDay } from '@/types/weather'
import { buildTemperatureAnomalyGrid } from './temperatureAnomalyGrid'

const day = (date: ClimateDay['date'], maxTempC: number | null, minTempC: number | null,
  status: ClimateDay['status'] = 'finalised'): ClimateDay =>
  ({ date, maxTempC, minTempC, meanTempC: null, rainfallMm: null, status })

describe('temperature anomaly grid', () => {
  it('emits all twelve months in each year with no invented observations', () => {
    const cells = buildTemperatureAnomalyGrid([], 2023, 2024)
    expect(cells).toHaveLength(24)
    expect(cells[0]).toEqual({ year: 2023, month: 1, meanC: null, anomalyC: null, complete: false })
    expect(cells[23]).toMatchObject({ year: 2024, month: 12, anomalyC: null })
  })

  it('uses paired daily temperatures, a 90% calendar-day threshold, and leap years', () => {
    const february = Array.from({ length: 27 }, (_, index) =>
      day(`2024-02-${String(index + 1).padStart(2, '0')}`, 12, 2))
    const cells = buildTemperatureAnomalyGrid([...february, day('2024-02-28', null, 2)], 2024, 2024)
    expect(cells[1]).toMatchObject({
      meanC: 7, anomalyC: 7 - TEMP_MONTHLY_NORMALS_C.mean[1], complete: true,
    })
    expect(buildTemperatureAnomalyGrid(february.slice(0, 26), 2024, 2024)[1]).toMatchObject({
      complete: false, anomalyC: null, meanC: 7,
    })
  })

  it('does not count duplicate days or provisional months as complete', () => {
    const days = Array.from({ length: 28 }, (_, index) =>
      day(`2023-02-${String(index + 1).padStart(2, '0')}`, 10, 0))
    expect(buildTemperatureAnomalyGrid([...days, day('2023-02-01', 10, 0, 'provisional')], 2023, 2023)[1])
      .toMatchObject({ complete: false, anomalyC: null })
    expect(buildTemperatureAnomalyGrid([...days.slice(0, 24), ...days.slice(0, 4)], 2023, 2023)[1])
      .toMatchObject({ complete: false, anomalyC: null })
  })
})
