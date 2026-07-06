import { useMemo, useState } from 'react';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

const DATASETS = ['raw', 'daily', 'monthly', 'annual', 'anomalies', 'records', 'rankings'] as const;
const FORMATS = ['json', 'csv', 'excel', 'pdf'] as const;

type Dataset = (typeof DATASETS)[number];
type ExportFormat = (typeof FORMATS)[number];

const formatCopy: Record<ExportFormat, string> = {
  json: 'Structured object export for APIs and integrations',
  csv: 'Delimited tabular export for spreadsheets and data pipelines',
  excel: 'Excel-compatible workbook export for office workflows',
  pdf: 'Printable report document export for sharing and archive'
};

const isDataset = (value: string): value is Dataset => DATASETS.includes(value as Dataset);
const isExportFormat = (value: string): value is ExportFormat => FORMATS.includes(value as ExportFormat);

export const ExportsPage = () => {
  const [dataset, setDataset] = useState<Dataset>('monthly');
  const [format, setFormat] = useState<ExportFormat>('csv');

  const exportUrl = useMemo(() => `/api/exports/${dataset}?format=${format}`, [dataset, format]);

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard label="Datasets" value={String(DATASETS.length)} trend="Climate and archive layers" tone="temperature" />
        <MetricCard label="Formats" value="CSV · JSON · Excel · PDF" trend="Machine + publication ready" tone="rain" />
        <MetricCard label="Quality" value="Validated export pipeline" trend="Consistent schema and error handling" tone="pressure" />
      </section>

      <PanelCard title="Data exports" subtitle="Professional export controls for climate archive and reporting datasets">
        <div className="export-layout">
          <div className="report-filters">
            <label>
              Dataset
              <select value={dataset} onChange={(event) => { const value = event.target.value; if (isDataset(value)) setDataset(value); }}>
                {DATASETS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Format
              <select value={format} onChange={(event) => { const value = event.target.value; if (isExportFormat(value)) setFormat(value); }}>
                {FORMATS.map((entry) => (
                  <option key={entry} value={entry}>
                    {entry.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <a className="export-download" href={exportUrl} target="_blank" rel="noreferrer">
              Download {dataset} ({format.toUpperCase()})
            </a>
          </div>

          <ul className="status-list status-list--stacked report-status-list">
            <li><span>Selected dataset</span><strong>{dataset}</strong></li>
            <li><span>Selected format</span><strong>{format.toUpperCase()}</strong></li>
            <li><span>Format notes</span><strong>{formatCopy[format]}</strong></li>
            <li><span>Endpoint</span><strong>{exportUrl}</strong></li>
          </ul>
        </div>
      </PanelCard>

      <PanelCard title="Available datasets" subtitle="Reference listing of export-ready data domains">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th>Description</th>
                <th>Quick links</th>
              </tr>
            </thead>
            <tbody>
              {DATASETS.map((entry) => (
                <tr key={entry}>
                  <td>{entry}</td>
                  <td>
                    {entry === 'raw' && 'Latest raw observations and direct sensor records.'}
                    {entry === 'daily' && 'Daily climate summaries with temperature, rain, wind, and pressure metrics.'}
                    {entry === 'monthly' && 'Monthly climate rollups for reporting and archive publications.'}
                    {entry === 'annual' && 'Annual climate totals and long-term climatology statistics.'}
                    {entry === 'anomalies' && 'Derived climatological anomaly records against baseline normals.'}
                    {entry === 'records' && 'Station records and all-time event benchmarks.'}
                    {entry === 'rankings' && 'Ranked annual and period-based climate positions.'}
                  </td>
                  <td>
                    <div className="export-link-group">
                      {FORMATS.map((entryFormat) => (
                        <a
                          key={`${entry}-${entryFormat}`}
                          href={`/api/exports/${entry}?format=${entryFormat}`}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {entryFormat.toUpperCase()}
                        </a>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </div>
  );
};
