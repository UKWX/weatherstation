import { DateTime } from 'luxon';
import { describe, expect, it } from 'vitest';

describe('timezone handling', () => {
  it('represents DST boundaries without invalid local date', () => {
    const before = DateTime.fromISO('2025-03-30T00:30:00Z').setZone('Europe/London');
    const after = DateTime.fromISO('2025-03-30T01:30:00Z').setZone('Europe/London');

    expect(before.isValid).toBe(true);
    expect(after.isValid).toBe(true);
    expect(before.toISODate()).toEqual(after.toISODate());
  });
});
