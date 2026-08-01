import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

export type ArchiveView = 'annual' | 'monthly'

const YEAR_PATTERN = /^\d{4}$/
const MONTH_PATTERN = /^(?:[1-9]|1[0-2])$/

/**
 * Manages year/month/view selection via URL search params.
 * - ?year=YYYY  — selected year (defaults to latest available)
 * - ?month=M    — selected month 1–12 (absent = annual view)
 */
export function useArchiveSelection(availableYears: readonly number[]) {
  const [searchParams, setSearchParams] = useSearchParams()

  const latestYear =
    availableYears.length > 0
      ? Math.max(...availableYears)
      : new Date().getFullYear()

  const yearParam = searchParams.get('year')
  const monthParam = searchParams.get('month')

  const parsedYear =
    yearParam != null && YEAR_PATTERN.test(yearParam) ? Number(yearParam) : null

  const year =
    parsedYear != null && availableYears.length > 0
      ? availableYears.includes(parsedYear)
        ? parsedYear
        : latestYear
      : parsedYear ?? latestYear

  const parsedMonth =
    monthParam != null && MONTH_PATTERN.test(monthParam) ? Number(monthParam) : null

  const month: number | null =
    parsedMonth != null && parsedMonth >= 1 && parsedMonth <= 12 ? parsedMonth : null

  const view: ArchiveView = month != null ? 'monthly' : 'annual'

  const setYear = useCallback(
    (newYear: number) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          next.set('year', String(newYear))
          next.delete('month')
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  const setMonth = useCallback(
    (newMonth: number | null) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev)
          if (newMonth != null) {
            next.set('month', String(newMonth))
          } else {
            next.delete('month')
          }
          return next
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  return { year, month, view, setYear, setMonth }
}
