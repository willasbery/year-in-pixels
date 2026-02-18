import { fromDateKey, toDateKey } from '@/lib/date';
import type { MoodEntries } from '@/lib/store';
import type { MoodLevel } from '@/lib/theme';

type MonthlyAverage = {
  month: string;
  average: number | null;
};

const EMPTY_DISTRIBUTION: Record<MoodLevel, number> = {
  1: 0,
  2: 0,
  3: 0,
  4: 0,
  5: 0,
};

export function getCurrentStreak(entries: MoodEntries, now = new Date()): number {
  let streak = 0;
  const cursor = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  while (true) {
    const key = toDateKey(cursor);
    if (!entries[key]) {
      break;
    }

    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export function getMoodDistribution(entries: MoodEntries): Record<MoodLevel, number> {
  const distribution = { ...EMPTY_DISTRIBUTION };

  Object.values(entries).forEach((entry) => {
    distribution[entry.level] += 1;
  });

  return distribution;
}

export function getMonthlyAverages(entries: MoodEntries, year: number): MonthlyAverage[] {
  const monthlyBuckets = Array.from({ length: 12 }, () => ({ sum: 0, count: 0 }));

  Object.entries(entries).forEach(([dateKey, entry]) => {
    const date = fromDateKey(dateKey);
    if (date.getFullYear() !== year) {
      return;
    }
    const bucket = monthlyBuckets[date.getMonth()];
    bucket.sum += entry.level;
    bucket.count += 1;
  });

  return monthlyBuckets.map((bucket, monthIndex) => ({
    month: new Date(year, monthIndex, 1).toLocaleDateString(undefined, { month: 'short' }),
    average: bucket.count ? bucket.sum / bucket.count : null,
  }));
}
