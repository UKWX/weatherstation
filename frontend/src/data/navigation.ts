export interface NavItem {
  label: string;
  path: string;
}

export interface NavGroup {
  title: string;
  items: NavItem[];
}

export const navigation: NavGroup[] = [
  { title: 'Main', items: [{ label: 'Dashboard', path: '/' }, { label: 'Live Conditions', path: '/live' }] },
  {
    title: 'Archives',
    items: [
      { label: 'Daily Archive', path: '/archives/daily' },
      { label: 'Monthly Archive', path: '/archives/monthly' },
      { label: 'Annual Archive', path: '/archives/annual' }
    ]
  },
  {
    title: 'Climate',
    items: [
      { label: 'Climate Averages', path: '/climate/averages' },
      { label: 'Records', path: '/climate/records' },
      { label: 'Extremes', path: '/climate/extremes' },
      { label: 'Rankings', path: '/climate/rankings' },
      { label: 'Trends', path: '/climate/trends' },
      { label: 'Graphs & Analytics', path: '/climate/graphs' },
      { label: 'Climate Analytics', path: '/climate/analytics' },
      { label: 'Year Comparisons', path: '/climate/year-comparisons' },
      { label: 'Climate Calendar', path: '/climate/calendar' },
      { label: 'This Day In History', path: '/climate/this-day' }
    ]
  },
  {
    title: 'Specialty',
    items: [
      { label: 'Lightning', path: '/lightning' },
      { label: 'Snow Archive', path: '/snow' }
    ]
  },
  {
    title: 'Operations',
    items: [
      { label: 'Reports', path: '/reports' },
      { label: 'Data Import', path: '/import' },
      { label: 'Exports', path: '/exports' },
      { label: 'Settings', path: '/settings' }
    ]
  }
];
