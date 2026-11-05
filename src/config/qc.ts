// Readings known to be wrong (quality control). In each UTC window the field is held at its last good reading before
// the window (a flat line), so the charts and the day's high ignore it; the day's corrected high is listed for the
// summaries built on the station server. Same list in the Stations site (core.js WAKEFIELD_QC_FLATLINE) and the
// Stations API (stations_api.py WAKE_QC_FLATLINE).
export type QcWindow = { from: string; to: string; field: 'temperature_c'; reason: string }

export const QC_FLATLINE: QcWindow[] = [
  { from: '2026-11-05T18:39:00Z', to: '2026-11-05T19:39:59Z', field: 'temperature_c', reason: 'Bonfire night: heat and smoke near the sensor' },
]

/** The day's high with the QC windows held flat (UK-local date). */
export const QC_DAILY_MAX: Record<string, { maxTempC: number; timeLocal: string }> = {
  '2026-11-05': { maxTempC: 10.1, timeLocal: '2026-11-05T13:31:00+00:00' },
}

const windows = () => QC_FLATLINE.map((w) => ({ ...w, a: Date.parse(w.from), b: Date.parse(w.to) }))

/** True when a time falls in a QC window for the field. */
export function inQcWindow(timeIso: string | null | undefined, field: QcWindow['field'] = 'temperature_c'): boolean {
  if (!timeIso) return false
  const ms = Date.parse(timeIso)
  return Number.isFinite(ms) && windows().some((w) => w.field === field && ms >= w.a && ms <= w.b)
}

/** Readings with their temperature held flat through the QC windows (time order kept; changed readings are copies). */
export function flatlineTemperature<T extends { observationTimeUtc: string | null; temperatureC: number | null }>(readings: T[]): T[] {
  const ws = windows().filter((w) => w.field === 'temperature_c')
  if (!ws.length) return readings
  const order = readings.map((r, i) => ({ r, i, ms: Date.parse(r.observationTimeUtc ?? '') })).sort((x, y) => x.ms - y.ms)
  const out = readings.slice()
  let last: number | null = null
  for (const { r, i, ms } of order) {
    const inside = ws.some((w) => ms >= w.a && ms <= w.b)
    if (inside) out[i] = { ...r, temperatureC: last }
    else if (r.temperatureC != null && ws.some((w) => ms < w.a)) last = r.temperatureC
  }
  return out
}
