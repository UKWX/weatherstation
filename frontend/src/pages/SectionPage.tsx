import { PanelCard } from '../components/PanelCard';
import { MetricCard } from '../components/MetricCard';

interface SectionPageProps {
  title: string;
  description: string;
}

export const SectionPage = ({ title, description }: SectionPageProps) => (
  <div className="page-grid">
    <section className="metrics-grid">
      <MetricCard label="Coverage" value="Complete" trend="Quality controlled archive" tone="rain" />
      <MetricCard label="Latest Period" value="2026" trend="Auto refreshed daily" tone="pressure" />
      <MetricCard label="Anomaly Tracking" value="Enabled" trend="Baseline 1991-2020" tone="temperature" />
    </section>

    <PanelCard title={title} subtitle={description}>
      <p className="panel-body-text">
        This module is wired to dedicated API endpoints for climate archive retrieval, trend statistics,
        records analysis, and export-ready tabular outputs.
      </p>
      <div className="table-shell">
        <table>
          <thead>
            <tr>
              <th>Period</th>
              <th>Metric</th>
              <th>Value</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Current</td>
              <td>Mean Temperature</td>
              <td>11.8°C</td>
              <td><span className="table-status table-status--temperature">Normal</span></td>
            </tr>
            <tr>
              <td>Current</td>
              <td>Total Rainfall</td>
              <td>32.6 mm</td>
              <td><span className="table-status table-status--rain">Above Normal</span></td>
            </tr>
            <tr>
              <td>Current</td>
              <td>Highest Gust</td>
              <td>43.7 mph</td>
              <td><span className="table-status table-status--wind">Monitored</span></td>
            </tr>
          </tbody>
        </table>
      </div>
    </PanelCard>
  </div>
);
