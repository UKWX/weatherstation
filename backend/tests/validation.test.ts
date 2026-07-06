import { describe, expect, it } from 'vitest';
import { normalizeObservation, validateRanges } from '../src/services/validation';

describe('validation service', () => {
  it('normalizes UTC and local timestamps', () => {
    const row = normalizeObservation({
      timestamp_utc: '2025-05-17T12:00:00Z',
      temperature: 14
    });

    expect(row.timestamp_utc).toContain('2025-05-17T12:00:00');
    expect(row.timestamp_local).toBeDefined();
  });

  it('flags impossible values', () => {
    const issues = validateRanges(
      {
        timestamp_utc: '2025-05-17T12:00:00Z',
        humidity: 130
      },
      1
    );

    expect(issues.length).toBeGreaterThan(0);
  });
});
