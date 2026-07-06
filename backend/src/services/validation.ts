import { DateTime } from 'luxon';
import { z } from 'zod';
import { config } from '../config';
import {
  HistoricalPrecipitationInput,
  HistoricalTemperatureInput,
  RawObservationInput,
  ValidationIssue
} from '../types';

const nullableNumber = z.number().finite().nullable().optional();

const rawSchema = z.object({
  timestamp_utc: z.string().min(1),
  timestamp_local: z.string().optional(),
  temperature: nullableNumber,
  humidity: nullableNumber,
  dew_point: nullableNumber,
  pressure: nullableNumber,
  wind_speed: nullableNumber,
  wind_direction: nullableNumber,
  wind_gust: nullableNumber,
  rainfall: nullableNumber,
  rain_rate: nullableNumber,
  solar_radiation: nullableNumber,
  uv_index: nullableNumber,
  quality_flag: z.string().max(20).optional()
});

const rangeRules: Record<string, [number, number]> = {
  temperature: [-60, 60],
  humidity: [0, 100],
  dew_point: [-80, 40],
  pressure: [850, 1100],
  wind_speed: [0, 160],
  wind_direction: [0, 360],
  wind_gust: [0, 220],
  rainfall: [0, 600],
  rain_rate: [0, 300],
  solar_radiation: [0, 1600],
  uv_index: [0, 20]
};

export const normalizeObservation = (row: RawObservationInput): RawObservationInput => {
  const parsed = rawSchema.parse(row);
  const utc = DateTime.fromISO(parsed.timestamp_utc, { zone: 'utc' });
  if (!utc.isValid) {
    throw new Error(`Invalid timestamp_utc: ${parsed.timestamp_utc}`);
  }

  const local = parsed.timestamp_local
    ? DateTime.fromISO(parsed.timestamp_local, { zone: config.timezone })
    : utc.setZone(config.timezone);

  if (!local.isValid) {
    throw new Error(`Invalid local timestamp for ${parsed.timestamp_utc}`);
  }

  return {
    ...parsed,
    timestamp_utc: utc.toISO({ suppressMilliseconds: true }) ?? parsed.timestamp_utc,
    timestamp_local:
      local.setZone(config.timezone).toISO({ suppressMilliseconds: true }) ??
      local.toISO() ??
      parsed.timestamp_local
  };
};

export const validateRanges = (row: RawObservationInput, rowIndex: number): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];

  Object.entries(rangeRules).forEach(([field, [min, max]]) => {
    const value = (row as unknown as Record<string, unknown>)[field];
    if (typeof value === 'number' && (value < min || value > max)) {
      issues.push({
        row: rowIndex,
        field,
        message: `Value ${value} outside allowed range ${min}..${max}`
      });
    }
  });

  if (
    typeof row.temperature === 'number' &&
    typeof row.dew_point === 'number' &&
    row.dew_point > row.temperature + 3
  ) {
    issues.push({
      row: rowIndex,
      field: 'dew_point',
      message: 'Dew point is unrealistically above temperature'
    });
  }

  return issues;
};

export const validateTemperatureHistory = (
  row: HistoricalTemperatureInput,
  rowIndex: number
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const date = DateTime.fromISO(row.observed_date, { zone: config.timezone });
  if (!date.isValid) {
    issues.push({ row: rowIndex, field: 'observed_date', message: 'Invalid ISO date' });
  }

  if (typeof row.tmin === 'number' && typeof row.tmax === 'number' && row.tmin > row.tmax) {
    issues.push({ row: rowIndex, field: 'tmin', message: 'tmin cannot exceed tmax' });
  }

  return issues;
};

export const validatePrecipHistory = (
  row: HistoricalPrecipitationInput,
  rowIndex: number
): ValidationIssue[] => {
  const issues: ValidationIssue[] = [];
  const date = DateTime.fromISO(row.observed_date, { zone: config.timezone });
  if (!date.isValid) {
    issues.push({ row: rowIndex, field: 'observed_date', message: 'Invalid ISO date' });
  }
  if ((row.rainfall_total ?? 0) < 0) {
    issues.push({ row: rowIndex, field: 'rainfall_total', message: 'rainfall_total cannot be negative' });
  }
  return issues;
};
