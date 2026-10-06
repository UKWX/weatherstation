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
      day(`2024-02-${String(index + 1).padStart(2, '0')}` as ClimateDay['date'], 12, 2))
    const cells = buildTemperatureAnomalyGrid([...february, day('2024-02-28', null, 2)], 2024, 2024)
    expect(cells[1]).toMatchObject({
      meanC: 7, anomalyC: 7 - TEMP_MONTHLY_NORMALS_C.mean[1], complete: true,
    })
    expect(buildTemperatureAnomalyGrid(february.slice(0, 26), 2024, 2024)[1]).toMatchObject({
      complete: false, anomalyC: 7 - TEMP_MONTHLY_NORMALS_C.mean[1], meanC: 7,
    })
  })

  it('does not count duplicate days or provisional months as complete', () => {
    const days = Array.from({ length: 28 }, (_, index) =>
      day(`2023-02-${String(index + 1).padStart(2, '0')}` as ClimateDay['date'], 10, 0))
    expect(buildTemperatureAnomalyGrid([...days, day('2023-02-01', 10, 0, 'provisional')], 2023, 2023)[1])
      .toMatchObject({ complete: false, anomalyC: 5 - TEMP_MONTHLY_NORMALS_C.mean[1] })
    expect(buildTemperatureAnomalyGrid([...days.slice(0, 24), ...days.slice(0, 4)], 2023, 2023)[1])
      .toMatchObject({ complete: false, anomalyC: 5 - TEMP_MONTHLY_NORMALS_C.mean[1] })
  })

  it.each([
    ['mean', 6, 1.4],
    ['max', 12, 4.7],
    ['min', 2, 0.1],
  ] as const)('subtracts the supplied %s normal from the monthly average', (metric, meanC, anomalyC) => {
    const records = [
      { ...day('2023-01-01', 10, 0), meanTempC: 5 },
      { ...day('2023-01-02', 14, 4), meanTempC: 7 },
    ]
    const cell = buildTemperatureAnomalyGrid(records, 2023, 2023, metric)[0]!
    expect(cell.meanC).toBe(meanC)
    expect(cell.anomalyC).toBeCloseTo(anomalyC)
  })

  it('uses recorded daily means and falls back to paired temperatures when absent', () => {
    const records = [
      { ...day('2023-01-01', 20, 0), meanTempC: 6 },
      day('2023-01-02', 12, 4),
      { ...day('2023-01-03', null, null), meanTempC: 7 },
      day('2023-01-04', null, 4),
    ]
    expect(buildTemperatureAnomalyGrid(records, 2023, 2023)[0]).toMatchObject({
      meanC: 7,
    })
    expect(buildTemperatureAnomalyGrid(records, 2023, 2023)[0]!.anomalyC).toBeCloseTo(2.4)
  })

  it.each(['max', 'min'] as const)('does not require the other temperature for %s coverage', (metric) => {
    const records = Array.from({ length: 28 }, (_, index) =>
      day(`2023-01-${String(index + 1).padStart(2, '0')}` as ClimateDay['date'],
        metric === 'max' ? 10 : null, metric === 'min' ? 2 : null))
    expect(buildTemperatureAnomalyGrid(records, 2023, 2023, metric)[0]).toMatchObject({
      meanC: metric === 'max' ? 10 : 2, complete: true,
    })
    expect(buildTemperatureAnomalyGrid(records.slice(0, 27), 2023, 2023, metric)[0]!.complete).toBe(false)
    expect(buildTemperatureAnomalyGrid(records, 2023, 2023)[0]!.meanC).toBeNull()
  })

  it.each(['mean', 'max', 'min'] as const)('ignores non-finite readings in %s mode', (metric) => {
    const records = [
      day('2023-01-01', NaN, Infinity),
      { ...day('2023-01-02', null, null), meanTempC: Infinity },
      { ...day('2023-01-03', 10, 2), meanTempC: 6 },
    ]
    const cell = buildTemperatureAnomalyGrid(records, 2023, 2023, metric)[0]!
    expect(cell.meanC).toBe(metric === 'max' ? 10 : metric === 'min' ? 2 : 6)
    expect(Number.isFinite(cell.anomalyC)).toBe(true)
    expect(cell.complete).toBe(false)
  })
})
