/**
 * UKWX Lightning Archive Service
 * Fetches and caches daily lightning strike data from the UKWX archive CDN.
 * Archive coverage begins 29 March 2026.
 */

export const ARCHIVE_START = '2026-03-29';
const BASE_UK = 'https://ukwx.duckdns.org/lightning/archive/uk/';
const BASE_EU = 'https://ukwx.duckdns.org/lightning/archive/europe/';

export type LightningStrike = {
  lat: number;
  lon: number;
  time: string;
  date: string;
  type?: string;
};

export type DayStrikes = {
  date: string;
  strikes: LightningStrike[];
  loaded: boolean;
};

// In-memory cache keyed by "{region}:{date}"
const archiveCache = new Map<string, LightningStrike[]>();

function normaliseStrike(raw: unknown, date: string): LightningStrike | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // Support various field name conventions
  const lat = typeof r.lat === 'number' ? r.lat
    : typeof r.latitude === 'number' ? r.latitude : null;
  const lon = typeof r.lon === 'number' ? r.lon
    : typeof r.lng === 'number' ? r.lng
    : typeof r.longitude === 'number' ? r.longitude : null;

  if (lat === null || lon === null) return null;
  if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;

  const time = typeof r.time === 'string' ? r.time
    : typeof r.timestamp === 'string' ? r.timestamp
    : typeof r.t === 'string' ? r.t
    : `${date}T00:00:00Z`;

  return { lat, lon, time, date, type: typeof r.type === 'string' ? r.type : undefined };
}

function parseResponse(body: unknown, date: string): LightningStrike[] {
  let raw: unknown[] = [];
  if (Array.isArray(body)) {
    raw = body;
  } else if (body && typeof body === 'object') {
    const obj = body as Record<string, unknown>;
    const candidates = ['strikes', 'data', 'events', 'results'];
    for (const key of candidates) {
      if (Array.isArray(obj[key])) {
        raw = obj[key] as unknown[];
        break;
      }
    }
  }
  return raw.flatMap((item) => {
    const s = normaliseStrike(item, date);
    return s ? [s] : [];
  });
}

export async function fetchDayArchive(
  date: string,
  region: 'uk' | 'europe' = 'uk'
): Promise<LightningStrike[]> {
  const cacheKey = `${region}:${date}`;
  if (archiveCache.has(cacheKey)) return archiveCache.get(cacheKey)!;

  const base = region === 'uk' ? BASE_UK : BASE_EU;
  try {
    const res = await fetch(`${base}${date}.json`);
    if (!res.ok) {
      archiveCache.set(cacheKey, []);
      return [];
    }
    const body: unknown = await res.json();
    const strikes = parseResponse(body, date);
    archiveCache.set(cacheKey, strikes);
    return strikes;
  } catch {
    archiveCache.set(cacheKey, []);
    return [];
  }
}

/**
 * Build a list of ISO date strings (YYYY-MM-DD) between two dates inclusive,
 * clamped to the archive start date.
 */
export function buildDateList(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const cursor = new Date(start);
  cursor.setUTCHours(0, 0, 0, 0);
  const limit = new Date(end);
  limit.setUTCHours(23, 59, 59, 999);

  while (cursor <= limit) {
    const iso = cursor.toISOString().slice(0, 10);
    if (iso >= ARCHIVE_START) dates.push(iso);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

/**
 * Load multiple archive days in parallel, returning per-day strike arrays.
 */
export async function fetchDateRange(
  dates: string[],
  region: 'uk' | 'europe' = 'uk',
  onProgress?: (loaded: number, total: number) => void
): Promise<DayStrikes[]> {
  const BATCH = 8;
  const results: DayStrikes[] = [];
  let loaded = 0;

  for (let i = 0; i < dates.length; i += BATCH) {
    const batch = dates.slice(i, i + BATCH);
    const settled = await Promise.all(
      batch.map(async (date) => {
        const strikes = await fetchDayArchive(date, region);
        return { date, strikes, loaded: true } as DayStrikes;
      })
    );
    results.push(...settled);
    loaded += batch.length;
    onProgress?.(loaded, dates.length);
  }
  return results;
}

/** Today's ISO date string (UTC). */
export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Yesterday's ISO date string (UTC). */
export function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Clear the in-memory cache (useful for testing). */
export function clearCache(): void {
  archiveCache.clear();
}
