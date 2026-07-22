import { DateTime } from 'luxon';
import { db } from '../db/connection';
import { config } from '../config';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December'
] as const;

const MAX_TEMP_THRESHOLDS = [20, 25, 28, 30, 32, 35, 40] as const;
const MIN_TEMP_THRESHOLDS = [-10, -5, 0] as const;
const WARM_NIGHT_THRESHOLDS = [15, 20] as const;
const RAIN_THRESHOLDS = [0.1, 1, 5, 10, 25] as const;

type TemperatureRow = {
  date: string;
  year: number;
  month: number;
  day: number;
  maxTemp: number | null;
  minTemp: number | null;
  meanTemp: number | null;
  range: number | null;
};

type RainfallRow = {
  date: string;
  year: number;
  month: number;
  day: number;
  rainfall: number | null;
};

type MonthlyManualRow = {
  year: number;
  month: number;
  highestPressure: number | null;
  lowestPressure: number | null;
  highestWindGust: number | null;
  lightningCount: number | null;
  thunderDays: number | null;
};

type MonthlyTemperatureAggregate = {
  year: number;
  month: number;
  avgMax: number | null;
  avgMin: number | null;
  meanTemp: number | null;
  maxTemp: number | null;
  minTemp: number | null;
  range: number | null;
  days: number;
};

type AnnualTemperatureAggregate = {
  year: number;
  meanTemp: number | null;
  avgMax: number | null;
  avgMin: number | null;
  maxTemp: number | null;
  minTemp: number | null;
  frostDays: number;
  iceDays: number;
  hotDays20: number;
  hotDays25: number;
  hotDays30: number;
  tropicalNights: number;
};

type MonthlyRainAggregate = {
  year: number;
  month: number;
  totalRainfall: number;
  rainDays01: number;
  rainDays1: number;
  rainDays5: number;
  rainDays10: number;
  rainDays25: number;
};

type AnnualRainAggregate = MonthlyRainAggregate & {
  year: number;
};

type ValueRecord = {
  value: number;
  date: string;
  year: number;
  label: string;
};

type RankingRow = {
  year: number;
  value: number;
  rank: number;
};

type RecordTimelineRow = {
  category: string;
  label: string;
  value: number;
  date: string;
  year: number;
  previousValue: number | null;
  previousDate: string | null;
  isLatest: boolean;
};

type MonthlySummaryInput = {
  year: number;
  month: number;
  highestPressure?: number | null;
  lowestPressure?: number | null;
  highestWindGust?: number | null;
  lightningCount?: number | null;
  thunderDays?: number | null;
};

const round = (value: number | null, decimals = 1): number | null => {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const average = (values: Array<number | null | undefined>): number | null => {
  const valid = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
  if (!valid.length) return null;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
};

const sum = (values: Array<number | null | undefined>): number =>
  values.reduce<number>(
    (total, value) => total + (typeof value === 'number' && Number.isFinite(value) ? value : 0),
    0
  );

const asDateTime = (date: string): DateTime => DateTime.fromISO(date, { zone: config.timezone });

const formatLongDate = (date: string): string => {
  const dt = asDateTime(date);
  return dt.isValid ? dt.toFormat('d LLLL yyyy') : date;
};

const formatMonthLabel = (year: number, month: number): string => `${MONTH_NAMES[month - 1]} ${year}`;

const compareDateAsc = <T extends { date: string }>(left: T, right: T): number => left.date.localeCompare(right.date);

const valueRecordFromTemp = (row: TemperatureRow, value: number): ValueRecord => ({
  value: round(value) ?? value,
  date: row.date,
  year: row.year,
  label: formatLongDate(row.date)
});

const pickValueRecord = (
  rows: TemperatureRow[],
  accessor: (row: TemperatureRow) => number | null,
  mode: 'max' | 'min'
): ValueRecord | null => {
  const filtered = rows.filter((row) => accessor(row) !== null);
  if (!filtered.length) return null;
  const sorted = [...filtered].sort((left, right) => {
    const leftValue = accessor(left) ?? 0;
    const rightValue = accessor(right) ?? 0;
    if (leftValue === rightValue) return left.date.localeCompare(right.date);
    return mode === 'max' ? rightValue - leftValue : leftValue - rightValue;
  });
  const selected = sorted[0];
  return valueRecordFromTemp(selected, accessor(selected) ?? 0);
};

const pickRainRecord = (
  rows: RainfallRow[],
  accessor: (row: RainfallRow) => number | null,
  mode: 'max' | 'min'
): ValueRecord | null => {
  const filtered = rows.filter((row) => accessor(row) !== null);
  if (!filtered.length) return null;
  const sorted = [...filtered].sort((left, right) => {
    const leftValue = accessor(left) ?? 0;
    const rightValue = accessor(right) ?? 0;
    if (leftValue === rightValue) return left.date.localeCompare(right.date);
    return mode === 'max' ? rightValue - leftValue : leftValue - rightValue;
  });
  const selected = sorted[0];
  return {
    value: round(accessor(selected), 1) ?? 0,
    date: selected.date,
    year: selected.year,
    label: formatLongDate(selected.date)
  };
};

const loadTemperatureRows = (): TemperatureRow[] => {
  const rows = db
    .prepare(
      `SELECT observed_date, tmax, tmin, tmean
       FROM temperature_history
       WHERE station_id = ?
       ORDER BY observed_date ASC`
    )
    .all(config.stationId) as Array<{
    observed_date: string;
    tmax: number | null;
    tmin: number | null;
    tmean: number | null;
  }>;

  return rows
    .map((row) => {
      const dt = asDateTime(row.observed_date);
      const meanTemp =
        row.tmean ??
        (typeof row.tmax === 'number' && typeof row.tmin === 'number' ? (row.tmax + row.tmin) / 2 : null);
      const range =
        typeof row.tmax === 'number' && typeof row.tmin === 'number' ? row.tmax - row.tmin : null;
      return {
        date: row.observed_date,
        year: dt.year,
        month: dt.month,
        day: dt.day,
        maxTemp: row.tmax,
        minTemp: row.tmin,
        meanTemp,
        range
      };
    })
    .filter((row) => row.maxTemp !== null || row.minTemp !== null || row.meanTemp !== null);
};

const loadRainfallRows = (): RainfallRow[] => {
  const rows = db
    .prepare(
      `SELECT observed_date, rainfall_total
       FROM precipitation_history
       WHERE station_id = ?
       ORDER BY observed_date ASC`
    )
    .all(config.stationId) as Array<{ observed_date: string; rainfall_total: number | null }>;

  return rows.map((row) => {
    const dt = asDateTime(row.observed_date);
    return {
      date: row.observed_date,
      year: dt.year,
      month: dt.month,
      day: dt.day,
      rainfall: row.rainfall_total
    };
  });
};

const loadMonthlyManualRows = (): MonthlyManualRow[] =>
  (db
    .prepare(
      `SELECT summary_year, summary_month, highest_pressure, lowest_pressure, highest_wind_gust,
              lightning_count, thunder_days
       FROM climate_monthly_observations
       WHERE station_id = ?
       ORDER BY summary_year ASC, summary_month ASC`
    )
    .all(config.stationId) as Array<{
    summary_year: number;
    summary_month: number;
    highest_pressure: number | null;
    lowest_pressure: number | null;
    highest_wind_gust: number | null;
    lightning_count: number | null;
    thunder_days: number | null;
  }>).map((row) => ({
    year: row.summary_year,
    month: row.summary_month,
    highestPressure: row.highest_pressure,
    lowestPressure: row.lowest_pressure,
    highestWindGust: row.highest_wind_gust,
    lightningCount: row.lightning_count,
    thunderDays: row.thunder_days
  }));

const groupByMonth = (rows: TemperatureRow[]): MonthlyTemperatureAggregate[] => {
  const groups = new Map<string, TemperatureRow[]>();
  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, bucket]) => {
      const [yearText, monthText] = key.split('-');
      const maxTemp = bucket.reduce<number | null>((current, row) => {
        if (row.maxTemp === null) return current;
        return current === null ? row.maxTemp : Math.max(current, row.maxTemp);
      }, null);
      const minTemp = bucket.reduce<number | null>((current, row) => {
        if (row.minTemp === null) return current;
        return current === null ? row.minTemp : Math.min(current, row.minTemp);
      }, null);
      return {
        year: Number(yearText),
        month: Number(monthText),
        avgMax: round(average(bucket.map((row) => row.maxTemp))),
        avgMin: round(average(bucket.map((row) => row.minTemp))),
        meanTemp: round(average(bucket.map((row) => row.meanTemp))),
        maxTemp: round(maxTemp),
        minTemp: round(minTemp),
        range: maxTemp !== null && minTemp !== null ? round(maxTemp - minTemp) : null,
        days: bucket.length
      };
    })
    .sort((left, right) => (left.year === right.year ? left.month - right.month : left.year - right.year));
};

const groupTemperatureByYear = (rows: TemperatureRow[]): AnnualTemperatureAggregate[] => {
  const groups = new Map<number, TemperatureRow[]>();
  for (const row of rows) {
    const bucket = groups.get(row.year) ?? [];
    bucket.push(row);
    groups.set(row.year, bucket);
  }

  return [...groups.entries()]
    .map(([year, bucket]) => {
      const maxTemp = bucket.reduce<number | null>((current, row) => {
        if (row.maxTemp === null) return current;
        return current === null ? row.maxTemp : Math.max(current, row.maxTemp);
      }, null);
      const minTemp = bucket.reduce<number | null>((current, row) => {
        if (row.minTemp === null) return current;
        return current === null ? row.minTemp : Math.min(current, row.minTemp);
      }, null);
      return {
        year,
        meanTemp: round(average(bucket.map((row) => row.meanTemp))),
        avgMax: round(average(bucket.map((row) => row.maxTemp))),
        avgMin: round(average(bucket.map((row) => row.minTemp))),
        maxTemp: round(maxTemp),
        minTemp: round(minTemp),
        frostDays: bucket.filter((row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0).length,
        iceDays: bucket.filter((row) => (row.maxTemp ?? Number.POSITIVE_INFINITY) < 0).length,
        hotDays20: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 20).length,
        hotDays25: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 25).length,
        hotDays30: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 30).length,
        tropicalNights: bucket.filter((row) => (row.minTemp ?? Number.NEGATIVE_INFINITY) >= 20).length
      };
    })
    .sort((left, right) => left.year - right.year);
};

const groupRainByMonth = (rows: RainfallRow[]): MonthlyRainAggregate[] => {
  const groups = new Map<string, RainfallRow[]>();
  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, bucket]) => {
      const [yearText, monthText] = key.split('-');
      return {
        year: Number(yearText),
        month: Number(monthText),
        totalRainfall: round(sum(bucket.map((row) => row.rainfall)), 1) ?? 0,
        rainDays01: bucket.filter((row) => (row.rainfall ?? 0) > 0.1).length,
        rainDays1: bucket.filter((row) => (row.rainfall ?? 0) > 1).length,
        rainDays5: bucket.filter((row) => (row.rainfall ?? 0) > 5).length,
        rainDays10: bucket.filter((row) => (row.rainfall ?? 0) > 10).length,
        rainDays25: bucket.filter((row) => (row.rainfall ?? 0) > 25).length
      };
    })
    .sort((left, right) => (left.year === right.year ? left.month - right.month : left.year - right.year));
};

const groupRainByYear = (rows: MonthlyRainAggregate[]): AnnualRainAggregate[] => {
  const groups = new Map<number, MonthlyRainAggregate[]>();
  for (const row of rows) {
    const bucket = groups.get(row.year) ?? [];
    bucket.push(row);
    groups.set(row.year, bucket);
  }

  return [...groups.entries()]
    .map(([year, bucket]) => ({
      year,
      month: 0,
      totalRainfall: round(sum(bucket.map((row) => row.totalRainfall)), 1) ?? 0,
      rainDays01: sum(bucket.map((row) => row.rainDays01)),
      rainDays1: sum(bucket.map((row) => row.rainDays1)),
      rainDays5: sum(bucket.map((row) => row.rainDays5)),
      rainDays10: sum(bucket.map((row) => row.rainDays10)),
      rainDays25: sum(bucket.map((row) => row.rainDays25))
    }))
    .sort((left, right) => left.year - right.year);
};

const buildRankings = <T extends { year: number }>(
  rows: T[],
  accessor: (row: T) => number | null,
  mode: 'desc' | 'asc'
): RankingRow[] => {
  const filtered = rows
    .map((row) => ({ year: row.year, value: accessor(row) }))
    .filter((row): row is { year: number; value: number } => row.value !== null)
    .sort((left, right) => {
      if (left.value === right.value) return left.year - right.year;
      return mode === 'desc' ? right.value - left.value : left.value - right.value;
    });

  return filtered.map((row, index) => ({ year: row.year, value: round(row.value) ?? row.value, rank: index + 1 }));
};

const buildMonthlyRankings = (rows: MonthlyTemperatureAggregate[], mode: 'desc' | 'asc') =>
  MONTH_NAMES.map((monthName, index) => {
    const month = index + 1;
    const ranked = rows
      .filter((row) => row.month === month && row.meanTemp !== null)
      .sort((left, right) => {
        if ((left.meanTemp ?? 0) === (right.meanTemp ?? 0)) return left.year - right.year;
        return mode === 'desc'
          ? (right.meanTemp ?? 0) - (left.meanTemp ?? 0)
          : (left.meanTemp ?? 0) - (right.meanTemp ?? 0);
      })
      .map((row, rank) => ({
        year: row.year,
        value: row.meanTemp ?? 0,
        rank: rank + 1,
        label: formatMonthLabel(row.year, row.month)
      }));

    return { month, monthName, rows: ranked };
  });

const buildDayOfYearClimatology = (rows: TemperatureRow[]) => {
  const groups = new Map<string, TemperatureRow[]>();
  for (const row of rows) {
    const key = `${String(row.month).padStart(2, '0')}-${String(row.day).padStart(2, '0')}`;
    const bucket = groups.get(key) ?? [];
    bucket.push(row);
    groups.set(key, bucket);
  }

  return [...groups.entries()]
    .map(([key, bucket]) => {
      const month = Number(key.slice(0, 2));
      const day = Number(key.slice(3, 5));
      const warmest = pickValueRecord(bucket, (row) => row.maxTemp, 'max');
      const coldest = pickValueRecord(bucket, (row) => row.minTemp, 'min');
      return {
        month,
        day,
        label: `${day} ${MONTH_NAMES[month - 1]}`,
        averageMax: round(average(bucket.map((row) => row.maxTemp))),
        averageMin: round(average(bucket.map((row) => row.minTemp))),
        warmestOccurrence: warmest,
        coldestOccurrence: coldest,
        yearsAbove20: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 20).length,
        yearsAbove25: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 25).length,
        yearsAbove30: bucket.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 30).length,
        frostYears: bucket.filter((row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0).length
      };
    })
    .sort((left, right) => (left.month === right.month ? left.day - right.day : left.month - right.month));
};

const buildStreak = <T extends { date: string }>(rows: T[], predicate: (row: T) => boolean, label: string) => {
  let bestLength = 0;
  let bestStart: string | null = null;
  let bestEnd: string | null = null;
  let currentLength = 0;
  let currentStart: string | null = null;
  let previousDate: DateTime | null = null;

  for (const row of rows) {
    const currentDate = asDateTime(row.date);
    const passes = predicate(row);
    const consecutive =
      previousDate !== null && Math.round(currentDate.diff(previousDate, 'days').days) === 1;

    if (passes) {
      if (currentLength === 0 || !consecutive) {
        currentLength = 1;
        currentStart = row.date;
      } else {
        currentLength += 1;
      }

      if (currentLength > bestLength) {
        bestLength = currentLength;
        bestStart = currentStart;
        bestEnd = row.date;
      }
    } else {
      currentLength = 0;
      currentStart = null;
    }

    previousDate = currentDate;
  }

  return {
    label,
    length: bestLength,
    startDate: bestStart,
    endDate: bestEnd,
    year: bestStart ? asDateTime(bestStart).year : null
  };
};

const buildSeasonalBoundary = (
  rows: TemperatureRow[],
  predicate: (row: TemperatureRow) => boolean,
  mode: 'first' | 'last'
) => {
  const byYear = new Map<number, TemperatureRow[]>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const bucket = byYear.get(row.year) ?? [];
    bucket.push(row);
    byYear.set(row.year, bucket);
  }

  const perYear = [...byYear.entries()].map(([year, bucket]) => {
    const sorted = [...bucket].sort(compareDateAsc);
    const target = mode === 'first' ? sorted[0] : sorted[sorted.length - 1];
    return { year, date: target.date, month: target.month, day: target.day };
  });

  if (!perYear.length) return null;

  const sorted = [...perYear].sort((left, right) => {
    const leftKey = left.month * 100 + left.day;
    const rightKey = right.month * 100 + right.day;
    if (leftKey === rightKey) return left.year - right.year;
    return mode === 'first' ? leftKey - rightKey : rightKey - leftKey;
  });

  const selected = sorted[0];
  return {
    date: selected.date,
    label: `${selected.day} ${MONTH_NAMES[selected.month - 1]}`,
    year: selected.year
  };
};

const buildRainSpells = (rows: RainfallRow[]) => ({
  longestDrySpell: buildStreak(rows, (row) => (row.rainfall ?? 0) <= 0.1, 'Longest dry spell'),
  longestWetSpell: buildStreak(rows, (row) => (row.rainfall ?? 0) > 0.1, 'Longest wet spell')
});

const buildRecordTimeline = (
  dailyTempRows: TemperatureRow[],
  dailyRainRows: RainfallRow[],
  monthlyTempRows: MonthlyTemperatureAggregate[],
  manualRows: MonthlyManualRow[]
): RecordTimelineRow[] => {
  const timeline: RecordTimelineRow[] = [];

  const pushSeries = <T extends { date: string; year: number }>(
    category: string,
    label: string,
    rows: T[],
    accessor: (row: T) => number | null,
    comparator: (candidate: number, record: number) => boolean
  ) => {
    let recordValue: number | null = null;
    let recordDate: string | null = null;
    const events: RecordTimelineRow[] = [];

    for (const row of rows) {
      const value = accessor(row);
      if (value === null) continue;
      if (recordValue === null || comparator(value, recordValue)) {
        events.push({
          category,
          label,
          value: round(value) ?? value,
          date: row.date,
          year: row.year,
          previousValue: recordValue === null ? null : round(recordValue) ?? recordValue,
          previousDate: recordDate,
          isLatest: false
        });
        recordValue = value;
        recordDate = row.date;
      }
    }

    if (events.length) {
      events[events.length - 1].isLatest = true;
      timeline.push(...events);
    }
  };

  pushSeries('temperature', 'Highest daily maximum', dailyTempRows, (row) => row.maxTemp, (candidate, record) => candidate > record);
  pushSeries('temperature', 'Lowest daily minimum', dailyTempRows, (row) => row.minTemp, (candidate, record) => candidate < record);
  pushSeries('rainfall', 'Wettest day', dailyRainRows, (row) => row.rainfall, (candidate, record) => candidate > record);

  pushSeries(
    'temperature',
    'Warmest month mean',
    monthlyTempRows.map((row) => ({ ...row, date: `${row.year}-${String(row.month).padStart(2, '0')}-01` })),
    (row) => row.meanTemp,
    (candidate, record) => candidate > record
  );

  pushSeries(
    'monthly-summary',
    'Highest monthly lightning count',
    manualRows.map((row) => ({ ...row, date: `${row.year}-${String(row.month).padStart(2, '0')}-01` })),
    (row) => row.lightningCount ?? null,
    (candidate, record) => candidate > record
  );

  return timeline.sort((left, right) => left.date.localeCompare(right.date));
};

const buildComparisonSeries = (
  currentYear: number,
  monthlyTemp: MonthlyTemperatureAggregate[],
  monthlyRain: MonthlyRainAggregate[]
) => {
  const years = [...new Set([...monthlyTemp.map((row) => row.year), ...monthlyRain.map((row) => row.year)])].sort((a, b) => a - b);

  const temperatureYtd = MONTH_NAMES.map((monthName, monthIndex) => {
    const month = monthIndex + 1;
    const entry: Record<string, string | number | null> = { month: monthName };
    const monthTemps = monthlyTemp.filter((row) => row.month === month && row.meanTemp !== null);
    entry.average = round(average(monthTemps.map((row) => row.meanTemp)));
    for (const year of years) {
      entry[String(year)] = monthlyTemp.find((row) => row.year === year && row.month === month)?.meanTemp ?? null;
    }
    return entry;
  });

  const rainfallYtd = MONTH_NAMES.map((monthName, monthIndex) => {
    const month = monthIndex + 1;
    const entry: Record<string, string | number | null> = { month: monthName };
    const cumulativeByYear = years.map((year) =>
      sum(monthlyRain.filter((row) => row.year === year && row.month <= month).map((row) => row.totalRainfall))
    );
    entry.average = round(average(cumulativeByYear));
    for (const year of years) {
      entry[String(year)] = round(
        sum(monthlyRain.filter((row) => row.year === year && row.month <= month).map((row) => row.totalRainfall))
      );
    }
    return entry;
  });

  return {
    currentYear,
    availableYears: years,
    temperatureYtd,
    rainfallYtd
  };
};

const buildMonthlySummaryExtremes = (rows: MonthlyManualRow[]) => {
  const highestPressure = [...rows]
    .filter((row) => row.highestPressure !== null)
    .sort((left, right) => {
      if ((left.highestPressure ?? 0) === (right.highestPressure ?? 0)) {
        return left.year === right.year ? left.month - right.month : left.year - right.year;
      }
      return (right.highestPressure ?? 0) - (left.highestPressure ?? 0);
    })[0];
  const lowestPressure = [...rows]
    .filter((row) => row.lowestPressure !== null)
    .sort((left, right) => {
      if ((left.lowestPressure ?? 0) === (right.lowestPressure ?? 0)) {
        return left.year === right.year ? left.month - right.month : left.year - right.year;
      }
      return (left.lowestPressure ?? 0) - (right.lowestPressure ?? 0);
    })[0];
  const highestWindGust = [...rows]
    .filter((row) => row.highestWindGust !== null)
    .sort((left, right) => {
      if ((left.highestWindGust ?? 0) === (right.highestWindGust ?? 0)) {
        return left.year === right.year ? left.month - right.month : left.year - right.year;
      }
      return (right.highestWindGust ?? 0) - (left.highestWindGust ?? 0);
    })[0];
  const highestLightning = [...rows]
    .filter((row) => row.lightningCount !== null)
    .sort((left, right) => {
      if ((left.lightningCount ?? 0) === (right.lightningCount ?? 0)) {
        return left.year === right.year ? left.month - right.month : left.year - right.year;
      }
      return (right.lightningCount ?? 0) - (left.lightningCount ?? 0);
    })[0];
  const mostThunderDaysMonth = [...rows]
    .filter((row) => row.thunderDays !== null)
    .sort((left, right) => {
      if ((left.thunderDays ?? 0) === (right.thunderDays ?? 0)) {
        return left.year === right.year ? left.month - right.month : left.year - right.year;
      }
      return (right.thunderDays ?? 0) - (left.thunderDays ?? 0);
    })[0];

  const thunderYears = new Map<number, number>();
  rows.forEach((row) => {
    thunderYears.set(row.year, (thunderYears.get(row.year) ?? 0) + (row.thunderDays ?? 0));
  });

  const mostThunderDaysYear = [...thunderYears.entries()]
    .sort((left, right) => (right[1] === left[1] ? left[0] - right[0] : right[1] - left[1]))
    .map(([year, value]) => ({ year, value }))[0] ?? null;

  const toPayload = (
    row: MonthlyManualRow | undefined,
    value: number | null | undefined,
    fallbackYear?: number
  ) =>
    row && value !== null && value !== undefined
      ? {
          value: round(value),
          month: MONTH_NAMES[row.month - 1],
          year: row.year,
          label: formatMonthLabel(row.year, row.month)
        }
      : fallbackYear !== undefined && value !== null && value !== undefined
        ? { value: round(value), year: fallbackYear }
        : null;

  return {
    highestPressure: toPayload(highestPressure, highestPressure?.highestPressure),
    lowestPressure: toPayload(lowestPressure, lowestPressure?.lowestPressure),
    highestWindGust: toPayload(highestWindGust, highestWindGust?.highestWindGust),
    highestLightningCount: toPayload(highestLightning, highestLightning?.lightningCount),
    mostThunderDaysMonth: toPayload(mostThunderDaysMonth, mostThunderDaysMonth?.thunderDays),
    mostThunderDaysYear:
      mostThunderDaysYear !== null
        ? { value: mostThunderDaysYear.value, year: mostThunderDaysYear.year }
        : null
  };
};

const validateMonthlySummaryInput = (input: MonthlySummaryInput): string[] => {
  const issues: string[] = [];
  const maxAllowedYear = DateTime.now().year + 5;
  if (
    !Number.isInteger(input.year) ||
    input.year < config.temperatureHistoryStartYear ||
    input.year > maxAllowedYear
  ) {
    issues.push(`year must be between ${config.temperatureHistoryStartYear} and ${maxAllowedYear}`);
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    issues.push('month must be between 1 and 12');
  }
  if (input.highestPressure !== undefined && input.highestPressure !== null && (input.highestPressure < 850 || input.highestPressure > 1100)) {
    issues.push('highestPressure must be between 850 and 1100 hPa');
  }
  if (input.lowestPressure !== undefined && input.lowestPressure !== null && (input.lowestPressure < 850 || input.lowestPressure > 1100)) {
    issues.push('lowestPressure must be between 850 and 1100 hPa');
  }
  if (
    input.highestPressure !== undefined &&
    input.lowestPressure !== undefined &&
    input.highestPressure !== null &&
    input.lowestPressure !== null &&
    input.lowestPressure > input.highestPressure
  ) {
    issues.push('lowestPressure cannot exceed highestPressure');
  }
  if (input.highestWindGust !== undefined && input.highestWindGust !== null && input.highestWindGust < 0) {
    issues.push('highestWindGust cannot be negative');
  }
  if (input.lightningCount !== undefined && input.lightningCount !== null && input.lightningCount < 0) {
    issues.push('lightningCount cannot be negative');
  }
  if (input.thunderDays !== undefined && input.thunderDays !== null && (input.thunderDays < 0 || input.thunderDays > 31)) {
    issues.push('thunderDays must be between 0 and 31');
  }
  return issues;
};

export const upsertClimateMonthlySummary = (input: MonthlySummaryInput) => {
  const issues = validateMonthlySummaryInput(input);
  if (issues.length) {
    return { ok: false, issues };
  }

  db.prepare(
    `INSERT INTO climate_monthly_observations(
      station_id, summary_year, summary_month, highest_pressure, lowest_pressure,
      highest_wind_gust, lightning_count, thunder_days
    ) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(station_id, summary_year, summary_month) DO UPDATE SET
      highest_pressure=excluded.highest_pressure,
      lowest_pressure=excluded.lowest_pressure,
      highest_wind_gust=excluded.highest_wind_gust,
      lightning_count=excluded.lightning_count,
      thunder_days=excluded.thunder_days,
      updated_at=datetime('now')`
  ).run(
    config.stationId,
    input.year,
    input.month,
    input.highestPressure ?? null,
    input.lowestPressure ?? null,
    input.highestWindGust ?? null,
    input.lightningCount ?? null,
    input.thunderDays ?? null
  );

  return { ok: true, issues: [] as string[] };
};

export const getClimatePlatformOverview = () => {
  const temperatureRows = loadTemperatureRows();
  const rainfallRows = loadRainfallRows();
  const manualRows = loadMonthlyManualRows();
  const monthlyTemp = groupByMonth(temperatureRows);
  const annualTemp = groupTemperatureByYear(temperatureRows);
  const monthlyRain = groupRainByMonth(rainfallRows);
  const annualRain = groupRainByYear(monthlyRain);
  const currentYear =
    [...annualTemp.map((row) => row.year), ...annualRain.map((row) => row.year)].sort((a, b) => b - a)[0] ?? DateTime.now().year;

  const highestMax = pickValueRecord(temperatureRows, (row) => row.maxTemp, 'max');
  const lowestMax = pickValueRecord(temperatureRows, (row) => row.maxTemp, 'min');
  const highestMin = pickValueRecord(temperatureRows, (row) => row.minTemp, 'max');
  const lowestMin = pickValueRecord(temperatureRows, (row) => row.minTemp, 'min');
  const largestRangeSource = pickValueRecord(temperatureRows, (row) => row.range, 'max');
  const smallestRangeSource = pickValueRecord(temperatureRows, (row) => row.range, 'min');
  const largestRangeRow = largestRangeSource ? temperatureRows.find((row) => row.date === largestRangeSource.date) ?? null : null;

  const monthlyExtremes = MONTH_NAMES.map((monthName, monthIndex) => {
    const month = monthIndex + 1;
    const dailyRows = temperatureRows.filter((row) => row.month === month);
    const monthlyRows = monthlyTemp.filter((row) => row.month === month);

    const highMax = pickValueRecord(dailyRows, (row) => row.maxTemp, 'max');
    const lowMax = pickValueRecord(dailyRows, (row) => row.maxTemp, 'min');
    const highMin = pickValueRecord(dailyRows, (row) => row.minTemp, 'max');
    const lowMin = pickValueRecord(dailyRows, (row) => row.minTemp, 'min');

    const warmestMonth = [...monthlyRows]
      .filter((row) => row.meanTemp !== null)
      .sort((left, right) => {
        if ((left.meanTemp ?? 0) === (right.meanTemp ?? 0)) return left.year - right.year;
        return (right.meanTemp ?? 0) - (left.meanTemp ?? 0);
      })[0] ?? null;
    const coldestMonth = [...monthlyRows]
      .filter((row) => row.meanTemp !== null)
      .sort((left, right) => {
        if ((left.meanTemp ?? 0) === (right.meanTemp ?? 0)) return left.year - right.year;
        return (left.meanTemp ?? 0) - (right.meanTemp ?? 0);
      })[0] ?? null;
    const largestMonthRange = [...monthlyRows]
      .filter((row) => row.range !== null)
      .sort((left, right) => {
        if ((left.range ?? 0) === (right.range ?? 0)) return left.year - right.year;
        return (right.range ?? 0) - (left.range ?? 0);
      })[0] ?? null;

    return {
      month,
      monthName,
      highestMonthlyMaximum: highMax,
      lowestMonthlyMaximum: lowMax,
      highestMonthlyMinimum: highMin,
      lowestMonthlyMinimum: lowMin,
      warmestMonthlyMean:
        warmestMonth !== null
          ? { value: warmestMonth.meanTemp, month: monthName, year: warmestMonth.year, label: formatMonthLabel(warmestMonth.year, month) }
          : null,
      coldestMonthlyMean:
        coldestMonth !== null
          ? { value: coldestMonth.meanTemp, month: monthName, year: coldestMonth.year, label: formatMonthLabel(coldestMonth.year, month) }
          : null,
      largestMonthlyRange:
        largestMonthRange !== null
          ? { value: largestMonthRange.range, month: monthName, year: largestMonthRange.year, label: formatMonthLabel(largestMonthRange.year, month) }
          : null
    };
  });

  const warmestYear = buildRankings(annualTemp, (row) => row.meanTemp, 'desc')[0] ?? null;
  const coldestYear = buildRankings(annualTemp, (row) => row.meanTemp, 'asc')[0] ?? null;
  const highestAnnualMeanMax = buildRankings(annualTemp, (row) => row.avgMax, 'desc')[0] ?? null;
  const lowestAnnualMeanMax = buildRankings(annualTemp, (row) => row.avgMax, 'asc')[0] ?? null;
  const highestAnnualMeanMin = buildRankings(annualTemp, (row) => row.avgMin, 'desc')[0] ?? null;
  const lowestAnnualMeanMin = buildRankings(annualTemp, (row) => row.avgMin, 'asc')[0] ?? null;

  const monthlyClimatology = MONTH_NAMES.map((monthName, monthIndex) => {
    const month = monthIndex + 1;
    const monthRows = monthlyTemp.filter((row) => row.month === month);
    const dailyRows = temperatureRows.filter((row) => row.month === month);
    return {
      month,
      monthName,
      averageMaximum: round(average(monthRows.map((row) => row.avgMax))),
      averageMinimum: round(average(monthRows.map((row) => row.avgMin))),
      averageMean: round(average(monthRows.map((row) => row.meanTemp))),
      recordHigh: pickValueRecord(dailyRows, (row) => row.maxTemp, 'max'),
      recordLow: pickValueRecord(dailyRows, (row) => row.minTemp, 'min')
    };
  });

  const dayOfYearClimatology = buildDayOfYearClimatology(temperatureRows);

  const thresholdStats = {
    maxTemperatureDays: MAX_TEMP_THRESHOLDS.map((threshold) => ({
      threshold,
      count: temperatureRows.filter((row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= threshold).length
    })),
    minimumTemperature: MIN_TEMP_THRESHOLDS.map((threshold) => ({
      threshold,
      count: temperatureRows.filter((row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < threshold).length
    })),
    warmNights: WARM_NIGHT_THRESHOLDS.map((threshold) => ({
      threshold,
      count: temperatureRows.filter((row) => (row.minTemp ?? Number.NEGATIVE_INFINITY) >= threshold).length
    })),
    frostDays: temperatureRows.filter((row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0).length,
    iceDays: temperatureRows.filter((row) => (row.maxTemp ?? Number.POSITIVE_INFINITY) < 0).length
  };

  const streaks = [
    buildStreak(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) > 25, 'Longest heatwave (>25°C)'),
    buildStreak(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) > 30, 'Longest hot spell (>30°C)'),
    buildStreak(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) > 20, 'Longest run above 20°C'),
    buildStreak(temperatureRows, (row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0, 'Longest frost spell'),
    buildStreak(temperatureRows, (row) => (row.maxTemp ?? Number.POSITIVE_INFINITY) < 0, 'Longest run below freezing')
  ];

  const earliestLatestEvents = {
    reaches20: { earliest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 20, 'first'), latest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 20, 'last') },
    reaches25: { earliest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 25, 'first'), latest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 25, 'last') },
    reaches30: { earliest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 30, 'first'), latest: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 30, 'last') },
    reaches35: {
      earliest: buildSeasonalBoundary(
        temperatureRows,
        (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 35,
        'first'
      ),
      latest: buildSeasonalBoundary(
        temperatureRows,
        (row) => (row.maxTemp ?? Number.NEGATIVE_INFINITY) >= 35,
        'last'
      )
    },
    firstFrost: buildSeasonalBoundary(temperatureRows, (row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0, 'first'),
    lastFrost: buildSeasonalBoundary(temperatureRows, (row) => (row.minTemp ?? Number.POSITIVE_INFINITY) < 0, 'last'),
    firstIceDay: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.POSITIVE_INFINITY) < 0, 'first'),
    lastIceDay: buildSeasonalBoundary(temperatureRows, (row) => (row.maxTemp ?? Number.POSITIVE_INFINITY) < 0, 'last'),
    firstTropicalNight: buildSeasonalBoundary(temperatureRows, (row) => (row.minTemp ?? Number.NEGATIVE_INFINITY) >= 20, 'first'),
    lastTropicalNight: buildSeasonalBoundary(temperatureRows, (row) => (row.minTemp ?? Number.NEGATIVE_INFINITY) >= 20, 'last')
  };

  const wettestDay = pickRainRecord(rainfallRows, (row) => row.rainfall, 'max');
  const wettestMonth = [...monthlyRain].sort((left, right) => right.totalRainfall - left.totalRainfall || left.year - right.year || left.month - right.month)[0] ?? null;
  const driestMonth = [...monthlyRain].sort((left, right) => left.totalRainfall - right.totalRainfall || left.year - right.year || left.month - right.month)[0] ?? null;
  const wettestYear = [...annualRain].sort((left, right) => right.totalRainfall - left.totalRainfall || left.year - right.year)[0] ?? null;
  const driestYear = [...annualRain].sort((left, right) => left.totalRainfall - right.totalRainfall || left.year - right.year)[0] ?? null;
  const rainSpells = buildRainSpells(rainfallRows);
  const rainDayCounts = RAIN_THRESHOLDS.map((threshold) => ({
    threshold,
    count: rainfallRows.filter((row) => (row.rainfall ?? 0) > threshold).length
  }));

  const monthlySummaryExtremes = buildMonthlySummaryExtremes(manualRows);
  const mostThunderDays = buildRankings(
    [...new Map(manualRows.map((row) => [row.year, { year: row.year, thunderDays: 0 }])).values()].map((row) => ({
      ...row,
      thunderDays: manualRows.filter((manual) => manual.year === row.year).reduce((total, manual) => total + (manual.thunderDays ?? 0), 0)
    })),
    (row) => row.thunderDays,
    'desc'
  );
  const highestLightningYears = buildRankings(
    [...new Map(manualRows.map((row) => [row.year, { year: row.year, lightningCount: 0 }])).values()].map((row) => ({
      ...row,
      lightningCount: manualRows.filter((manual) => manual.year === row.year).reduce((total, manual) => total + (manual.lightningCount ?? 0), 0)
    })),
    (row) => row.lightningCount,
    'desc'
  );

  const rankings = {
    warmestYears: buildRankings(annualTemp, (row) => row.meanTemp, 'desc'),
    coldestYears: buildRankings(annualTemp, (row) => row.meanTemp, 'asc'),
    wettestYears: buildRankings(annualRain, (row) => row.totalRainfall, 'desc'),
    driestYears: buildRankings(annualRain, (row) => row.totalRainfall, 'asc'),
    mostFrostDays: buildRankings(annualTemp, (row) => row.frostDays, 'desc'),
    mostHotDays: buildRankings(annualTemp, (row) => row.hotDays25, 'desc'),
    most30cDays: buildRankings(annualTemp, (row) => row.hotDays30, 'desc'),
    mostThunderDays,
    highestLightningYears
  };

  const comparisons = buildComparisonSeries(currentYear, monthlyTemp, monthlyRain);
  const recordHistory = buildRecordTimeline(temperatureRows, rainfallRows, monthlyTemp, manualRows);

  const currentYearTemp = annualTemp.find((row) => row.year === currentYear) ?? null;
  const currentYearRain = annualRain.find((row) => row.year === currentYear) ?? null;
  const historicalTemps = annualTemp.filter((row) => row.year !== currentYear && row.meanTemp !== null);
  const historicalRain = annualRain.filter((row) => row.year !== currentYear);
  const meanHistoricalTemp = average(historicalTemps.map((row) => row.meanTemp));
  const meanHistoricalRain = average(historicalRain.map((row) => row.totalRainfall));

  const aiSummaries = [
    currentYearTemp?.meanTemp != null
      ? `${currentYear} is running at ${currentYearTemp.meanTemp}°C mean temperature, ${round((currentYearTemp.meanTemp ?? 0) - (meanHistoricalTemp ?? 0))}°C versus the rest of the archive.`
      : `${currentYear} does not yet have enough temperature data for a year-to-date thermal summary.`,
    currentYearRain
      ? `${currentYear} has accumulated ${currentYearRain.totalRainfall} mm of rainfall against an archive annual mean of ${round(meanHistoricalRain)} mm.`
      : `${currentYear} does not yet have enough rainfall data for a year-to-date rainfall summary.`,
    rankings.warmestYears[0]
      ? `The warmest year on record is ${rankings.warmestYears[0].year} with a mean temperature of ${rankings.warmestYears[0].value}°C, while the wettest year is ${rankings.wettestYears[0]?.year ?? 'n/a'}.`
      : 'Import temperature and rainfall data to unlock professional AI-ready climate summaries.'
  ];

  return {
    station: {
      stationId: config.stationId,
      timezone: config.timezone,
      temperatureCoverageStart: config.temperatureHistoryStartYear,
      rainfallCoverageStart: config.rainfallHistoryStartYear
    },
    dataStatus: {
      temperatureDays: temperatureRows.length,
      rainfallDays: rainfallRows.length,
      monthlySummaryMonths: manualRows.length,
      firstTemperatureDate: temperatureRows[0]?.date ?? null,
      latestTemperatureDate: temperatureRows[temperatureRows.length - 1]?.date ?? null,
      firstRainfallDate: rainfallRows[0]?.date ?? null,
      latestRainfallDate: rainfallRows[rainfallRows.length - 1]?.date ?? null,
      yearsCovered: [...new Set([...temperatureRows.map((row) => row.year), ...rainfallRows.map((row) => row.year)])].length
    },
    temperature: {
      dailyExtremes: {
        highestDailyMaximum: highestMax,
        lowestDailyMaximum: lowestMax,
        highestDailyMinimum: highestMin,
        lowestDailyMinimum: lowestMin,
        largestDailyRange:
          largestRangeSource && largestRangeRow
            ? {
                difference: largestRangeSource.value,
                maximumTemperature: largestRangeRow.maxTemp,
                minimumTemperature: largestRangeRow.minTemp,
                date: largestRangeSource.date,
                year: largestRangeSource.year,
                label: largestRangeSource.label
              }
            : null,
        smallestDailyRange:
          smallestRangeSource
            ? {
                difference: smallestRangeSource.value,
                date: smallestRangeSource.date,
                year: smallestRangeSource.year,
                label: smallestRangeSource.label
              }
            : null
      },
      monthlyExtremes,
      annualExtremes: {
        warmestYear,
        coldestYear,
        highestAnnualMeanMaximum: highestAnnualMeanMax,
        lowestAnnualMeanMaximum: lowestAnnualMeanMax,
        highestAnnualMeanMinimum: highestAnnualMeanMin,
        lowestAnnualMeanMinimum: lowestAnnualMeanMin
      },
      monthlyClimatology,
      monthlyRankings: {
        warmest: buildMonthlyRankings(monthlyTemp, 'desc'),
        coldest: buildMonthlyRankings(monthlyTemp, 'asc')
      },
      dayOfYearClimatology,
      thresholdStats,
      streaks,
      earliestLatestEvents
    },
    rainfall: {
      extremes: {
        wettestDay,
        wettestMonth:
          wettestMonth !== null
            ? { value: wettestMonth.totalRainfall, month: MONTH_NAMES[wettestMonth.month - 1], year: wettestMonth.year, label: formatMonthLabel(wettestMonth.year, wettestMonth.month) }
            : null,
        driestMonth:
          driestMonth !== null
            ? { value: driestMonth.totalRainfall, month: MONTH_NAMES[driestMonth.month - 1], year: driestMonth.year, label: formatMonthLabel(driestMonth.year, driestMonth.month) }
            : null,
        wettestYear: wettestYear !== null ? { value: wettestYear.totalRainfall, year: wettestYear.year } : null,
        driestYear: driestYear !== null ? { value: driestYear.totalRainfall, year: driestYear.year } : null
      },
      spells: rainSpells,
      rainDayCounts
    },
    monthlySummary: {
      latestEntries: manualRows.slice(-12),
      extremes: monthlySummaryExtremes
    },
    rankings,
    comparisons,
    recordHistory,
    ai: {
      prompts: [
        'What was the hottest July?',
        'Rank every summer since 1995.',
        'What are the longest dry spells?',
        `How unusual was ${MONTH_NAMES[DateTime.now().month - 1]} ${currentYear}?`,
        `Compare ${currentYear} against previous years.`,
        'Which years had the most thunderstorms?'
      ],
      generatedSummaries: aiSummaries
    }
  };
};
