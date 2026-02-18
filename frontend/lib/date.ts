export const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;

type GridCell = {
  dateKey: string;
  isFuture: boolean;
  isToday: boolean;
};

export function toDateKey(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

export function fromDateKey(dateKey: string): Date {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
}

export function formatDateLabel(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'long',
    day: 'numeric',
  });
}

export function getTodayKey(now = new Date()): string {
  return toDateKey(now);
}

export function isLeapYear(year: number): boolean {
  return new Date(year, 1, 29).getMonth() === 1;
}

export function getDaysInYear(year: number): number {
  return isLeapYear(year) ? 366 : 365;
}

export function createYearGrid(year: number, now = new Date()) {
  const weeks: Array<Array<GridCell | null>> = Array.from({ length: 53 }, () =>
    Array.from({ length: 7 }, () => null),
  );
  const monthLabels: Record<number, string> = {};

  const todayKey = toDateKey(now);
  const jan1 = new Date(year, 0, 1);
  const startOffset = jan1.getDay();
  let dayIndex = 0;

  for (const cursor = new Date(year, 0, 1); cursor.getFullYear() === year; cursor.setDate(cursor.getDate() + 1)) {
    const weekIndex = Math.floor((dayIndex + startOffset) / 7);
    const weekdayIndex = cursor.getDay();
    const dateKey = toDateKey(cursor);

    if (cursor.getDate() === 1) {
      monthLabels[weekIndex] = cursor.toLocaleDateString(undefined, { month: 'short' });
    }

    weeks[weekIndex][weekdayIndex] = {
      dateKey,
      isFuture: dateKey > todayKey,
      isToday: dateKey === todayKey,
    };

    dayIndex += 1;
  }

  return {
    weeks,
    monthLabels,
  };
}
