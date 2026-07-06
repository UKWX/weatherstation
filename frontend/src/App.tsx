import { NavLink, Route, Routes } from 'react-router-dom';
import { DashboardPage } from './pages/DashboardPage';
import { ClimateAnalyticsPage } from './pages/ClimateAnalyticsPage';
import { SectionPage } from './pages/SectionPage';
import { navigation } from './data/navigation';
import './styles.css';

const routeMap = [
  { path: '/live', title: 'Live Conditions', description: 'Live station feed and current observation diagnostics.' },
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
  { path: '/reports', title: 'Reports', description: 'Automated climate reports for daily, monthly, and annual cycles.' },
  { path: '/import', title: 'Data Import', description: 'Import controls for raw and historical climate datasets.' },
  { path: '/exports', title: 'Exports', description: 'Structured data exports in CSV and JSON formats.' },
  { path: '/settings', title: 'Settings', description: 'Station metadata, processing, timezone, and retention settings.' }
];

function App() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">☁️</div>
          <div>
            <h1>UKWX Weather Archive</h1>
            <p>Personal Weather Station</p>
          </div>
        </div>

        <nav>
          {navigation.map((group) => (
            <div key={group.title} className="nav-group">
              <h2>{group.title}</h2>
              {group.items.map((item) => (
                <NavLink key={item.path} to={item.path} end className={({ isActive }) => (isActive ? 'active' : '')}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      <main className="content">
        <header className="topbar">
          <div>
            <h2>Wakefield Climatology Archive</h2>
            <p>Long-term observations, records, trends, and analytics</p>
          </div>
          <div className="topbar-meta">
            <span>16:32</span>
            <span>Local time (BST)</span>
          </div>
        </header>

        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/climate/analytics" element={<ClimateAnalyticsPage />} />
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
