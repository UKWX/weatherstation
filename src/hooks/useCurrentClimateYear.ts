import { useEffect, useState } from 'react'
import { getEuropeLondonClimateDate, parseIsoClimateDate } from '@/lib/climate'

export function getCurrentClimateYear(now: Date = new Date()): number {
  return parseIsoClimateDate(getEuropeLondonClimateDate(now)).year
}

export function useCurrentClimateYear(): number {
  const [year, setYear] = useState(() => getCurrentClimateYear())

  useEffect(() => {
    const updateYear = () => {
      setYear(getCurrentClimateYear())
    }

    updateYear()
    const intervalId = window.setInterval(updateYear, 60_000)
    return () => {
      window.clearInterval(intervalId)
    }
  }, [])

  return year
}
