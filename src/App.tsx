import { NavLink, Route, Routes, useNavigate } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { ClimateAnalyticsPage } from './pages/ClimateAnalyticsPage';
import { SectionPage } from './pages/SectionPage';
import { ReportsPage } from './pages/ReportsPage';
import { ExportsPage } from './pages/ExportsPage';
import { LiveConditionsPage } from './pages/LiveConditionsPage';
import { navigation } from './data/navigation';
import './styles.css';

const routeMap = [
  { path: '/archives/daily', title: 'Daily Archive', description: 'Daily climate summaries and statistics.' },
  { path: '/archives/monthly', title: 'Monthly Archive', description: 'Monthly summaries with rain, wind, and temperature rollups.' },
  { path: '/archives/annual', title: 'Annual Archive', description: 'Long-term annual climatology archive and reference statistics.' },
  { path: '/climate/averages', title: 'Climate Averages', description: 'Baseline normals and monthly climatological means.' },
  { path: '/climate/records', title: 'Records', description: 'Historical all-time records and record chronology.' },
  { path: '/climate/extremes', title: 'Extremes', description: 'Meteorological extremes across all observed periods.' },
  { path: '/climate/rankings', title: 'Rankings', description: 'Period rankings and percentile positions.' },
  { path: '/climate/trends', title: 'Trends', description: 'Trend analysis with linear regression by annual series.' },
  { path: '/climate/graphs', title: 'Graphs & Analytics', description: 'Professional charting and graphical diagnostics.' },
  { path: '/climate/year-comparisons', title: 'Year Comparisons', description: 'Multi-year comparison panel for key climate variables.' },
  { path: '/climate/calendar', title: 'Climate Calendar', description: 'Calendar-based view of daily climatic outcomes.' },
  { path: '/climate/this-day', title: 'This Day In History', description: 'Historical archive for the same day across all years.' },
  { path: '/lightning', title: 'Lightning', description: 'Lightning event statistics and temporal summaries.' },
  { path: '/snow', title: 'Snow Archive', description: 'Snowfall and snow depth climatology archive.' },
  { path: '/import', title: 'Data Import', description: 'Import controls for raw and historical climate datasets.' },
  { path: '/settings', title: 'Settings', description: 'Station metadata, processing, timezone, and retention settings.' }
];

const navigationIcons: Record<string, string> = {
  '/': '⌂',
  '/live': '◉',
  '/archives/daily': '☰',
  '/archives/monthly': '◫',
  '/archives/annual': '◧',
  '/climate/averages': '◌',
  '/climate/records': '◎',
  '/climate/extremes': '▲',
  '/climate/rankings': '▣',
  '/climate/trends': '↗',
  '/climate/graphs': '◨',
  '/climate/analytics': '◭',
  '/climate/year-comparisons': '▤',
  '/climate/calendar': '☷',
  '/climate/this-day': '◔',
  '/lightning': '⚡',
  '/snow': '❄',
  '/reports': '☷',
  '/import': '⇪',
  '/exports': '⇩',
  '/settings': '⚙'
};

function App() {
  const navigate = useNavigate();

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">☁</div>
          <div>
            <h1>UKWX Weather Archive</h1>
            <p>Professional station dashboard</p>
          </div>
        </div>

        <div className="sidebar-section">
          <span className="sidebar-pill">Wakefield Station</span>
          <span className="sidebar-pill sidebar-pill--secondary">Live archive synced</span>
        </div>

        <nav>
          {navigation.map((group) => (
            <div key={group.title} className="nav-group">
              <h2>{group.title}</h2>
              <div className="nav-links">
                {group.items.map((item) => (
                  <NavLink key={item.path} to={item.path} end className={({ isActive }) => (isActive ? 'active' : '')}>
                    <span className="nav-link__icon">{navigationIcons[item.path] ?? '•'}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="sidebar-footer">
          <div>
            <strong>Station</strong>
            <span>UKWX HQ · 53.30° N / 1.50° W</span>
          </div>
          <div>
            <strong>Status</strong>
            <span className="status-dot ok">All systems operational</span>
          </div>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="topbar-copy">
            <span className="topbar-eyebrow">Professional weather archive interface</span>
            <h2>Wakefield Climatology Archive</h2>
            <p>Long-term observations, records, anomalies, and operational insight</p>
          </div>
          <div className="topbar-meta">
            <div>
              <strong>16:32</strong>
              <span>Wakefield local time (BST)</span>
            </div>
            <div>
              <strong>24 May 2026</strong>
              <span>Latest station update 16:30</span>
            </div>
          </div>
          <div className="topbar-actions">
            <span className="toolbar-chip">Archive online</span>
            <button type="button" aria-label="Search archive" onClick={() => navigate('/archives/daily')}>
              ⌕
            </button>
            <button type="button" aria-label="Alerts" onClick={() => navigate('/lightning')}>
              ⚑
            </button>
            <button type="button" aria-label="Settings" onClick={() => navigate('/settings')}>
              ⚙
            </button>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/live" element={<LiveConditionsPage />} />
          <Route path="/climate/analytics" element={<ClimateAnalyticsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/exports" element={<ExportsPage />} />
          {routeMap.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={<SectionPage title={route.title} description={route.description} />}
            />
          ))}
        </Routes>
      </main>
    </div>
  );
}

export default App;
