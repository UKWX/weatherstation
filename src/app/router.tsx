import { lazy, Suspense } from 'react'
import { Routes, Route, NavLink } from 'react-router-dom'

const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const LiveDataPage = lazy(() => import('@/pages/LiveDataPage'))
const CustomGraphsPage = lazy(() => import('@/pages/CustomGraphsPage'))
const ClimateArchivePage = lazy(() => import('@/pages/ClimateArchivePage'))
const NormalsAnomaliesPage = lazy(() => import('@/pages/NormalsAnomaliesPage'))
const RecordsPage = lazy(() => import('@/pages/RecordsPage'))
const ComparisonsPage = lazy(() => import('@/pages/ComparisonsPage'))
const ReportsPage = lazy(() => import('@/pages/ReportsPage'))
const ClimateCalendarPage = lazy(() => import('@/pages/ClimateCalendarPage'))
const OnThisDayPage = lazy(() => import('@/pages/OnThisDayPage'))
const StationInformationPage = lazy(
  () => import('@/pages/StationInformationPage'),
)
const DataCorrectionsPage = lazy(() => import('@/pages/DataCorrectionsPage'))

const NAV_LINKS = [
  { to: '/', label: 'Overview', end: true },
  { to: '/live-data', label: 'Live Data' },
  { to: '/custom-graphs', label: 'Custom Graphs' },
  { to: '/climate-archive', label: 'Climate Archive' },
  { to: '/normals-anomalies', label: 'Normals & Anomalies' },
  { to: '/records', label: 'Records' },
  { to: '/comparisons', label: 'Comparisons' },
  { to: '/reports', label: 'Reports' },
  { to: '/climate-calendar', label: 'Climate Calendar' },
  { to: '/on-this-day', label: 'On This Day' },
  { to: '/station-information', label: 'Station Information' },
  { to: '/data-corrections', label: 'Data Corrections' },
] as const

function Navigation() {
  return (
    <nav aria-label="Main navigation">
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {NAV_LINKS.map(({ to, label, ...rest }) => (
          <li key={to}>
            <NavLink
              to={to}
              {...('end' in rest ? { end: rest.end } : {})}
              style={({ isActive }) => ({
                display: 'block',
                padding: '0.5rem 1rem',
                textDecoration: 'none',
                fontWeight: isActive ? 'bold' : 'normal',
              })}
            >
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  )
}

function LoadingFallback() {
  return <div role="status" aria-live="polite">Loading…</div>
}

export function AppRouter() {
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <aside style={{ width: '220px', borderRight: '1px solid #e2e8f0' }}>
        <Navigation />
      </aside>
      <main style={{ flex: 1, padding: '1rem' }}>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/live-data" element={<LiveDataPage />} />
            <Route path="/custom-graphs" element={<CustomGraphsPage />} />
            <Route path="/climate-archive" element={<ClimateArchivePage />} />
            <Route
              path="/normals-anomalies"
              element={<NormalsAnomaliesPage />}
            />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/comparisons" element={<ComparisonsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route
              path="/climate-calendar"
              element={<ClimateCalendarPage />}
            />
            <Route path="/on-this-day" element={<OnThisDayPage />} />
            <Route
              path="/station-information"
              element={<StationInformationPage />}
            />
            <Route
              path="/data-corrections"
              element={<DataCorrectionsPage />}
            />
          </Routes>
        </Suspense>
      </main>
    </div>
  )
}
