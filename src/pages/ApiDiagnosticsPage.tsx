import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  evaluatePublicEndpointDiagnostics,
  PUBLIC_API_DIAGNOSTIC_ENDPOINTS,
  type PublicApiDiagnosticEndpoint,
} from '@/api/publicWeatherApi'
import { PUBLIC_STATION_DATA_BASE_URL } from '@/config/weather'

type EndpointDiagnosticsRow = {
  endpoint: PublicApiDiagnosticEndpoint
  url: string
  httpSuccess: boolean
  status: number | null
  contentType: string
  topLevelKeys: readonly string[]
  validationSucceeded: boolean
  validationErrors: readonly string[]
  adapterSucceeded: boolean
  adapterErrors: readonly string[]
  inspection: unknown
  sample: unknown
  adaptedSample: unknown
  arrayLength: number | null
  recordCount: number | null
}

type DiagnosticsState = {
  loading: boolean
  rows: readonly EndpointDiagnosticsRow[]
  copied: boolean
  nestedCopied: boolean
  error: string | null
}

const INITIAL_STATE: DiagnosticsState = {
  loading: false,
  rows: [],
  copied: false,
  nestedCopied: false,
  error: null,
}

export default function ApiDiagnosticsPage() {
  const [state, setState] = useState<DiagnosticsState>(INITIAL_STATE)

  const runDiagnostics = useCallback(async () => {
    setState((previous) => ({
      ...previous,
      copied: false,
      nestedCopied: false,
      loading: true,
      error: null,
    }))

    try {
      const rows = await Promise.all(
        PUBLIC_API_DIAGNOSTIC_ENDPOINTS.map(async (endpoint) => {
          const url = `${PUBLIC_STATION_DATA_BASE_URL}${endpoint}`
          try {
            const response = await fetch(url)
            const contentType = response.headers.get('content-type') ?? 'unknown'
            const rawText = await response.text()
            const parsed = parsePossiblyJson(rawText)
            const parsedValue = parsed.ok ? parsed.value : rawText

            if (!response.ok) {
              return {
                endpoint,
                url,
                httpSuccess: false,
                status: response.status,
                contentType,
                topLevelKeys: deriveTopLevelKeys(parsedValue),
                validationSucceeded: false,
                validationErrors: [],
                adapterSucceeded: false,
                adapterErrors: [],
                inspection: null,
                sample: compactSample(parsedValue),
                adaptedSample: null,
                arrayLength: Array.isArray(parsedValue) ? parsedValue.length : null,
                recordCount: isRecord(parsedValue) ? 1 : null,
              } satisfies EndpointDiagnosticsRow
            }

            if (!parsed.ok) {
              return {
                endpoint,
                url,
                httpSuccess: true,
                status: response.status,
                contentType,
                topLevelKeys: [],
                validationSucceeded: false,
                validationErrors: [parsed.error],
                adapterSucceeded: false,
                adapterErrors: [],
                inspection: null,
                sample: compactSample(rawText),
                adaptedSample: null,
                arrayLength: null,
                recordCount: null,
              } satisfies EndpointDiagnosticsRow
            }

            const evaluated = evaluatePublicEndpointDiagnostics(endpoint, parsed.value)
            return {
              endpoint,
              url,
              httpSuccess: true,
              status: response.status,
              contentType,
              topLevelKeys: deriveTopLevelKeys(parsed.value),
              validationSucceeded: evaluated.validationSucceeded,
              validationErrors: evaluated.validationErrors,
              adapterSucceeded: evaluated.adapterSucceeded,
              adapterErrors: evaluated.adapterErrors,
              inspection: compactSample(evaluated.inspection),
              sample: compactSample(parsed.value),
              adaptedSample: compactSample(evaluated.adaptedSample),
              arrayLength: evaluated.counts.arrayLength,
              recordCount: evaluated.counts.recordCount,
            } satisfies EndpointDiagnosticsRow
          } catch (error) {
            return {
              endpoint,
              url,
              httpSuccess: false,
              status: null,
              contentType: 'unknown',
              topLevelKeys: [],
              validationSucceeded: false,
              validationErrors: [],
              adapterSucceeded: false,
              adapterErrors: [error instanceof Error ? error.message : 'Unknown request error'],
              inspection: null,
              sample: null,
              adaptedSample: null,
              arrayLength: null,
              recordCount: null,
            } satisfies EndpointDiagnosticsRow
          }
        }),
      )

      setState({
        loading: false,
        rows,
        copied: false,
        nestedCopied: false,
        error: null,
      })
    } catch (error) {
      setState((previous) => ({
        ...previous,
        loading: false,
        error: error instanceof Error ? error.message : 'Diagnostics failed',
      }))
    }
  }, [])

  useEffect(() => {
    void runDiagnostics()
  }, [runDiagnostics])

  const summary = useMemo(
    () =>
      JSON.stringify(
        state.rows.map((row) => ({
          endpoint: row.endpoint,
          httpSuccess: row.httpSuccess,
          status: row.status,
          contentType: row.contentType,
          topLevelKeys: row.topLevelKeys,
          validationSucceeded: row.validationSucceeded,
          validationErrors: row.validationErrors,
          adapterSucceeded: row.adapterSucceeded,
          adapterErrors: row.adapterErrors,
          inspection: row.inspection,
          arrayLength: row.arrayLength,
          recordCount: row.recordCount,
          sample: row.sample,
          adaptedSample: row.adaptedSample,
        })),
        null,
        2,
      ),
    [state.rows],
  )

  const copySummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(summary)
      setState((previous) => ({ ...previous, copied: true, nestedCopied: false }))
    } catch (error) {
      setState((previous) => ({
        ...previous,
        copied: false,
        nestedCopied: false,
        error: error instanceof Error ? error.message : 'Unable to copy diagnostics summary',
      }))
    }
  }, [summary])

  const nestedSchemaSummary = useMemo(
    () =>
      JSON.stringify(
        state.rows
          .filter((row) => row.inspection != null)
          .map((row) => ({
            endpoint: row.endpoint,
            inspection: row.inspection,
          })),
        null,
        2,
      ),
    [state.rows],
  )

  const copyNestedSchemaSummary = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(nestedSchemaSummary)
      setState((previous) => ({ ...previous, copied: false, nestedCopied: true }))
    } catch (error) {
      setState((previous) => ({
        ...previous,
        copied: false,
        nestedCopied: false,
        error: error instanceof Error ? error.message : 'Unable to copy nested schema summary',
      }))
    }
  }, [nestedSchemaSummary])

  return (
    <section>
      <h1>API Diagnostics (DEV)</h1>
      <p>
        Endpoint diagnostics for <code>{PUBLIC_STATION_DATA_BASE_URL}</code>.
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button type="button" onClick={() => void runDiagnostics()} disabled={state.loading}>
          {state.loading ? 'Running diagnostics…' : 'Run diagnostics'}
        </button>
        <button type="button" onClick={() => void copySummary()} disabled={state.rows.length === 0}>
          Copy diagnostics summary
        </button>
        <button
          type="button"
          onClick={() => void copyNestedSchemaSummary()}
          disabled={state.rows.length === 0}
        >
          Copy nested schema summary
        </button>
      </div>
      {state.copied ? <p>Diagnostics summary copied.</p> : null}
      {state.nestedCopied ? <p>Nested schema summary copied.</p> : null}
      {state.error ? <p role="alert">{state.error}</p> : null}
      <div style={{ display: 'grid', gap: '1rem' }}>
        {state.rows.map((row) => (
          <article
            key={row.endpoint}
            style={{ border: '1px solid #cbd5e1', borderRadius: '0.375rem', padding: '0.75rem' }}
          >
            <h2>{row.endpoint}</h2>
            <p>
              HTTP: {row.httpSuccess ? 'success' : 'failure'}{' '}
              {row.status == null ? '' : `(status ${row.status})`}
            </p>
            <p>Content type: {row.contentType}</p>
            <p>
              Top-level keys:{' '}
              {row.topLevelKeys.length > 0 ? row.topLevelKeys.join(', ') : '(none or not an object)'}
            </p>
            <p>Runtime validation: {row.validationSucceeded ? 'passed' : 'failed'}</p>
            {row.validationErrors.length > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap' }}>
                {row.validationErrors.join('\n')}
              </pre>
            ) : null}
            <p>Production adapter: {row.adapterSucceeded ? 'passed' : 'failed'}</p>
            {row.adapterErrors.length > 0 ? (
              <pre style={{ whiteSpace: 'pre-wrap' }}>{row.adapterErrors.join('\n')}</pre>
            ) : null}
            <p>
              Array length: {row.arrayLength == null ? 'n/a' : row.arrayLength} | Record count:{' '}
              {row.recordCount == null ? 'n/a' : row.recordCount}
            </p>
            <p>Inspection details:</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.inspection, null, 2)}</pre>
            <p>Representative sample:</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.sample, null, 2)}</pre>
            <p>Adapter sample:</p>
            <pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(row.adaptedSample, null, 2)}</pre>
          </article>
        ))}
      </div>
    </section>
  )
}

function parsePossiblyJson(value: string): { ok: true; value: unknown } | { ok: false; error: string } {
  if (value.trim().length === 0) {
    return { ok: true, value: null }
  }

  try {
    return { ok: true, value: JSON.parse(value) as unknown }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Invalid JSON payload',
    }
  }
}

function deriveTopLevelKeys(value: unknown): readonly string[] {
  if (value != null && typeof value === 'object' && !Array.isArray(value)) {
    return Object.keys(value)
  }

  return []
}

function compactSample(value: unknown, depth = 0): unknown {
  if (
    value == null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value
  }

  if (depth >= 2) {
    if (Array.isArray(value)) {
      return `[Array(${value.length})]`
    }
    if (typeof value === 'object') {
      return '[Object]'
    }
    return value
  }

  if (Array.isArray(value)) {
    return {
      length: value.length,
      sample: value.slice(0, 2).map((entry) => compactSample(entry, depth + 1)),
    }
  }

  if (isRecord(value)) {
    const entries = Object.entries(value).slice(0, 8)
    return Object.fromEntries(entries.map(([key, entryValue]) => [key, compactSample(entryValue, depth + 1)]))
  }

  return String(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}
