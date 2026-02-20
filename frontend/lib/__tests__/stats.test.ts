import { describe, expect, it } from 'vitest';

import { getCurrentStreak, getMonthlyAverages, getMoodDistribution } from '../stats';

describe('stats helpers', () => {
  it('computes streak from today backwards', () => {
    const entries = {
      '2026-02-18': { level: 4 as const },
      '2026-02-17': { level: 3 as const },
      '2026-02-16': { level: 5 as const },
      '2026-02-14': { level: 2 as const },
    };

    const streak = getCurrentStreak(entries, new Date(2026, 1, 18));

    expect(streak).toBe(3);
  });

  it('returns zero streak when there is no entry for today', () => {
    const entries = {
      '2026-02-17': { level: 3 as const },
      '2026-02-16': { level: 5 as const },
    };

    const streak = getCurrentStreak(entries, new Date(2026, 1, 18));

    expect(streak).toBe(0);
  });

  it('computes mood distribution', () => {
    const entries = {
      '2026-01-01': { level: 1 as const },
      '2026-01-02': { level: 3 as const },
      '2026-01-03': { level: 3 as const },
      '2026-01-04': { level: 5 as const },
    };

    expect(getMoodDistribution(entries)).toEqual({
      1: 1,
      2: 0,
      3: 2,
      4: 0,
      5: 1,
    });
  });

  it('computes monthly averages for a target year', () => {
    const entries = {
      '2026-01-03': { level: 2 as const },
      '2026-01-12': { level: 4 as const },
      '2026-03-09': { level: 5 as const },
      '2025-12-31': { level: 1 as const },
    };

    const monthly = getMonthlyAverages(entries, 2026, new Date(2026, 2, 20));

    expect(monthly).toHaveLength(12);
    expect(monthly[0]?.average).toBe(3);
    expect(monthly[0]?.status).toBe('has-data');
    expect(monthly[1]?.average).toBeNull();
    expect(monthly[1]?.status).toBe('no-data');
    expect(monthly[2]?.average).toBe(5);
    expect(monthly[2]?.status).toBe('has-data');
    expect(monthly[2]?.isCurrentMonth).toBe(true);
    expect(monthly[3]?.status).toBe('future');
  });
});
