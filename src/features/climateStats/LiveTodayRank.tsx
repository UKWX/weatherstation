import { Link } from 'react-router-dom'
import { useAnnualClimateQueries, useClimateArchiveIndexQuery, useTodaySummaryQuery } from '@/hooks/usePublicWeatherQueries'
import { getEuropeLondonClimateDate } from '@/lib/climate'
import { rankOnThisDay } from './onThisDay'

export function LiveTodayRank({ maxSoFar }: { readonly maxSoFar: number | null }) {
  const index = useClimateArchiveIndexQuery()
  const summary = useTodaySummaryQuery()
  const dailyMax = summary.data?.maximumTemperature?.value ?? maxSoFar
  const years = (index.data?.years ?? []).map((year) => year.year)
  const queries = useAnnualClimateQueries(years, { enabled: dailyMax != null })
  const today = getEuropeLondonClimateDate()
  const values = queries.flatMap((query) => (query.data?.records ?? [])
    .filter((record) => record.date.slice(5) === today.slice(5) && record.date !== today && record.maxTempC != null)
    .map((record) => record.maxTempC!))
  if (dailyMax == null || values.length === 0) return null
  const rank = rankOnThisDay(values, dailyMax, true)
  const suffix = rank % 100 >= 11 && rank % 100 <= 13 ? 'th' : rank % 10 === 1 ? 'st' : rank % 10 === 2 ? 'nd' : rank % 10 === 3 ? 'rd' : 'th'
  const date = new Date(`${today}T12:00:00Z`)
  const label = `${date.getUTCDate()} ${date.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`
  return <p className="archive-obs-note">
    <Link to={`/on-this-day?month=${date.getUTCMonth() + 1}&day=${date.getUTCDate()}`}>
      Today&apos;s max so far is the {rank}{suffix} warmest {label} since 1995
    </Link>
  </p>
}
