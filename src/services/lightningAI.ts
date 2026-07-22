/**
 * Isobront.v1 Lightning Intelligence Engine
 * Rule-based natural language query processor for UKWX lightning archive analysis.
 */

import {
  fetchDateRange,
  buildDateList,
  ARCHIVE_START,
  todayISO,
  yesterdayISO,
  type DayStrikes,
} from './lightningArchive';
import { resolveLocation, resolveCurrentPosition } from './locationResolver';
import {
  computeLocationStats,
  computeMultipleStats,
  rankLocations,
  formatDate,
  formatHour,
  type LocationStats,
  type RegionalRanking,
} from './lightningStatistics';

// ── Types ────────────────────────────────────────────────────────────────────

export type QueryIntent =
  | 'location_stats'
  | 'comparison'
  | 'ranking'
  | 'timeseries'
  | 'hotspot'
  | 'general';

export type DateRangePreset = 'today' | 'yesterday' | '3days' | 'week' | 'month' | 'all';
export type DateRangeCustom = { kind: 'custom'; start: string; end: string };
export type DateRange = DateRangePreset | DateRangeCustom;

export type AnalysisChartData = {
  type: 'bar' | 'line' | 'horizontal-bar' | 'grouped-bar';
  data: Array<Record<string, string | number>>;
  xKey: string;
  yKeys: Array<{ key: string; color: string; name: string }>;
  unit?: string;
};

export type AnalysisResult = {
  title: string;
  subtitle: string;
  bodyLines: string[];
  stats?: LocationStats;
  comparisonStats?: LocationStats[];
  ranking?: RegionalRanking[];
  chart?: AnalysisChartData;
  error?: string;
  loadingLabel?: string;
};

// ── UK major cities for ranking queries ──────────────────────────────────────

const UK_CITIES = [
  { name: 'London', lat: 51.509, lon: -0.118 },
  { name: 'Birmingham', lat: 52.483, lon: -1.894 },
  { name: 'Leeds', lat: 53.800, lon: -1.549 },
  { name: 'Glasgow', lat: 55.864, lon: -4.252 },
  { name: 'Sheffield', lat: 53.383, lon: -1.466 },
  { name: 'Bradford', lat: 53.795, lon: -1.759 },
  { name: 'Edinburgh', lat: 55.953, lon: -3.189 },
  { name: 'Liverpool', lat: 53.409, lon: -2.978 },
  { name: 'Manchester', lat: 53.483, lon: -2.244 },
  { name: 'Bristol', lat: 51.455, lon: -2.587 },
  { name: 'Wakefield', lat: 53.683, lon: -1.500 },
  { name: 'Cardiff', lat: 51.481, lon: -3.180 },
  { name: 'Coventry', lat: 52.408, lon: -1.510 },
  { name: 'Nottingham', lat: 52.955, lon: -1.150 },
  { name: 'Leicester', lat: 52.637, lon: -1.133 },
  { name: 'Newcastle', lat: 54.978, lon: -1.618 },
  { name: 'Belfast', lat: 54.597, lon: -5.930 },
  { name: 'Plymouth', lat: 50.376, lon: -4.144 },
  { name: 'Derby', lat: 52.922, lon: -1.475 },
  { name: 'Stoke-on-Trent', lat: 53.002, lon: -2.179 },
  { name: 'Southampton', lat: 50.904, lon: -1.404 },
  { name: 'Norwich', lat: 52.628, lon: 1.299 },
  { name: 'Exeter', lat: 50.718, lon: -3.534 },
  { name: 'Oxford', lat: 51.752, lon: -1.258 },
  { name: 'Cambridge', lat: 52.205, lon: 0.119 },
];

const EU_CITIES = [
  { name: 'Paris', lat: 48.857, lon: 2.351 },
  { name: 'Berlin', lat: 52.520, lon: 13.405 },
  { name: 'Madrid', lat: 40.416, lon: -3.703 },
  { name: 'Rome', lat: 41.902, lon: 12.496 },
  { name: 'Amsterdam', lat: 52.374, lon: 4.890 },
  { name: 'Brussels', lat: 50.850, lon: 4.352 },
  { name: 'Vienna', lat: 48.208, lon: 16.373 },
  { name: 'Warsaw', lat: 52.229, lon: 21.012 },
  { name: 'Prague', lat: 50.075, lon: 14.438 },
  { name: 'Barcelona', lat: 41.385, lon: 2.173 },
  { name: 'Munich', lat: 48.137, lon: 11.576 },
  { name: 'Hamburg', lat: 53.551, lon: 9.994 },
  { name: 'Milan', lat: 45.465, lon: 9.187 },
  { name: 'Athens', lat: 37.984, lon: 23.728 },
  { name: 'Lisbon', lat: 38.717, lon: -9.142 },
];

// ── Query parsing ─────────────────────────────────────────────────────────────

function detectIntent(q: string): QueryIntent {
  if (/\bcompar[ei]\b|\bvs\.?\b|\band\b.*\band\b/.test(q)) return 'comparison';
  if (/\btop\b|\bmost active\b|\brank(ing)?\b|\bhotspot\b|\bwhere.*most\b|\bmost.*light/i.test(q)) return 'ranking';
  if (/\btrend\b|\bsince\b.*\b(march|april|may|june|july|august|september|october|november|december)\b|\bover time\b|\bcumulative\b/i.test(q)) return 'timeseries';
  if (/\bhotspot\b|\bheat.?map\b|\bmap\b|\bconcentrat/i.test(q)) return 'hotspot';
  return 'location_stats';
}

function extractRadius(q: string): number {
  const match = /(\d+)\s*km\b/i.exec(q) ?? /(\d+)\s*mile/i.exec(q);
  if (match) {
    const n = parseInt(match[1], 10);
    const km = /mile/i.test(match[0]) ? Math.round(n * 1.609) : n;
    // Snap to allowed values
    const allowed = [5, 10, 20, 50, 100];
    return allowed.reduce((prev, cur) => Math.abs(cur - km) < Math.abs(prev - km) ? cur : prev);
  }
  return 20; // default
}

function detectRegion(q: string): 'uk' | 'europe' {
  if (/\beurop[ea]\b|\bfranc[ea]?\b|\bgerman[y]?\b|\bspain\b|\bitaly\b|\bparis\b|\bberlin\b|\bmadrid\b|\brome\b/i.test(q)) {
    return 'europe';
  }
  return 'uk';
}

function parseDateRange(q: string): DateRange {
  if (/\btoday\b/.test(q)) return 'today';
  if (/\byesterday\b/.test(q)) return 'yesterday';
  if (/\blast\s+3\s+days?\b|\b3\s+days?\b/.test(q)) return '3days';
  if (/\bthis\s+week\b|\blast\s+week\b|\blast\s+7\s+days?\b/.test(q)) return 'week';
  if (/\bthis\s+month\b|\blast\s+month\b|\blast\s+30\s+days?\b/.test(q)) return 'month';
  if (/\ball\s+time\b|\bsince\s+march\b|\barchive\b|\bever\b/.test(q)) return 'all';

  // Named months
  const months: Record<string, number> = {
    january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
    july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  };
  for (const [name, idx] of Object.entries(months)) {
    if (new RegExp(`\\b${name}\\b`, 'i').test(q)) {
      const year = new Date().getFullYear();
      const start = new Date(Date.UTC(year, idx, 1));
      const end = new Date(Date.UTC(year, idx + 1, 0));
      // Don't go before archive start
      const startStr = start.toISOString().slice(0, 10);
      const endStr = end.toISOString().slice(0, 10);
      if (startStr >= ARCHIVE_START || endStr >= ARCHIVE_START) {
        return {
          kind: 'custom' as const,
          start: startStr < ARCHIVE_START ? ARCHIVE_START : startStr,
          end: endStr > todayISO() ? todayISO() : endStr,
        };
      }
    }
  }

  return 'week'; // sensible default
}

function dateRangeToSpan(range: DateRange): { start: string; end: string } {
  const today = todayISO();
  const yesterday = yesterdayISO();

  if (range === 'today') return { start: today, end: today };
  if (range === 'yesterday') return { start: yesterday, end: yesterday };
  if (range === '3days') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 2);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (range === 'week') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 6);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (range === 'month') {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - 29);
    return { start: d.toISOString().slice(0, 10), end: today };
  }
  if (range === 'all') return { start: ARCHIVE_START, end: today };
  return { start: range.start, end: range.end };
}

function describeRange(range: DateRange): string {
  if (range === 'today') return 'Today';
  if (range === 'yesterday') return 'Yesterday';
  if (range === '3days') return 'Last 3 days';
  if (range === 'week') return 'Last 7 days';
  if (range === 'month') return 'Last 30 days';
  if (range === 'all') return `Full archive (${ARCHIVE_START} onwards)`;
  return `${formatDate(range.start)} – ${formatDate(range.end)}`;
}

/**
 * Extract location candidates from the query.
 * Returns raw strings to be geocoded.
 */
function extractLocationCandidates(query: string): string[] {
  const q = query;

  // "my location" / "here" / "near me"
  if (/\bmy\s+location\b|\bnear\s+me\b|\bhere\b/i.test(q)) return ['__MY_LOCATION__'];

  // Explicit coordinate pattern
  const coordMatch = /(-?\d{1,3}\.\d+)[,\s]+(-?\d{1,3}\.\d+)/.exec(q);
  if (coordMatch) return [`${coordMatch[1]},${coordMatch[2]}`];

  const candidates: string[] = [];

  // "compare X and Y" | "X vs Y"
  const compareMatch =
    /\bcompar[ei]\s+([A-Z][a-zA-Z\s-]{2,20}?)\s+(?:and|with|to|vs\.?)\s+([A-Z][a-zA-Z\s-]{2,20})/i.exec(q) ??
    /\b([A-Z][a-zA-Z\s-]{2,20}?)\s+(?:and|vs\.?)\s+([A-Z][a-zA-Z\s-]{2,20})/i.exec(q);
  if (compareMatch) {
    candidates.push(compareMatch[1].trim(), compareMatch[2].trim());
    return candidates;
  }

  // "near X" | "around X" | "in X" | "for X" | "at X" | "around X" | "within X of X"
  const prepositionMatch =
    /\b(?:near|around|in|for|at|close to|within\s+\d+\s*km?\s+of)\s+([A-Z][a-zA-Z\s,.-]{2,30})/i.exec(q);
  if (prepositionMatch) {
    candidates.push(prepositionMatch[1].trim());
    return candidates;
  }

  // "lightning in/over/across X" or "X lightning"
  const lightningMatch =
    /\blightning\s+(?:in|over|across|near|around)\s+([A-Z][a-zA-Z\s-]{2,25})/i.exec(q) ??
    /\b([A-Z][a-zA-Z\s-]{2,25})\s+lightning\b/i.exec(q);
  if (lightningMatch) {
    candidates.push(lightningMatch[1].trim());
    return candidates;
  }

  // "how much lightning has X had" / "was X affected"
  const namedMatch =
    /\b(?:has|have|had|around|about)\s+([A-Z][a-zA-Z\s-]{2,25})\s+(?:had|seen|experienced|been|affected)/i.exec(q) ??
    /\bwas\s+([A-Z][a-zA-Z\s-]{2,25})\s+affected/i.exec(q);
  if (namedMatch) {
    candidates.push(namedMatch[1].trim());
    return candidates;
  }

  // Capitalised word sequences that look like place names (heuristic)
  const capitalMatches = [...q.matchAll(/\b([A-Z][a-z]{2,}(?:\s+[A-Z][a-z]{2,})*)\b/g)];
  const stopWords = new Set([
    'The', 'What', 'Where', 'When', 'How', 'Show', 'Which', 'Was', 'Create',
    'Analyse', 'Analyze', 'Compare', 'Top', 'Most', 'Any', 'All', 'Has',
    'Lightning', 'Strike', 'Storm', 'Thunder', 'Isobront',
  ]);
  for (const m of capitalMatches) {
    const word = m[1].trim();
    if (!stopWords.has(word) && word.length >= 3) {
      candidates.push(word);
      if (candidates.length >= 2) break;
    }
  }

  return candidates.length > 0 ? candidates : [];
}

// ── Chart builders ────────────────────────────────────────────────────────────

const LIGHTNING_COLORS = ['#a855f7', '#fb923c', '#facc15', '#2563eb', '#22c55e'];

function buildDailyBarChart(stats: LocationStats): AnalysisChartData {
  const data = stats.strikesByDay
    .filter((d) => d.count > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => ({ day: d.date.slice(5), count: d.count }));
  return {
    type: 'bar',
    data,
    xKey: 'day',
    yKeys: [{ key: 'count', color: '#a855f7', name: 'Strikes' }],
    unit: ' strikes',
  };
}

function buildComparisonChart(statsArr: LocationStats[]): AnalysisChartData {
  // Build a dataset with one bar per location showing total strikes
  const data = statsArr.map((s) => ({ location: s.locationName, strikes: s.totalStrikes }));
  return {
    type: 'horizontal-bar',
    data,
    xKey: 'location',
    yKeys: [{ key: 'strikes', color: '#a855f7', name: 'Total Strikes' }],
    unit: ' strikes',
  };
}

function buildRankingChart(ranking: RegionalRanking[]): AnalysisChartData {
  const top10 = ranking.slice(0, 10);
  const data = top10.map((r) => ({ location: r.location, strikes: r.totalStrikes }));
  return {
    type: 'horizontal-bar',
    data,
    xKey: 'location',
    yKeys: [{ key: 'strikes', color: '#fb923c', name: 'Strikes' }],
    unit: ' strikes',
  };
}

function buildTimeseriesChart(stats: LocationStats): AnalysisChartData {
  let cumulative = 0;
  const data = stats.strikesByDay
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((d) => {
      cumulative += d.count;
      return { day: d.date.slice(5), daily: d.count, cumulative };
    });
  return {
    type: 'line',
    data,
    xKey: 'day',
    yKeys: [
      { key: 'daily', color: '#a855f7', name: 'Daily strikes' },
      { key: 'cumulative', color: '#f59e0b', name: 'Cumulative' },
    ],
    unit: ' strikes',
  };
}

function buildGroupedComparisonChart(statsArr: LocationStats[]): AnalysisChartData {
  // Daily comparison chart for up to 2 locations
  const allDates = [...new Set(statsArr.flatMap((s) => s.strikesByDay.map((d) => d.date)))]
    .sort()
    .filter((d) => statsArr.some((s) => (s.strikesByDay.find((x) => x.date === d)?.count ?? 0) > 0));

  const data = allDates.map((date) => {
    const row: Record<string, string | number> = { day: date.slice(5) };
    for (const s of statsArr) {
      row[s.locationName] = s.strikesByDay.find((d) => d.date === date)?.count ?? 0;
    }
    return row;
  });

  return {
    type: 'grouped-bar',
    data,
    xKey: 'day',
    yKeys: statsArr.map((s, i) => ({
      key: s.locationName,
      color: LIGHTNING_COLORS[i % LIGHTNING_COLORS.length],
      name: s.locationName,
    })),
    unit: ' strikes',
  };
}

// ── Response formatting ───────────────────────────────────────────────────────

function formatLocationResponse(
  stats: LocationStats,
  rangeLabel: string,
  intent: QueryIntent
): AnalysisResult {
  const { locationName, radiusKm, totalStrikes, daysAnalysed, daysWithStrikes,
    busiestDay, busiestHour, nearestStrikeKm, densityPerKm2, percentageOfRegion } = stats;

  const lines: string[] = [];

  lines.push(`**Location:** ${locationName}`);
  lines.push(`**Radius:** ${radiusKm} km`);
  lines.push(`**Archive period:** ${ARCHIVE_START} – present (${rangeLabel})`);
  lines.push('');

  if (totalStrikes === 0) {
    lines.push(`No lightning strikes were recorded within ${radiusKm} km of ${locationName} during the selected period.`);
    lines.push('');
    lines.push(`This may indicate a quiet period or that archive data was unavailable for some dates.`);
    return {
      title: `⚡ Isobront.v1 — ${locationName}`,
      subtitle: rangeLabel,
      bodyLines: lines,
      stats,
      chart: undefined,
    };
  }

  lines.push(`**Lightning detected:** ${totalStrikes.toLocaleString()} strikes`);
  lines.push(`**Days analysed:** ${daysAnalysed} (${daysWithStrikes} with activity)`);

  if (busiestDay) {
    lines.push(`**Peak day:** ${formatDate(busiestDay.date)} — ${busiestDay.count.toLocaleString()} strikes`);
  }
  if (busiestHour) {
    lines.push(`**Peak hour:** ${formatHour(busiestHour.hour)} — ${busiestHour.count.toLocaleString()} strikes`);
  }
  if (nearestStrikeKm !== null) {
    lines.push(`**Nearest strike:** ${nearestStrikeKm} km`);
  }
  lines.push(`**Strike density:** ${densityPerKm2.toFixed(4)} strikes/km²`);
  if (percentageOfRegion !== null) {
    lines.push(`**Regional share:** ${percentageOfRegion.toFixed(2)}% of archive total`);
  }
  lines.push('');

  // Narrative summary
  const activityLevel =
    densityPerKm2 > 0.01 ? 'very high' :
    densityPerKm2 > 0.003 ? 'high' :
    densityPerKm2 > 0.001 ? 'moderate' : 'low';

  lines.push(
    `Based on UKWX lightning observations from ${ARCHIVE_START} onwards, ${locationName} recorded ` +
    `${totalStrikes.toLocaleString()} strikes within a ${radiusKm} km radius, indicating ${activityLevel} ` +
    `convective activity for the selected period.`
  );

  if (busiestDay) {
    lines.push(
      `The most active day was ${formatDate(busiestDay.date)}, which accounted for ` +
      `${busiestDay.count.toLocaleString()} strikes — ` +
      `${((busiestDay.count / totalStrikes) * 100).toFixed(1)}% of the total.`
    );
  }

  const chart = intent === 'timeseries'
    ? buildTimeseriesChart(stats)
    : buildDailyBarChart(stats);

  return {
    title: `⚡ Isobront.v1 — ${locationName}`,
    subtitle: rangeLabel,
    bodyLines: lines,
    stats,
    chart,
  };
}

function formatComparisonResponse(
  statsArr: LocationStats[],
  rangeLabel: string
): AnalysisResult {
  const lines: string[] = [];
  lines.push(`**Comparison:** ${statsArr.map((s) => s.locationName).join(' vs ')}`);
  lines.push(`**Archive period:** ${ARCHIVE_START} – present (${rangeLabel})`);
  lines.push(`**Radius per location:** ${statsArr[0]?.radiusKm ?? 20} km`);
  lines.push('');

  for (const s of statsArr) {
    lines.push(`**${s.locationName}:** ${s.totalStrikes.toLocaleString()} strikes`);
    if (s.busiestDay) lines.push(`  Peak day: ${formatDate(s.busiestDay.date)} — ${s.busiestDay.count} strikes`);
    if (s.densityPerKm2 > 0) lines.push(`  Density: ${s.densityPerKm2.toFixed(4)} strikes/km²`);
    lines.push('');
  }

  const sorted = [...statsArr].sort((a, b) => b.totalStrikes - a.totalStrikes);
  if (sorted.length >= 2 && sorted[0].totalStrikes > 0) {
    const ratio = sorted[1].totalStrikes > 0
      ? (sorted[0].totalStrikes / sorted[1].totalStrikes).toFixed(1)
      : '∞';
    lines.push(
      `**Summary:** ${sorted[0].locationName} recorded ${sorted[0].totalStrikes.toLocaleString()} strikes ` +
      `compared with ${sorted[1].locationName}'s ${sorted[1].totalStrikes.toLocaleString()}, ` +
      `representing a ${ratio}× difference for the selected period.`
    );
  }

  const chart = statsArr.length >= 2
    ? buildGroupedComparisonChart(statsArr)
    : buildComparisonChart(statsArr);

  return {
    title: `⚡ Isobront.v1 — Comparison`,
    subtitle: rangeLabel,
    bodyLines: lines,
    comparisonStats: statsArr,
    chart,
  };
}

function formatRankingResponse(
  ranking: RegionalRanking[],
  region: 'uk' | 'europe',
  rangeLabel: string
): AnalysisResult {
  const lines: string[] = [];
  lines.push(`**Region:** ${region === 'uk' ? 'United Kingdom' : 'Europe'}`);
  lines.push(`**Archive period:** ${ARCHIVE_START} – present (${rangeLabel})`);
  lines.push('');

  const top = ranking.filter((r) => r.totalStrikes > 0).slice(0, 10);
  if (top.length === 0) {
    lines.push('No lightning activity recorded in the selected period.');
    return {
      title: '⚡ Isobront.v1 — Rankings',
      subtitle: rangeLabel,
      bodyLines: lines,
    };
  }

  lines.push('**Top locations by strike count:**');
  for (const r of top) {
    lines.push(`${r.rank}. ${r.location} — ${r.totalStrikes.toLocaleString()} strikes`);
  }
  lines.push('');
  lines.push(
    `${top[0].location} leads with ${top[0].totalStrikes.toLocaleString()} strikes in the selected period, ` +
    `based on UKWX lightning observations from ${ARCHIVE_START} onwards.`
  );

  return {
    title: '⚡ Isobront.v1 — Rankings',
    subtitle: rangeLabel,
    bodyLines: lines,
    ranking,
    chart: buildRankingChart(ranking),
  };
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function analyseQuery(
  query: string,
  onProgress?: (label: string) => void
): Promise<AnalysisResult> {
  const q = query.toLowerCase();
  const intent = detectIntent(q);
  const dateRange = parseDateRange(q);
  const radius = extractRadius(q);
  const region = detectRegion(q);
  const { start, end } = dateRangeToSpan(dateRange);
  const rangeLabel = describeRange(dateRange);

  // ── Ranking (no specific location needed) ────────────────────────────────
  if (intent === 'ranking') {
    onProgress?.('Loading archive data for ranking analysis…');
    const dates = buildDateList(new Date(start), new Date(end));
    const days = await fetchDateRange(dates, region, (loaded, total) =>
      onProgress?.(`Loading archive: ${loaded}/${total} days…`)
    );

    onProgress?.('Ranking locations…');
    const cities = region === 'uk' ? UK_CITIES : EU_CITIES;
    const ranking = rankLocations(days, cities, radius);
    return formatRankingResponse(ranking, region, rangeLabel);
  }

  // ── Extract and geocode location(s) ──────────────────────────────────────
  const locationCandidates = extractLocationCandidates(query);

  if (locationCandidates.length === 0) {
    // No location found → treat as ranking of UK
    onProgress?.('No specific location detected — running UK ranking…');
    const dates = buildDateList(new Date(start), new Date(end));
    const days = await fetchDateRange(dates, region, (loaded, total) =>
      onProgress?.(`Loading archive: ${loaded}/${total} days…`)
    );
    const ranking = rankLocations(days, UK_CITIES, radius);
    return formatRankingResponse(ranking, region, rangeLabel);
  }

  onProgress?.('Resolving location…');

  // Handle "my location"
  const resolvedLocations = await Promise.all(
    locationCandidates.map(async (candidate) => {
      if (candidate === '__MY_LOCATION__') return resolveCurrentPosition();
      return resolveLocation(candidate);
    })
  );

  const validLocations = resolvedLocations.filter(Boolean) as NonNullable<typeof resolvedLocations[0]>[];

  if (validLocations.length === 0) {
    return {
      title: '⚡ Isobront.v1',
      subtitle: 'Location not found',
      bodyLines: [
        `I couldn't resolve the location from your query: **"${query}"**`,
        '',
        'Try being more specific, e.g.:',
        '  • "Lightning around Leeds"',
        '  • "Strikes near 53.76, -1.50"',
        '  • "Lightning in Birmingham last week"',
      ],
      error: 'Location not found',
    };
  }

  onProgress?.(`Loading archive for ${rangeLabel}…`);
  const dates = buildDateList(new Date(start), new Date(end));
  const days: DayStrikes[] = await fetchDateRange(dates, region, (loaded, total) =>
    onProgress?.(`Loading archive: ${loaded}/${total} days…`)
  );

  onProgress?.('Analysing lightning data…');

  // ── Comparison ────────────────────────────────────────────────────────────
  if (intent === 'comparison' || validLocations.length >= 2) {
    const locList = validLocations.slice(0, 4).map((l) => ({
      lat: l.lat,
      lon: l.lon,
      name: l.name,
    }));
    const statsArr = computeMultipleStats(days, locList, radius);
    return formatComparisonResponse(statsArr, rangeLabel);
  }

  // ── Single location ───────────────────────────────────────────────────────
  const loc = validLocations[0];
  const stats = computeLocationStats(
    days,
    loc.lat,
    loc.lon,
    radius,
    loc.name,
    days.reduce((sum, d) => sum + d.strikes.length, 0)
  );

  return formatLocationResponse(stats, rangeLabel, intent);
}

/** Suggested starter queries for the Isobront chat UI */
export const SUGGESTED_QUERIES = [
  'Lightning around Leeds last week',
  'Compare Manchester and Sheffield',
  'Which UK city had most lightning this month?',
  'Lightning near Wakefield today',
  'Top lightning locations in the UK',
  'Lightning in London vs Paris',
  'How active was Birmingham in June?',
  'Show strikes within 50km of Edinburgh',
];
