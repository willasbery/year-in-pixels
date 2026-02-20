import React, { useMemo } from 'react';

import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Path, Svg } from 'react-native-svg';

import { WEEKDAY_LABELS, createYearGrid, formatDateLabel } from '@/lib/date';
import type { MoodEntries } from '@/lib/store';
import { fonts, radii, spacing, useAppTheme, type AppPalette, type ThemeSettings } from '@/lib/theme';

type PixelGridProps = {
  year: number;
  entries: MoodEntries;
  moodColors: ThemeSettings['moodColors'];
  shape: ThemeSettings['shape'];
  gridSpacing: ThemeSettings['spacing'];
  minSelectableDateKey?: string;
  highlightedDateKey?: string;
  onSelectDate: (dateKey: string) => void;
};

function hashDateKey(dateKey: string): number {
  let h = 5381;
  for (let i = 0; i < dateKey.length; i++) {
    h = Math.imul(h, 33) ^ dateKey.charCodeAt(i);
  }
  return h >>> 0;
}

function buildRoughPath(seed: number, S: number): string {
  const rand = (n: number, range: number): number => {
    let s = (Math.imul(seed, (n * 2654435761) | 0) ^ (seed >>> 16)) | 0;
    s ^= s >>> 16;
    s = Math.imul(s, 0x45d9f3b);
    s ^= s >>> 16;
    return ((s >>> 0) / 0x100000000 - 0.5) * 2 * range;
  };

  const cx = S / 2;
  const cy = S / 2;
  const baseR = S / 2 - 1.2;
  const N = 10;

  // Sample N points around the circle, each with independent radius + angle noise.
  // More points = more places for the outline to deviate from a perfect circle.
  const pts: [number, number][] = Array.from({ length: N }, (_, i) => {
    const angle = (i / N) * Math.PI * 2 + rand(i * 3 + 1, 0.06);
    const r = baseR + rand(i * 3 + 2, 0.9);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });

  // Connect via Catmull-Rom → cubic bezier conversion for a smooth closed loop.
  // This gives organic, flowing curves through every noisy point rather than
  // the stiff geometry of manually placed bezier handles.
  const p = (i: number) => pts[((i % N) + N) % N];
  const f = (n: number) => n.toFixed(2);

  let d = `M ${f(pts[0][0])},${f(pts[0][1])}`;
  for (let i = 0; i < N; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + ' Z';
}

function getPixelGap(gridSpacing: ThemeSettings['spacing']) {
  if (gridSpacing === 'tight') {
    return 4;
  }
  if (gridSpacing === 'wide') {
    return 8;
  }
  return spacing.xs;
}

export default function PixelGrid({
  year,
  entries,
  moodColors,
  shape,
  gridSpacing,
  minSelectableDateKey,
  highlightedDateKey,
  onSelectDate,
}: PixelGridProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { weeks, monthLabels } = useMemo(() => createYearGrid(year), [year]);
  const pixelGap = getPixelGap(gridSpacing);
  const cellRadius = shape === 'square' ? 0 : radii.sm;

  return (
    <View style={styles.container}>
      <View style={[styles.weekdayRail, { gap: pixelGap }]}>
        {WEEKDAY_LABELS.map((dayLabel, index) => (
          <Text key={`${dayLabel}-${index}`} style={styles.weekdayLabel}>
            {dayLabel}
          </Text>
        ))}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.monthRow, { marginBottom: pixelGap }]}>
            {weeks.map((_, weekIndex) => (
              <View key={`month-${weekIndex}`} style={[styles.monthSlot, { marginRight: pixelGap }]}>
                <Text style={styles.monthText}>{monthLabels[weekIndex] ?? ''}</Text>
              </View>
            ))}
          </View>

          <View style={[styles.weekRow, { gap: pixelGap }]}>
            {weeks.map((week, weekIndex) => (
              <View key={`week-${weekIndex}`} style={[styles.weekColumn, { gap: pixelGap }]}>
                {week.map((cell, dayIndex) => {
                  if (!cell) {
                    return <View key={`empty-${weekIndex}-${dayIndex}`} style={styles.emptyCell} />;
                  }

                  const entry = entries[cell.dateKey];
                  const backgroundColor = entry
                    ? moodColors[entry.level]
                    : cell.isFuture
                      ? palette.futurePixel
                      : palette.emptyPixel;
                  const isBeforeMinSelectableDate = Boolean(
                    minSelectableDateKey && cell.dateKey < minSelectableDateKey,
                  );
                  const isSelectable = !cell.isFuture && !isBeforeMinSelectableDate;
                  const isHighlighted = cell.dateKey === highlightedDateKey;
                  const strokeColor = isHighlighted || cell.isToday ? palette.ink : palette.softStroke;

                  if (shape === 'rough') {
                    return (
                      <Pressable
                        key={cell.dateKey}
                        accessibilityLabel={`Log mood for ${formatDateLabel(cell.dateKey)}`}
                        disabled={!isSelectable}
                        onPress={() => onSelectDate(cell.dateKey)}
                        style={({ pressed }) => ({
                          width: CELL_SIZE,
                          height: CELL_SIZE,
                          opacity: isSelectable ? 1 : 0.4,
                          transform: [{ scale: pressed ? 0.9 : 1 }],
                        })}
                      >
                        <Svg
                          width={CELL_SIZE}
                          height={CELL_SIZE}
                          viewBox={`0 0 ${CELL_SIZE} ${CELL_SIZE}`}
                        >
                          <Path
                            d={buildRoughPath(hashDateKey(cell.dateKey), CELL_SIZE)}
                            fill={backgroundColor}
                            stroke={strokeColor}
                            strokeWidth={isHighlighted ? 1.5 : 0.8}
                          />
                        </Svg>
                      </Pressable>
                    );
                  }

                  return (
                    <Pressable
                      key={cell.dateKey}
                      accessibilityLabel={`Log mood for ${formatDateLabel(cell.dateKey)}`}
                      disabled={!isSelectable}
                      onPress={() => onSelectDate(cell.dateKey)}
                      style={({ pressed }) => [
                        styles.cell,
                        {
                          backgroundColor,
                          borderRadius: cellRadius,
                          borderColor: strokeColor,
                          borderWidth: isHighlighted ? 1 : 0.8,
                          opacity: isSelectable ? 1 : 0.4,
                          transform: [{ scale: pressed ? 0.9 : 1 }],
                        },
                        isHighlighted ? styles.highlightedCell : undefined,
                      ]}
                    />
                  );
                })}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const CELL_SIZE = 14;
const MONTH_LABEL_WIDTH = 28;

const createStyles = (palette: AppPalette) => StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  weekdayRail: {
    marginTop: 22,
    width: 16,
  },
  weekdayLabel: {
    height: CELL_SIZE,
    fontFamily: fonts.body,
    fontSize: 10,
    color: palette.mutedText,
  },
  monthRow: {
    flexDirection: 'row',
    overflow: 'visible',
  },
  monthSlot: {
    width: CELL_SIZE,
    height: 16,
    overflow: 'visible',
  },
  monthText: {
    width: MONTH_LABEL_WIDTH,
    fontFamily: fonts.body,
    fontSize: 10,
    color: palette.mutedText,
  },
  weekRow: {
    flexDirection: 'row',
  },
  weekColumn: {},
  cell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
    borderWidth: 1,
  },
  highlightedCell: {
    shadowColor: palette.ink,
    shadowOpacity: 0.22,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 0 },
    elevation: 2,
  },
  emptyCell: {
    width: CELL_SIZE,
    height: CELL_SIZE,
  },
});
