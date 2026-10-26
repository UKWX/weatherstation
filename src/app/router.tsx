import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Route, Routes, useLocation } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  DEFAULT_PAGE_META,
  findNavigationItem,
  NAVIGATION_ITEMS,
  resolveNavigationLabel,
} from '@/app/navigation'
import { useStationStatusQuery } from '@/hooks/usePublicWeatherQueries'
import { useCurrentClimateYear } from '@/hooks/useCurrentClimateYear'
import { useTheme } from '@/app/theme'
import { formatEuropeLondonDisplay } from '@/lib/climate'
import {
  Badge,
  ErrorState,
  Skeleton,
  StaleDataWarning,
  VisuallyHidden,
} from '@/components/ui'

const HEADER_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
}

const OverviewPage = lazy(() => import('@/pages/OverviewPage'))
const LiveDataPage = lazy(() => import('@/pages/LiveDataPage'))
const CustomGraphsPage = lazy(() => import('@/pages/CustomGraphsPage'))
const AnnualOverviewPage = lazy(() => import('@/pages/AnnualOverviewPage'))
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
const ApiDiagnosticsPage = import.meta.env.DEV
  ? lazy(() => import('@/pages/ApiDiagnosticsPage'))
  : null

function Navigation({
  closeMobile,
  currentClimateYear,
  className = 'tabs',
}: {
  readonly closeMobile?: () => void
  readonly currentClimateYear: number
  readonly className?: string
}) {
  const navRef = useRef<HTMLElement>(null)
  const { pathname } = useLocation()

  // Keep the current page's tab in view when the tabs row scrolls sideways.
  useEffect(() => {
    const active = navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')
    if (active != null && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest', inline: 'center' })
    }
  }, [pathname])

  return (
    <nav aria-label="Main navigation" className={className} ref={navRef}>
      <ul className="tabs__list">
        {NAVIGATION_ITEMS.map((item) => {
          if (!item.available) {
            return (
              <li key={item.to}>
                <span
                  className="tabs__link tabs__link--disabled"
                  aria-disabled="true"
                >
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
                className="tabs__link"
                onClick={closeMobile}
              >
                {resolveNavigationLabel(item, currentClimateYear)}
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// The UKWX sections, as in the bar at the top of every ukwx.uk page; this station is part of Stations.
const UKWX_SECTIONS = [
  { href: '/', label: 'Home' },
  { href: '/live/overview', label: 'Live' },
  { href: '/stations/', label: 'Stations', current: true },
  { href: '/outlook', label: 'Outlooks' },
  { href: '/isobront', label: 'Isobront' },
  { href: '/storms/overview', label: 'Storms' },
  { href: '/data/warning-archive', label: 'Data' },
] as const

function UkwxBar() {
  return (
    <div className="ukwx-bar">
      <div className="wrap ukwx-bar__in">
        <a className="ukwx-bar__brand" href="/" aria-label="UKWX home">
          <img
            src={`${import.meta.env.BASE_URL}brand/ukwx-logo.svg`}
            alt=""
            width="42"
            height="36"
          />
          <span>UKWX</span>
        </a>
        <nav className="ukwx-bar__nav" aria-label="UKWX">
          {UKWX_SECTIONS.map((section) => (
            <a
              key={section.href}
              href={section.href}
              aria-current={'current' in section ? 'page' : undefined}
            >
              {section.label}
            </a>
          ))}
        </nav>
        <a className="ukwx-bar__home" href="/">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
          UKWX home
        </a>
      </div>
    </div>
  )
}

function SunIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  )
}

function RefreshIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 12a9 9 0 1 1-2.6-6.4" />
      <path d="M21 4v5h-5" />
    </svg>
  )
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
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
  const stale =
    statusQuery.isStale ||
    statusQuery.isPlaceholderData ||
    !statusQuery.data?.online
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
  const lastUpdated =
    statusQuery.data?.observationTimeUtc ??
    statusQuery.data?.checkedAtUtc ??
    null

  return (
    <div className="header-status">
      <span className={online ? 'live' : 'live live--off'}>
        <i aria-hidden="true" />
        {online ? 'Station online' : 'Station offline'}
      </span>
      {lastUpdated != null ? (
        <span className="header-updated">
          Last updated: {formatHeaderTime(lastUpdated)}
        </span>
      ) : null}
      {stale ? (
        <StaleDataWarning message="Showing last successful status snapshot." />
      ) : null}
    </div>
  )
}

function formatHeaderTime(value: string): string {
  try {
    return `${formatEuropeLondonDisplay(value, HEADER_TIME_FORMAT)}`
  } catch {
    return value
  }
}

export function AppRouter() {
  const location = useLocation()
  const { theme, toggleTheme } = useTheme()
  const queryClient = useQueryClient()
  const currentClimateYear = useCurrentClimateYear()
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

  const pageTitle =
    currentPage != null
      ? resolveNavigationLabel(currentPage, currentClimateYear)
      : DEFAULT_PAGE_META.title
  const pageDescription =
    currentPage?.description ?? DEFAULT_PAGE_META.description
  const isOverview = location.pathname === '/'

  return (
    <div className="app-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className={mobileDrawerOpen ? 'top open' : 'top'}>
        <UkwxBar />
        <div className="wrap section-bar">
          <NavLink to="/" end className="section-brand">
            Wakefield
            <span className="section-brand__sub">Station</span>
          </NavLink>
          <div className="section-bar__tools">
            {isOverview ? null : <StationStatusBadge />}
            <button
              type="button"
              className="iconbtn"
              onClick={() => {
                void queryClient.invalidateQueries()
              }}
              aria-label="Manual refresh"
              title="Manual refresh"
            >
              <RefreshIcon />
            </button>
            <button
              type="button"
              className="iconbtn"
              onClick={toggleTheme}
              aria-label={`Theme: ${theme === 'dark' ? 'Dark' : 'Light'}`}
              title={
                theme === 'dark'
                  ? 'Dark theme: switch to light'
                  : 'Light theme: switch to dark'
              }
            >
              {theme === 'dark' ? <MoonIcon /> : <SunIcon />}
            </button>
            <button
              type="button"
              className="iconbtn mobile-menu-button"
              onClick={() => setMobileDrawerOpen((open) => !open)}
              aria-label="Menu"
              aria-expanded={mobileDrawerOpen}
              aria-controls="mobile-navigation-drawer"
            >
              <MenuIcon />
            </button>
          </div>
        </div>
        <div className="wrap tabs-row">
          <Navigation currentClimateYear={currentClimateYear} />
        </div>
        {mobileDrawerOpen ? (
          <div id="mobile-navigation-drawer" className="menu-panel">
            <h2 className="visually-hidden">Navigation</h2>
            <Navigation
              className="menu-panel__nav"
              currentClimateYear={currentClimateYear}
              closeMobile={() => setMobileDrawerOpen(false)}
            />
            <div className="menu-panel__ukwx">
              <span className="eyebrow">UKWX</span>
              {UKWX_SECTIONS.map((section) => (
                <a key={section.href} href={section.href}>
                  {section.label}
                </a>
              ))}
            </div>
          </div>
        ) : null}
      </header>
      {mobileDrawerOpen ? (
        <div
          className="drawer-overlay"
          onClick={() => setMobileDrawerOpen(false)}
        />
      ) : null}

      <main id="main" className="wrap main-container" tabIndex={-1}>
        <header
          className={
            isOverview ? 'page-header page-header--overview' : 'page-header'
          }
        >
          <p className="eyebrow">
            {isOverview ? 'UKWX station · Yorkshire, UK' : 'Wakefield station'}
          </p>
          <h1>{isOverview ? 'Wakefield' : pageTitle}</h1>
          <p className="lede">
            {isOverview
              ? 'Live weather, climate records and history from the Wakefield station.'
              : pageDescription}
          </p>
        </header>
        <Suspense fallback={<LoadingFallback />}>
          <Routes>
            <Route path="/" element={<OverviewPage />} />
            <Route path="/live-data" element={<LiveDataPage />} />
            <Route path="/custom-graphs" element={<CustomGraphsPage />} />
            <Route path="/annual-overview" element={<AnnualOverviewPage />} />
            <Route path="/climate-archive" element={<ClimateArchivePage />} />
            <Route
              path="/normals-anomalies"
              element={<NormalsAnomaliesPage />}
            />
            <Route path="/records" element={<RecordsPage />} />
            <Route path="/comparisons" element={<ComparisonsPage />} />
            <Route path="/reports" element={<ReportsPage />} />
            <Route path="/climate-calendar" element={<ClimateCalendarPage />} />
            <Route path="/on-this-day" element={<OnThisDayPage />} />
            <Route
              path="/station-information"
              element={<StationInformationPage />}
            />
            <Route path="/data-corrections" element={<DataCorrectionsPage />} />
            {ApiDiagnosticsPage != null ? (
              <Route
                path="/dev/api-diagnostics"
                element={<ApiDiagnosticsPage />}
              />
            ) : null}
          </Routes>
        </Suspense>
      </main>
      <footer className="site-footer">
        <div className="wrap site-footer__in">
          <p>© 2026 UKWX · Wakefield station v2.0.0</p>
          <p>
            <a href="/stations/">UKWX Stations</a> · <a href="/">ukwx.uk</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
