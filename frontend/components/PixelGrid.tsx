import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

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
                          borderColor: isHighlighted || cell.isToday ? palette.ink : palette.softStroke,
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
