import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { DEFAULT_PAGE_META, findNavigationItem, NAVIGATION_ITEMS } from '@/app/navigation'
import { useStationStatusQuery } from '@/hooks/usePublicWeatherQueries'
import { useTheme } from '@/app/theme'
import {
  Badge,
  ErrorState,
  Skeleton,
  StaleDataWarning,
  VisuallyHidden,
} from '@/components/ui'

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
const StationInformationPage = lazy(() => import('@/pages/StationInformationPage'))
const DataCorrectionsPage = lazy(() => import('@/pages/DataCorrectionsPage'))
const ApiDiagnosticsPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/ApiDiagnosticsPage'))
  : null

function Navigation({ closeMobile }: { readonly closeMobile?: () => void }) {
  return (
    <nav aria-label="Main navigation">
      <ul className="nav-list">
        {NAVIGATION_ITEMS.map((item) => {
          if (!item.available) {
            return (
              <li key={item.to}>
                <span className="nav-disabled" aria-disabled="true">
                  {item.label}
                  <Badge variant="default">Locked</Badge>
                </span>
              </li>
            )
          }

          return (
            <li key={item.to}>
              <NavLink
                to={item.to}
                end={item.end}
                className="nav-link"
                onClick={closeMobile}
              >
                {item.label}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function LoadingFallback() {
  return (
    <section className="card" aria-live="polite">
      <Skeleton lines={3} />
      <VisuallyHidden>Loading page content</VisuallyHidden>
    </section>
  )
}

function StationStatusBadge() {
  const statusQuery = useStationStatusQuery()
  const loading = statusQuery.isLoading && statusQuery.data == null
  const stale = statusQuery.isStale || statusQuery.isPlaceholderData || !statusQuery.data?.online
  const offline = statusQuery.error != null || !statusQuery.data?.online

  if (loading) {
    return <Skeleton lines={1} />
  }

  if (statusQuery.error) {
    return (
      <ErrorState
        title="Station status unavailable"
        message="Unable to refresh live status right now."
        onRetry={() => {
          void statusQuery.refetch()
        }}
      />
    )
  }

  const online = (statusQuery.data?.online ?? false) && !offline

  return (
    <div className="header-meta">
      <Badge variant={online ? 'success' : 'error'}>
        {online ? 'Station online' : 'Station offline'}
      </Badge>
      {stale ? (
        <StaleDataWarning message="Showing last successful status snapshot." />
      ) : null}
    </div>
  )
}

export function AppRouter() {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false)

  useEffect(() => {
    setMobileDrawerOpen(false)
  }, [location.pathname])

  useEffect(() => {
    if (!mobileDrawerOpen) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMobileDrawerOpen(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
    }
  }, [mobileDrawerOpen])

  const currentPage = useMemo(
    () => findNavigationItem(location.pathname),
    [location.pathname],
  )

  const pageTitle = currentPage?.label ?? DEFAULT_PAGE_META.title
  const pageDescription = currentPage?.description ?? DEFAULT_PAGE_META.description

  return (
    <div className="app-shell">
      <aside className="sidebar" aria-label="Desktop sidebar">
        <h2 className="brand">Wakefield Station</h2>
        <Navigation />
      </aside>

      <div className="app-main">
        <header className="top-header">
          <div className="header-meta">
            <button
              type="button"
              className="button button-ghost mobile-menu-button"
              onClick={() => setMobileDrawerOpen(true)}
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-navigation-drawer"
            >
              Menu
            </button>
            <StationStatusBadge />
          </div>
          <button type="button" className="button button-ghost" onClick={toggleTheme}>
            Theme: {theme === 'dark' ? 'Dark' : 'Light'}
          </button>
        </header>

        {mobileDrawerOpen ? (
          <div className="drawer-overlay" onClick={() => setMobileDrawerOpen(false)}>
            <aside
              id="mobile-navigation-drawer"
              className="drawer"
              onClick={(event) => event.stopPropagation()}
            >
              <h2 className="brand">Navigation</h2>
              <Navigation closeMobile={() => setMobileDrawerOpen(false)} />
            </aside>
          </div>
        ) : null}

        <main className="main-container">
          <header className="page-header">
            <h1>{pageTitle}</h1>
            <p>{pageDescription}</p>
          </header>
          <Suspense fallback={<LoadingFallback />}>
            <Routes>
              <Route path="/" element={<OverviewPage />} />
              <Route path="/live-data" element={<LiveDataPage />} />
              <Route path="/custom-graphs" element={<CustomGraphsPage />} />
              <Route path="/climate-archive" element={<ClimateArchivePage />} />
              <Route path="/normals-anomalies" element={<NormalsAnomaliesPage />} />
              <Route path="/records" element={<RecordsPage />} />
              <Route path="/comparisons" element={<ComparisonsPage />} />
              <Route path="/reports" element={<ReportsPage />} />
              <Route path="/climate-calendar" element={<ClimateCalendarPage />} />
              <Route path="/on-this-day" element={<OnThisDayPage />} />
              <Route path="/station-information" element={<StationInformationPage />} />
              <Route path="/data-corrections" element={<DataCorrectionsPage />} />
              {ApiDiagnosticsPage != null ? (
                <Route path="/dev/api-diagnostics" element={<ApiDiagnosticsPage />} />
              ) : null}
            </Routes>
          </Suspense>
        </main>
      </div>
    </div>
  )
}
