import { daysInMonth, parseIsoClimateDate } from '@/lib/climate'
import type { ClimateDateString } from '@/types/weather'

export const RAIN_NORMAL_PERIOD = '1991–2020'
export const RAIN_MONTHLY_NORMALS_MM = [53.5, 47.3, 43.4, 46.2, 43.3, 64.8, 54.7, 60.1, 53.1, 65.9, 59.2, 65.9] as const
export const ANNUAL_RAIN_NORMAL_MM = 657.4

function cumulativeMonthlyNormals(): number[] {
  const values: number[] = [0]
  let total = 0
  for (const monthly of RAIN_MONTHLY_NORMALS_MM) {
    total += monthly
    values.push(total)
  }
  return values
}

function buildKnots(year: number): { readonly x: number[]; readonly y: number[] } {
  const x = [0]
  let dayTotal = 0
  for (let month = 1; month <= 12; month += 1) {
    dayTotal += daysInMonth(year, month)
    x.push(dayTotal)
  }
  return { x, y: cumulativeMonthlyNormals() }
}

function computePchipDerivatives(x: readonly number[], y: readonly number[]): number[] {
  const n = x.length
  if (n < 2) {
    return Array(n).fill(0)
  }
  const h = Array.from({ length: n - 1 }, (_, index) => x[index + 1]! - x[index]!)
  const delta = Array.from({ length: n - 1 }, (_, index) => (y[index + 1]! - y[index]!) / h[index]!)
  const d = Array(n).fill(0)

  if (n === 2) {
    d[0] = delta[0]!
    d[1] = delta[0]!
    return d
  }

  const endpoint = (h0: number, h1: number, delta0: number, delta1: number) => {
    const value = ((2 * h0 + h1) * delta0 - h0 * delta1) / (h0 + h1)
    if (Math.sign(value) !== Math.sign(delta0)) {
      return 0
    }
    if (Math.sign(delta0) !== Math.sign(delta1) && Math.abs(value) > Math.abs(3 * delta0)) {
      return 3 * delta0
    }
    return value
  }

  d[0] = endpoint(h[0]!, h[1]!, delta[0]!, delta[1]!)
  d[n - 1] = endpoint(h[n - 2]!, h[n - 3]!, delta[n - 2]!, delta[n - 3]!)

  for (let index = 1; index < n - 1; index += 1) {
    const previous = delta[index - 1]!
    const next = delta[index]!
    if (previous === 0 || next === 0 || Math.sign(previous) !== Math.sign(next)) {
      d[index] = 0
      continue
    }
    const w1 = 2 * h[index]! + h[index - 1]!
    const w2 = h[index]! + 2 * h[index - 1]!
    d[index] = (w1 + w2) / (w1 / previous + w2 / next)
  }

  return d
}

function evaluatePchip(x: readonly number[], y: readonly number[], d: readonly number[], target: number): number {
  if (target <= x[0]!) {
    return y[0]!
  }
  if (target >= x[x.length - 1]!) {
    return y[y.length - 1]!
  }

  let interval = 0
  while (interval < x.length - 2 && target > x[interval + 1]!) {
    interval += 1
  }

  const x0 = x[interval]!
  const x1 = x[interval + 1]!
  const y0 = y[interval]!
  const y1 = y[interval + 1]!
  const d0 = d[interval]!
  const d1 = d[interval + 1]!
  const h = x1 - x0
  const t = (target - x0) / h
  const t2 = t * t
  const t3 = t2 * t

  return (
    (2 * t3 - 3 * t2 + 1) * y0 +
    (t3 - 2 * t2 + t) * h * d0 +
    (-2 * t3 + 3 * t2) * y1 +
    (t3 - t2) * h * d1
  )
}

export function dailyCumulativeNormal(year: number): number[] {
  const { x, y } = buildKnots(year)
  const derivatives = computePchipDerivatives(x, y)
  const days = x[x.length - 1]!
  return Array.from({ length: days }, (_, index) => evaluatePchip(x, y, derivatives, index + 1))
}

export function dailyNormalRain(year: number): number[] {
  const cumulative = dailyCumulativeNormal(year)
  return cumulative.map((value, index) => value - (index === 0 ? 0 : cumulative[index - 1]!))
}

export function normalToDate(year: number, date: ClimateDateString | string): number {
  const parts = parseIsoClimateDate(String(date))
  if (parts.year !== year) {
    throw new RangeError(`Date ${date} does not belong to year ${year}`)
  }
  let dayOfYear = 0
  for (let month = 1; month < parts.month; month += 1) {
    dayOfYear += daysInMonth(year, month)
  }
  dayOfYear += parts.day
  return dailyCumulativeNormal(year)[dayOfYear - 1] ?? 0
}

export function monthNormal(monthIndex: number): number {
  return RAIN_MONTHLY_NORMALS_MM[monthIndex] ?? 0
}
