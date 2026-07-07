import { useRef, useState } from 'react';
import Papa from 'papaparse';
import readXlsxFile from 'read-excel-file/browser';
import { MetricCard } from '../components/MetricCard';
import { PanelCard } from '../components/PanelCard';

// ── Types ─────────────────────────────────────────────────────────────────────

type RawObservationInput = {
  timestamp_utc: string;
  timestamp_local?: string;
  temperature?: number | null;
  feels_like?: number | null;
  humidity?: number | null;
  dew_point?: number | null;
  pressure?: number | null;
  wind_speed?: number | null;
  wind_direction?: number | null;
  wind_gust?: number | null;
  rainfall?: number | null;
  rain_rate?: number | null;
  solar_radiation?: number | null;
  uv_index?: number | null;
};

type ImportResult = {
  imported: number;
  duplicates: number;
  rejected: number;
  missingData: number;
  issues: Array<{ row: number; field: string; message: string }>;
  report: {
    recordsImported: number;
    errors: number;
    duplicateDates: number;
    dateRange: { start: string | null; end: string | null };
  };
};

// ── Column mapping ─────────────────────────────────────────────────────────────

/**
 * Maps common weather station column header names to RawObservationInput fields.
 * All keys are lower-cased for matching.
 */
const COLUMN_MAP: Record<string, keyof RawObservationInput> = {
  // Timestamps
  'timestamp': 'timestamp_utc',
  'timestamp_utc': 'timestamp_utc',
  'datetime': 'timestamp_utc',
  'date time': 'timestamp_utc',
  'time utc': 'timestamp_utc',
  'timestamp_local': 'timestamp_local',
  'local time': 'timestamp_local',
  'obstime': 'timestamp_utc',
  'obstimeutc': 'timestamp_utc',
  // Temperature
  'temperature': 'temperature',
  'temp': 'temperature',
  'temp (°c)': 'temperature',
  'temperature (°c)': 'temperature',
  'air temp': 'temperature',
  'air temperature': 'temperature',
  'tmax': 'temperature',
  'tmin': 'temperature',
  'tmean': 'temperature',
  'feels_like': 'feels_like',
  'feels like': 'feels_like',
  'apparent temperature': 'feels_like',
  'heat index': 'feels_like',
  'heatindex': 'feels_like',
  // Humidity
  'humidity': 'humidity',
  'humidity (%)': 'humidity',
  'relative humidity': 'humidity',
  'rh': 'humidity',
  // Dew point
  'dew_point': 'dew_point',
  'dew point': 'dew_point',
  'dewpt': 'dew_point',
  'dewpoint': 'dew_point',
  // Pressure
  'pressure': 'pressure',
  'pressure (hpa)': 'pressure',
  'barometric pressure': 'pressure',
  'sea level pressure': 'pressure',
  'slp': 'pressure',
  // Wind speed
  'wind_speed': 'wind_speed',
  'wind speed': 'wind_speed',
  'windspeed': 'wind_speed',
  'wind speed (m/s)': 'wind_speed',
  'wind speed (mph)': 'wind_speed',
  'wind speed (kmh)': 'wind_speed',
  // Wind gust
  'wind_gust': 'wind_gust',
  'wind gust': 'wind_gust',
  'windgust': 'wind_gust',
  'gust': 'wind_gust',
  'gust speed': 'wind_gust',
  // Wind direction
  'wind_direction': 'wind_direction',
  'wind direction': 'wind_direction',
  'winddirection': 'wind_direction',
  'winddir': 'wind_direction',
  'wind dir': 'wind_direction',
  // Rainfall
  'rainfall': 'rainfall',
  'rainfall (mm)': 'rainfall',
  'precipitation': 'rainfall',
  'precip': 'rainfall',
  'rain': 'rainfall',
  'rain total': 'rainfall',
  'daily rainfall': 'rainfall',
  'preciprate': 'rain_rate',
  'precip rate': 'rain_rate',
  'rain rate': 'rain_rate',
  'rainfall rate': 'rain_rate',
  // Solar radiation
  'solar_radiation': 'solar_radiation',
  'solar radiation': 'solar_radiation',
  'solarradiation': 'solar_radiation',
  'solar': 'solar_radiation',
  'radiation': 'solar_radiation',
  // UV
  'uv_index': 'uv_index',
  'uv index': 'uv_index',
  'uvindex': 'uv_index',
  'uv': 'uv_index'
};

const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).trim());
  return Number.isFinite(n) ? n : null;
};

const mapRow = (
  headers: string[],
  mappedFields: Array<keyof RawObservationInput | null>,
  rowValues: unknown[]
): RawObservationInput | null => {
  const obj: Partial<RawObservationInput> = {};

  for (let i = 0; i < headers.length; i++) {
    const field = mappedFields[i];
    if (!field) continue;
    const raw = rowValues[i];
    if (field === 'timestamp_utc' || field === 'timestamp_local') {
      const s = String(raw ?? '').trim();
      if (s) obj[field] = s;
    } else {
      (obj[field] as number | null) = toNum(raw);
    }
  }

  if (!obj.timestamp_utc) return null;

  // Attempt to normalise timestamp to ISO 8601 UTC if it looks like a local datetime
  const ts = obj.timestamp_utc;
  if (!ts.endsWith('Z') && !ts.includes('+') && ts.includes('T')) {
    // already has T separator — assume it may be in ISO but without timezone; append Z
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(ts) && !ts.endsWith('Z')) {
      obj.timestamp_utc = ts + 'Z';
    }
  }

  return obj as RawObservationInput;
};

// ── Component ─────────────────────────────────────────────────────────────────

export const ImportPage = () => {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<string[][]>([]);
  const [headers, setHeaders] = useState<string[]>([]);
  const [mappedFields, setMappedFields] = useState<Array<keyof RawObservationInput | null>>([]);
  const [parsedRows, setParsedRows] = useState<RawObservationInput[]>([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  const FIELD_OPTIONS: Array<keyof RawObservationInput | ''> = [
    '', 'timestamp_utc', 'timestamp_local', 'temperature', 'feels_like',
    'humidity', 'dew_point', 'pressure', 'wind_speed', 'wind_direction',
    'wind_gust', 'rainfall', 'rain_rate', 'solar_radiation', 'uv_index'
  ];

  const autoMapHeaders = (rawHeaders: string[]): Array<keyof RawObservationInput | null> =>
    rawHeaders.map((h) => COLUMN_MAP[h.toLowerCase().trim()] ?? null);

  const processRows = (rawHeaders: string[], dataRows: unknown[][], fields: Array<keyof RawObservationInput | null>) => {
    const mapped: RawObservationInput[] = [];
    for (const row of dataRows) {
      const obs = mapRow(rawHeaders, fields, row);
      if (obs) mapped.push(obs);
    }
    return mapped;
  };

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setResult(null);
    setParseError(null);
    setPreview([]);
    setParsedRows([]);

    try {
      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        const text = await file.text();
        const result = Papa.parse<string[]>(text, { skipEmptyLines: true });
        if (result.errors.length && !result.data.length) {
          throw new Error(result.errors[0].message);
        }
        const [rawHeaders, ...dataRows] = result.data;
        if (!rawHeaders?.length) throw new Error('CSV has no header row');
        const fields = autoMapHeaders(rawHeaders);
        setHeaders(rawHeaders);
        setMappedFields(fields);
        setPreview([rawHeaders, ...dataRows.slice(0, 5)]);
        setParsedRows(processRows(rawHeaders, dataRows, fields));
      } else if (file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        const sheets = await readXlsxFile(file);
        if (!sheets.length || !sheets[0].data.length) throw new Error('XLSX file is empty');
        const [rawHeaders, ...dataRows] = sheets[0].data.map((r) =>
          r.map((c: unknown) => (c == null ? '' : String(c)))
        );
        const fields = autoMapHeaders(rawHeaders);
        setHeaders(rawHeaders);
        setMappedFields(fields);
        setPreview([rawHeaders, ...dataRows.slice(0, 5)]);
        setParsedRows(processRows(rawHeaders, dataRows, fields));
      } else {
        throw new Error('Unsupported file type. Please upload a .csv or .xlsx file.');
      }
    } catch (err) {
      console.error('File parse error:', err);
      setParseError(err instanceof Error ? err.message : 'Failed to parse file');
    }
  };

  const handleFieldChange = (colIndex: number, newField: keyof RawObservationInput | '') => {
    const updated = mappedFields.map((f, i) => (i === colIndex ? (newField || null) : f));
    setMappedFields(updated);
    // Re-parse rows with new mapping
    const rawHeader = headers[colIndex];
    if (rawHeader !== undefined) {
      setParsedRows(processRows(headers, preview.slice(1).map((r) => r.map((v) => v)), updated));
    }
  };

  const handleImport = async () => {
    if (!parsedRows.length) return;
    setImporting(true);
    setResult(null);

    try {
      const response = await fetch('/api/import/raw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: parsedRows, sourceBatchId: 'excel' })
      });

      if (!response.ok) {
        const errBody = (await response.json()) as { message?: string };
        throw new Error(errBody.message ?? `Server error ${response.status}`);
      }

      const importResult = (await response.json()) as ImportResult;
      setResult(importResult);
    } catch (err) {
      console.error('Import error:', err);
      setParseError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const hasTimestamp = mappedFields.some((f) => f === 'timestamp_utc');

  return (
    <div className="page-grid">
      <section className="metrics-grid">
        <MetricCard label="Formats" value="CSV · XLSX" trend="Automatic column mapping" tone="temperature" />
        <MetricCard label="Table" value="raw_observations" trend="Same as live API feed" tone="rain" />
        <MetricCard label="Source" value="excel" trend="Tagged for imported rows" tone="pressure" />
      </section>

      <PanelCard
        title="Upload weather data"
        subtitle="Import historical observations from CSV or Excel files. Columns are mapped automatically."
      >
        <div className="export-layout">
          <div className="report-filters">
            <label>
              Select file
              <input
                ref={fileRef}
                type="file"
                accept=".csv,.xlsx,.xls,.txt"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                }}
              />
              <button
                type="button"
                className="toolbar-chip"
                onClick={() => fileRef.current?.click()}
              >
                {fileName ? `📄 ${fileName}` : 'Choose CSV or XLSX file'}
              </button>
            </label>
          </div>

          {parseError && (
            <p style={{ color: '#ef4444', marginTop: '0.5rem' }}>⚠ {parseError}</p>
          )}

          {result && (
            <ul className="status-list status-list--stacked" style={{ marginTop: '1rem' }}>
              <li>
                <span>Rows imported</span>
                <strong className="ok">{result.imported}</strong>
              </li>
              <li>
                <span>Duplicate rows skipped</span>
                <strong>{result.duplicates}</strong>
              </li>
              <li>
                <span>Rows rejected</span>
                <strong>{result.rejected > 0 ? result.rejected : '0'}</strong>
              </li>
              {result.report.dateRange.start && (
                <li>
                  <span>Date range</span>
                  <strong>{result.report.dateRange.start} → {result.report.dateRange.end}</strong>
                </li>
              )}
            </ul>
          )}

          {result?.issues && result.issues.length > 0 && (
            <details style={{ marginTop: '0.75rem' }}>
              <summary style={{ cursor: 'pointer', color: '#94a3b8' }}>
                {result.issues.length} validation issue{result.issues.length !== 1 ? 's' : ''}
              </summary>
              <ul style={{ marginTop: '0.5rem', fontSize: '0.82rem', color: '#64748b' }}>
                {result.issues.slice(0, 20).map((issue, i) => (
                  <li key={i}>Row {issue.row} · {issue.field}: {issue.message}</li>
                ))}
                {result.issues.length > 20 && <li>… and {result.issues.length - 20} more</li>}
              </ul>
            </details>
          )}
        </div>
      </PanelCard>

      {headers.length > 0 && (
        <PanelCard
          title="Column mapping"
          subtitle="Review and adjust how each column maps to a weather observation field"
        >
          <div className="table-shell" style={{ overflowX: 'auto' }}>
            <table>
              <thead>
                <tr>
                  {headers.map((h, i) => (
                    <th key={i}>
                      <div>{h}</div>
                      <select
                        value={mappedFields[i] ?? ''}
                        onChange={(e) => handleFieldChange(i, e.target.value as keyof RawObservationInput | '')}
                        style={{ marginTop: '0.25rem', fontSize: '0.75rem', width: '100%' }}
                      >
                        {FIELD_OPTIONS.map((f) => (
                          <option key={f} value={f}>{f || '— ignore —'}</option>
                        ))}
                      </select>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.slice(1).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} style={{ fontSize: '0.82rem', color: mappedFields[ci] ? undefined : '#94a3b8' }}>
                        {cell || '—'}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
              {parsedRows.length} parseable rows found
              {!hasTimestamp && (
                <span style={{ color: '#ef4444', marginLeft: '0.5rem' }}>
                  — map a column to <strong>timestamp_utc</strong> to enable import
                </span>
              )}
            </span>
            <button
              type="button"
              className="toolbar-chip"
              disabled={!hasTimestamp || importing || parsedRows.length === 0}
              onClick={() => void handleImport()}
              style={{ opacity: (!hasTimestamp || importing || parsedRows.length === 0) ? 0.5 : 1 }}
            >
              {importing ? 'Importing…' : `Import ${parsedRows.length} rows`}
            </button>
          </div>
        </PanelCard>
      )}

      <PanelCard title="Column name guide" subtitle="Automatically recognised column headers">
        <div className="table-shell">
          <table>
            <thead>
              <tr>
                <th>Recognised names (case-insensitive)</th>
                <th>Maps to field</th>
              </tr>
            </thead>
            <tbody>
              {[
                { names: 'timestamp, datetime, date time, obstimeutc', field: 'timestamp_utc' },
                { names: 'temperature, temp, air temp, air temperature', field: 'temperature' },
                { names: 'feels like, apparent temperature, heat index', field: 'feels_like' },
                { names: 'humidity, relative humidity, rh', field: 'humidity' },
                { names: 'dew point, dewpt, dewpoint', field: 'dew_point' },
                { names: 'pressure, barometric pressure, slp', field: 'pressure' },
                { names: 'wind speed, windspeed', field: 'wind_speed' },
                { names: 'wind gust, gust, gust speed', field: 'wind_gust' },
                { names: 'wind direction, winddir, wind dir', field: 'wind_direction' },
                { names: 'rainfall, precipitation, precip, rain', field: 'rainfall' },
                { names: 'rain rate, precip rate, preciprate', field: 'rain_rate' },
                { names: 'solar radiation, solarradiation, solar', field: 'solar_radiation' },
                { names: 'uv index, uvindex, uv', field: 'uv_index' }
              ].map((row) => (
                <tr key={row.field}>
                  <td style={{ fontSize: '0.82rem', color: '#64748b' }}>{row.names}</td>
                  <td><code>{row.field}</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </PanelCard>
    </div>
  );
};
