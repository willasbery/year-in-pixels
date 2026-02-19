import { describe, expect, it } from 'vitest';

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

  it('renders all days for years that require 54 week columns', () => {
    const grid = createYearGrid(2028, new Date(2028, 0, 1));
    const cells = flattenGridCells(grid.weeks);
    const lastDay = cells.find((cell) => cell.dateKey === '2028-12-31');

    expect(grid.weeks.length).toBe(54);
    expect(cells.length).toBe(366);
    expect(Boolean(lastDay)).toBe(true);
  });

  it('handles past and future years relative to today', () => {
    const now = new Date(2026, 1, 18);
    const pastYearCells = flattenGridCells(createYearGrid(2025, now).weeks);
    const futureYearCells = flattenGridCells(createYearGrid(2027, now).weeks);

    expect(pastYearCells.every((cell) => !cell.isFuture)).toBe(true);
    expect(pastYearCells.some((cell) => cell.isToday)).toBe(false);

    expect(futureYearCells.every((cell) => cell.isFuture)).toBe(true);
    expect(futureYearCells.some((cell) => cell.isToday)).toBe(false);
  });
});
