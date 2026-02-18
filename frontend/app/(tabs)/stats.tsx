import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getCurrentStreak, getMoodDistribution, getMonthlyAverages } from '@/lib/stats';
import { useAppStore } from '@/lib/store';
import { fonts, gradients, moodScale, palette, radii, spacing } from '@/lib/theme';

export default function StatsScreen() {
  const year = new Date().getFullYear();
  const entries = useAppStore((state) => state.entries);
  const theme = useAppStore((state) => state.theme);
  const isHydrating = useAppStore((state) => state.isHydrating);
  const hasHydrated = useAppStore((state) => state.hasHydrated);

  const streak = useMemo(() => getCurrentStreak(entries), [entries]);
  const distribution = useMemo(() => getMoodDistribution(entries), [entries]);
  const monthly = useMemo(() => getMonthlyAverages(entries, year), [entries, year]);
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

          <View style={styles.metricsRow}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Current streak</Text>
              <Text style={styles.metricValue}>{streak} days</Text>
            </View>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>Average mood</Text>
              <Text style={styles.metricValue}>{averageMood || '--'}</Text>
            </View>
          </View>

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
                <Text style={styles.monthValue}>
                  {month.average ? `${month.average.toFixed(1)} / 5` : 'No data'}
                </Text>
              </View>
            ))}
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
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
});
