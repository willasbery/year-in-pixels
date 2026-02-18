import { describe, expect, it } from 'bun:test';

import {
  createYearGrid,
  fromDateKey,
  getDaysInYear,
  isLeapYear,
  toDateKey,
} from '../date';

function flattenGridCells(weeks: ReturnType<typeof createYearGrid>['weeks']) {
  return weeks.flat().filter((cell): cell is NonNullable<typeof cell> => Boolean(cell));
}

describe('date helpers', () => {
  it('round-trips date keys', () => {
    const original = new Date(2026, 1, 18);
    const key = toDateKey(original);
    const roundTrip = fromDateKey(key);

    expect(key).toBe('2026-02-18');
    expect(toDateKey(roundTrip)).toBe(key);
  });

  it('handles leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(getDaysInYear(2024)).toBe(366);
    expect(getDaysInYear(2025)).toBe(365);
  });

  it('creates a full-year grid with correct today/future flags', () => {
    const now = new Date(2024, 5, 15);
    const grid = createYearGrid(2024, now);
    const cells = flattenGridCells(grid.weeks);
    const todayCell = cells.find((cell) => cell.dateKey === '2024-06-15');
    const nextDayCell = cells.find((cell) => cell.dateKey === '2024-06-16');

    expect(cells.length).toBe(366);
    expect(todayCell?.isToday).toBe(true);
    expect(todayCell?.isFuture).toBe(false);
    expect(nextDayCell?.isFuture).toBe(true);
  });
});
