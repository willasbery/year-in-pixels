import { LinearGradient } from 'expo-linear-gradient';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { fromDateKey } from '@/lib/date';
import { getCurrentStreak, getMoodDistribution, getMonthlyAverages } from '@/lib/stats';
import { useAppStore } from '@/lib/store';
import { fonts, moodScale, radii, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

const TREND_CHART_HEIGHT = 176;
const TREND_CHART_PADDING_X = 12;
const TREND_CHART_PADDING_TOP = 10;
const TREND_CHART_PADDING_BOTTOM = 16;

function formatTrendDate(dateKey: string): string {
  const date = fromDateKey(dateKey);
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getMonthAverageLabel(month: {
  average: number | null;
  status: 'has-data' | 'no-data' | 'future';
  isCurrentMonth: boolean;
}): string {
  if (month.status === 'future') {
    return 'Future';
  }
  if (month.status === 'no-data') {
    return month.isCurrentMonth ? 'No data yet' : 'No data';
  }
  return `${month.average?.toFixed(1)} / 5`;
}

export default function StatsScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, insets.bottom), [insets.bottom, palette]);
  const isCompact = width < 370;
  const year = new Date().getFullYear();
  const [trendChartWidth, setTrendChartWidth] = useState(0);
  const entries = useAppStore((state) => state.entries);
  const theme = useAppStore((state) => state.theme);
  const isHydrating = useAppStore((state) => state.isHydrating);
  const hasHydrated = useAppStore((state) => state.hasHydrated);

  const streak = useMemo(() => getCurrentStreak(entries), [entries]);
  const distribution = useMemo(() => getMoodDistribution(entries), [entries]);
  const monthly = useMemo(() => getMonthlyAverages(entries, year), [entries, year]);
  const trendPoints = useMemo(
    () =>
      Object.entries(entries)
        .filter(([dateKey]) => dateKey.startsWith(`${year}-`))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([dateKey, entry]) => ({
          dateKey,
          level: entry.level,
        })),
    [entries, year],
  );
  const totalLogged = useMemo(
    () => Object.values(distribution).reduce((sum, count) => sum + count, 0),
    [distribution],
  );
  const averageMood = useMemo(() => {
    if (!totalLogged) {
      return 0;
    }

    const sum = moodScale.reduce(
      (acc, mood) => acc + mood.level * (distribution[mood.level] ?? 0),
      0,
    );
    return Number((sum / totalLogged).toFixed(1));
  }, [distribution, totalLogged]);
  const trendGridLines = useMemo(() => {
    const innerHeight = TREND_CHART_HEIGHT - TREND_CHART_PADDING_TOP - TREND_CHART_PADDING_BOTTOM;
    return [1, 2, 3, 4, 5].map((level) => {
      const normalized = (5 - level) / 4;
      const y = TREND_CHART_PADDING_TOP + normalized * innerHeight;
      return { level, y };
    });
  }, []);
  const trendLayout = useMemo(() => {
    const innerWidth = Math.max(0, trendChartWidth - TREND_CHART_PADDING_X * 2);
    const innerHeight = TREND_CHART_HEIGHT - TREND_CHART_PADDING_TOP - TREND_CHART_PADDING_BOTTOM;
    if (!trendPoints.length || !innerWidth) {
      return {
        dots: [] as Array<{ key: string; left: number; top: number; color: string }>,
        segments: [] as Array<{
          key: string;
          horizontal: { left: number; top: number; width: number; color: string };
          vertical: { left: number; top: number; height: number; color: string };
        }>,
      };
    }

    const xStep = trendPoints.length > 1 ? innerWidth / (trendPoints.length - 1) : 0;
    const dots = trendPoints.map((point, index) => {
      const left = TREND_CHART_PADDING_X + xStep * index;
      const normalized = (5 - point.level) / 4;
      const top = TREND_CHART_PADDING_TOP + normalized * innerHeight;
      return {
        key: point.dateKey,
        left,
        top,
        color: theme.moodColors[point.level],
      };
    });

    const segments = dots.slice(1).map((current, index) => {
      const previous = dots[index];
      const color = current.color;
      return {
        key: `${previous.key}-${current.key}`,
        horizontal: {
          left: previous.left,
          top: previous.top - 1,
          width: Math.max(1, current.left - previous.left),
          color,
        },
        vertical: {
          left: current.left - 1,
          top: Math.min(previous.top, current.top),
          height: Math.max(2, Math.abs(current.top - previous.top)),
          color,
        },
      };
    });

    return { dots, segments };
  }, [theme.moodColors, trendChartWidth, trendPoints]);
  const firstTrendDate = trendPoints[0]?.dateKey ?? null;
  const lastTrendDate = trendPoints[trendPoints.length - 1]?.dateKey ?? null;
  const hasStatsData = totalLogged > 0;

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Stats</Text>
            <Text style={styles.title}>Your rhythm</Text>
          </View>

          {!hasHydrated || isHydrating ? (
            <View style={styles.noteCard}>
              <Text style={styles.noteText}>Syncing mood history...</Text>
            </View>
          ) : null}

          <View style={[styles.metricsRow, isCompact ? styles.metricsRowCompact : undefined]}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Current streak</Text>
              <Text style={styles.metricValue}>{streak} days</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Average mood</Text>
              <Text style={styles.metricValue}>{averageMood || '--'}</Text>
            </View>
          </View>

          {!hasHydrated || isHydrating ? null : !hasStatsData ? (
            <View style={styles.emptyStateCard}>
              <Text style={styles.emptyStateTitle}>No stats yet</Text>
              <Text style={styles.emptyStateBody}>
                Log your first few days in Journal and this screen will populate with your distribution, monthly
                averages, and trend line.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Mood distribution</Text>
                {moodScale.map((mood) => {
                  const count = distribution[mood.level] ?? 0;
                  const fillWidth = totalLogged
                    ? Math.max((count / totalLogged) * 100, count ? 7 : 0)
                    : 0;

                  return (
                    <View key={mood.level} style={styles.row}>
                      <Text style={styles.rowLabel}>{mood.label}</Text>
                      <View style={styles.track}>
                        <View
                          style={[
                            styles.fill,
                            {
                              width: `${fillWidth}%` as `${number}%`,
                              backgroundColor: theme.moodColors[mood.level],
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.rowCount}>{count}</Text>
                    </View>
                  );
                })}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Monthly average</Text>
                {monthly.map((month) => (
                  <View key={month.month} style={styles.row}>
                    <Text style={styles.rowLabel}>{month.month}</Text>
                    <Text
                      style={[
                        styles.monthValue,
                        month.status !== 'has-data' ? styles.monthValueMuted : undefined,
                      ]}>
                      {getMonthAverageLabel(month)}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={styles.panel}>
                <Text style={styles.panelTitle}>Daily mood through time</Text>
                {trendPoints.length < 2 ? (
                  <Text style={styles.panelEmptyText}>Log at least two days to see your trend line.</Text>
                ) : (
                  <>
                    <View
                      style={styles.trendChart}
                      onLayout={(event) => {
                        setTrendChartWidth(event.nativeEvent.layout.width);
                      }}>
                      {trendGridLines.map((line) => (
                        <View
                          key={`grid-${line.level}`}
                          style={[
                            styles.trendGridLine,
                            {
                              top: line.y,
                            },
                          ]}
                        />
                      ))}

                      {trendGridLines.map((line) => (
                        <Text
                          key={`label-${line.level}`}
                          style={[
                            styles.trendGridLabel,
                            {
                              top: line.y - 8,
                            },
                          ]}>
                          {line.level}
                        </Text>
                      ))}

                      {trendLayout.segments.map((segment) => (
                        <View key={segment.key}>
                          <View
                            style={[
                              styles.trendSegment,
                              {
                                left: segment.horizontal.left,
                                top: segment.horizontal.top,
                                width: segment.horizontal.width,
                                backgroundColor: segment.horizontal.color,
                              },
                            ]}
                          />
                          <View
                            style={[
                              styles.trendSegment,
                              {
                                left: segment.vertical.left,
                                top: segment.vertical.top,
                                height: segment.vertical.height,
                                width: 2,
                                backgroundColor: segment.vertical.color,
                              },
                            ]}
                          />
                        </View>
                      ))}

                      {trendLayout.dots.map((dot) => (
                        <View
                          key={`dot-${dot.key}`}
                          style={[
                            styles.trendDot,
                            {
                              left: dot.left - 3,
                              top: dot.top - 3,
                              backgroundColor: dot.color,
                            },
                          ]}
                        />
                      ))}
                    </View>

                    <View style={styles.trendAxisFooter}>
                      <Text style={styles.trendAxisLabel}>{firstTrendDate ? formatTrendDate(firstTrendDate) : ''}</Text>
                      <Text style={styles.trendAxisLabel}>{lastTrendDate ? formatTrendDate(lastTrendDate) : ''}</Text>
                    </View>
                  </>
                )}
              </View>
            </>
          )}
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette, bottomInset: number) => StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 86 + bottomInset,
    gap: spacing.lg,
  },
  header: {
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: palette.mutedText,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: palette.ink,
  },
  metricsRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  metricsRowCompact: {
    flexDirection: 'column',
  },
  noteCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.glass,
    padding: spacing.md,
  },
  noteText: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 13,
  },
  metricCard: {
    flex: 1,
    backgroundColor: palette.glass,
    borderWidth: 1,
    borderColor: palette.softStroke,
    borderRadius: radii.card,
    padding: spacing.md,
    gap: 2,
  },
  metricLabel: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 12,
  },
  metricValue: {
    fontFamily: fonts.bodyBold,
    color: palette.ink,
    fontSize: 22,
  },
  emptyStateCard: {
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.surface,
    padding: spacing.md,
    gap: spacing.sm,
  },
  emptyStateTitle: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 16,
  },
  emptyStateBody: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  panel: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  panelTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: palette.ink,
    marginBottom: 2,
  },
  panelEmptyText: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: palette.mutedText,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowLabel: {
    width: 56,
    fontFamily: fonts.body,
    fontSize: 13,
    color: palette.mutedText,
  },
  track: {
    flex: 1,
    height: 9,
    borderRadius: 999,
    backgroundColor: palette.emptyPixel,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
  },
  rowCount: {
    width: 24,
    textAlign: 'right',
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 12,
  },
  monthValue: {
    flex: 1,
    textAlign: 'right',
    fontFamily: fonts.bodyMedium,
    fontSize: 13,
    color: palette.ink,
  },
  monthValueMuted: {
    color: palette.mutedText,
    fontFamily: fonts.body,
  },
  trendChart: {
    position: 'relative',
    height: TREND_CHART_HEIGHT,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.glass,
    overflow: 'hidden',
  },
  trendGridLine: {
    position: 'absolute',
    left: TREND_CHART_PADDING_X,
    right: TREND_CHART_PADDING_X,
    height: 1,
    backgroundColor: palette.softStroke,
  },
  trendGridLabel: {
    position: 'absolute',
    right: 4,
    fontFamily: fonts.body,
    fontSize: 10,
    color: palette.mutedText,
  },
  trendSegment: {
    position: 'absolute',
    height: 2,
    borderRadius: 999,
  },
  trendDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.paper,
  },
  trendAxisFooter: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  trendAxisLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: palette.mutedText,
  },
});
