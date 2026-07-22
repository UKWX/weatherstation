/**
 * Lightning Statistics Engine
 * Computes location-based statistics from UKWX archive data.
 */

import { haversineKm, boundingBox } from '../utils/geoDistance';
import type { LightningStrike, DayStrikes } from './lightningArchive';

export type DailyCount = { date: string; count: number };
export type HourlyCount = { hour: number; count: number };

export type LocationStats = {
  locationName: string;
  lat: number;
  lon: number;
  radiusKm: number;
  totalStrikes: number;
  daysAnalysed: number;
  daysWithStrikes: number;
  dateRange: { start: string; end: string };
  busiestDay: DailyCount | null;
  busiestHour: HourlyCount | null;
  nearestStrikeKm: number | null;
  strikesByDay: DailyCount[];
  strikesByHour: HourlyCount[];
  densityPerKm2: number;
  percentageOfRegion: number | null;
};

export type ComparisonResult = {
  locations: LocationStats[];
  totalRegionStrikes: number;
};

export type RegionalRanking = {
  rank: number;
  location: string;
  lat: number;
  lon: number;
  totalStrikes: number;
  busiestDay: DailyCount | null;
};

function filterStrikes(
  days: DayStrikes[],
  lat: number,
  lon: number,
  radiusKm: number
): { date: string; strike: LightningStrike; dist: number }[] {
  const [minLat, maxLat, minLon, maxLon] = boundingBox(lat, lon, radiusKm);
  const results: { date: string; strike: LightningStrike; dist: number }[] = [];

  for (const { date, strikes } of days) {
    for (const s of strikes) {
      // Bounding box pre-filter
      if (s.lat < minLat || s.lat > maxLat || s.lon < minLon || s.lon > maxLon) continue;
      const dist = haversineKm(lat, lon, s.lat, s.lon);
      if (dist <= radiusKm) results.push({ date, strike: s, dist });
    }
  }
  return results;
}

export function computeLocationStats(
  days: DayStrikes[],
  lat: number,
  lon: number,
  radiusKm: number,
  locationName: string,
  totalRegionStrikes?: number
): LocationStats {
  const matches = filterStrikes(days, lat, lon, radiusKm);

  const byDay = new Map<string, number>();
  const byHour = new Map<number, number>();
  let nearestStrikeKm: number | null = null;

  for (const { date, strike, dist } of matches) {
    byDay.set(date, (byDay.get(date) ?? 0) + 1);

    if (nearestStrikeKm === null || dist < nearestStrikeKm) {
      nearestStrikeKm = dist;
    }

    if (strike.time) {
      try {
        const hour = new Date(strike.time).getUTCHours();
        byHour.set(hour, (byHour.get(hour) ?? 0) + 1);
      } catch {
        // ignore unparseable time
      }
    }
  }

  const allDates = days.map((d) => d.date).sort();
  const totalStrikes = matches.length;
  const area = Math.PI * radiusKm ** 2;

  const sortedDays = Array.from(byDay.entries())
    .sort((a, b) => b[1] - a[1]);

  const sortedHours = Array.from(byHour.entries())
    .sort((a, b) => b[1] - a[1]);

  const allDays = allDates.map((date) => ({
    date,
    count: byDay.get(date) ?? 0,
  }));

  const allHours: HourlyCount[] = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: byHour.get(h) ?? 0,
  }));

  return {
    locationName,
    lat,
    lon,
    radiusKm,
    totalStrikes,
    daysAnalysed: days.length,
    daysWithStrikes: byDay.size,
    dateRange: {
      start: allDates[0] ?? '2026-03-29',
      end: allDates[allDates.length - 1] ?? new Date().toISOString().slice(0, 10),
    },
    busiestDay: sortedDays[0] ? { date: sortedDays[0][0], count: sortedDays[0][1] } : null,
    busiestHour: sortedHours[0] ? { hour: sortedHours[0][0], count: sortedHours[0][1] } : null,
    nearestStrikeKm: nearestStrikeKm !== null ? Math.round(nearestStrikeKm * 10) / 10 : null,
    strikesByDay: allDays,
    strikesByHour: allHours,
    densityPerKm2: area > 0 ? totalStrikes / area : 0,
    percentageOfRegion:
      totalRegionStrikes && totalRegionStrikes > 0
        ? (totalStrikes / totalRegionStrikes) * 100
        : null,
  };
}

/**
 * Compute strike stats for multiple locations using the same loaded dataset.
 */
export function computeMultipleStats(
  days: DayStrikes[],
  locations: Array<{ lat: number; lon: number; name: string }>,
  radiusKm: number
): LocationStats[] {
  const total = days.reduce((sum, d) => sum + d.strikes.length, 0);
  return locations.map((loc) =>
    computeLocationStats(days, loc.lat, loc.lon, radiusKm, loc.name, total)
  );
}

/**
 * Rank a list of predefined locations by total strike count.
 */
export function rankLocations(
  days: DayStrikes[],
  locations: Array<{ name: string; lat: number; lon: number }>,
  radiusKm: number
): RegionalRanking[] {
  const stats = computeMultipleStats(days, locations, radiusKm);
  return stats
    .sort((a, b) => b.totalStrikes - a.totalStrikes)
    .map((s, i) => ({
      rank: i + 1,
      location: s.locationName,
      lat: s.lat,
      lon: s.lon,
      totalStrikes: s.totalStrikes,
      busiestDay: s.busiestDay,
    }));
}

/** Format an hour like 14 → "14:00 UTC" */
export function formatHour(hour: number): string {
  return `${String(hour).padStart(2, '0')}:00 UTC`;
}

/** Format a date string like "2026-07-15" → "15 Jul 2026" */
export function formatDate(iso: string): string {
  try {
    return new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}
