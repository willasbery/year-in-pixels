import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useMemo, useState } from 'react';
import { PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import MoodPicker from '@/components/MoodPicker';
import PixelGrid from '@/components/PixelGrid';
import { formatDateLabel, getDaysInYear, getTodayKey, toDateKey } from '@/lib/date';
import { useAppStore } from '@/lib/store';
import { fonts, moodScale, radii, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

const MAX_BACKFILL_DAYS = 7;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function toUtcDayStamp(dateKey: string): number {
  const [year, month, day] = dateKey.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

function getMoodLabel(level?: number) {
  return moodScale.find((mood) => mood.level === level)?.label ?? 'Not logged';
}

export default function GridScreen() {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, insets.bottom), [insets.bottom, palette]);
  const isCompact = width < 370;
  const year = new Date().getFullYear();
  const todayKey = getTodayKey();
  const [daysBack, setDaysBack] = useState(0);
  const entries = useAppStore((state) => state.entries);
  const theme = useAppStore((state) => state.theme);
  const isHydrating = useAppStore((state) => state.isHydrating);
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isSavingMood = useAppStore((state) => state.isSavingMood);
  const authRequired = useAppStore((state) => state.authRequired);
  const lastError = useAppStore((state) => state.lastError);
  const clearError = useAppStore((state) => state.clearError);
  const selectedDateKey = useAppStore((state) => state.selectedDateKey);
  const openMoodPicker = useAppStore((state) => state.openMoodPicker);
  const closeMoodPicker = useAppStore((state) => state.closeMoodPicker);
  const setMood = useAppStore((state) => state.setMood);
  const clearMood = useAppStore((state) => state.clearMood);
  const goBackOneDay = useCallback(() => {
    setDaysBack((value) => Math.min(MAX_BACKFILL_DAYS, value + 1));
  }, []);
  const goForwardOneDay = useCallback(() => {
    setDaysBack((value) => Math.max(0, value - 1));
  }, []);
  const dateNavigatorPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gestureState) => {
          const absDx = Math.abs(gestureState.dx);
          const absDy = Math.abs(gestureState.dy);
          return absDx > 6 && absDx > absDy * 1.1;
        },
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > 6 && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25,
        onPanResponderTerminationRequest: () => false,
        onPanResponderRelease: (_, gestureState) => {
          const isIntentionalSwipe = Math.abs(gestureState.dx) >= 18 || Math.abs(gestureState.vx) >= 0.35;
          if (!isIntentionalSwipe) {
            return;
          }

          if (gestureState.dx <= 0) {
            goForwardOneDay();
          } else {
            goBackOneDay();
          }
        },
        onPanResponderTerminate: () => {},
      }),
    [goBackOneDay, goForwardOneDay],
  );

  const selectedEntry = selectedDateKey ? entries[selectedDateKey] : undefined;
  const todayEntry = entries[todayKey];
  const oldestAllowedDateKey = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - MAX_BACKFILL_DAYS);
    return toDateKey(date);
  }, [todayKey]);
  const actionDateKey = useMemo(() => {
    const date = new Date();
    date.setDate(date.getDate() - daysBack);
    return toDateKey(date);
  }, [daysBack]);
  const actionEntry = entries[actionDateKey];
  const canGoBack = daysBack < MAX_BACKFILL_DAYS;
  const canGoForward = daysBack > 0;
  const actionLabel = daysBack === 0 ? 'Log Today' : 'Log Day';
  const loggedCount = useMemo(
    () => Object.keys(entries).filter((dateKey) => dateKey.startsWith(`${year}-`)).length,
    [entries, year],
  );
  const completion = ((loggedCount / getDaysInYear(year)) * 100).toFixed(1);
  const handleCalendarDateSelect = useCallback(
    (dateKey: string) => {
      if (dateKey < oldestAllowedDateKey || dateKey > todayKey) {
        return;
      }

      const daysDifference = Math.round((toUtcDayStamp(todayKey) - toUtcDayStamp(dateKey)) / MS_PER_DAY);
      if (daysDifference < 0 || daysDifference > MAX_BACKFILL_DAYS) {
        return;
      }

      setDaysBack(daysDifference);
      openMoodPicker(dateKey);
    },
    [oldestAllowedDateKey, openMoodPicker, todayKey],
  );

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Year in Pixels</Text>
            <Text style={styles.title}>How was today?</Text>
            <Text style={styles.subtitle}>
              One tap, one color, and your year slowly turns into a personal mood map.
            </Text>
          </View>

          {!hasHydrated || isHydrating ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Syncing journal...</Text>
              <Text style={styles.infoText}>Pulling your latest mood entries from the server.</Text>
            </View>
          ) : null}

          {authRequired ? (
            <View style={styles.infoCard}>
              <Text style={styles.infoTitle}>Sign in required</Text>
              <Text style={styles.infoText}>Sign in with Apple to sync your data.</Text>
            </View>
          ) : null}

          {lastError ? (
            <Pressable style={styles.errorCard} onPress={clearError}>
              <Text style={styles.errorTitle}>Sync issue</Text>
              <Text style={styles.errorText}>{lastError}</Text>
            </Pressable>
          ) : null}

          <View style={[styles.highlightCard, isCompact ? styles.highlightCardCompact : undefined]}>
            <View style={styles.highlightItem}>
              <Text style={styles.highlightLabel}>Today</Text>
              <Text style={styles.highlightValue}>
                {!hasHydrated || isHydrating ? 'Syncing...' : getMoodLabel(todayEntry?.level)}
              </Text>
            </View>
            <View style={[styles.divider, isCompact ? styles.dividerCompact : undefined]} />
            <View style={styles.highlightItem}>
              <Text style={styles.highlightLabel}>Year Logged</Text>
              <Text style={styles.highlightValue}>{completion}%</Text>
            </View>
          </View>

          <View style={styles.gridCard}>
            <PixelGrid
              year={year}
              entries={entries}
              moodColors={theme.moodColors}
              shape={theme.shape}
              gridSpacing={theme.spacing}
              minSelectableDateKey={oldestAllowedDateKey}
              highlightedDateKey={actionDateKey}
              onSelectDate={handleCalendarDateSelect}
            />
          </View>

        </ScrollView>

        <View style={styles.actionDock}>
          <View style={styles.actionCard} {...dateNavigatorPanResponder.panHandlers}>
            <View style={styles.dateNavigator}>
              <Pressable
                disabled={!canGoBack}
                hitSlop={8}
                onPress={goBackOneDay}
                style={[styles.navButton, !canGoBack ? styles.navButtonDisabled : undefined]}>
                <Text style={[styles.navButtonText, !canGoBack ? styles.navButtonTextDisabled : undefined]}>
                  {'<'}
                </Text>
              </Pressable>
              <View style={styles.dateMeta}>
                <Text style={styles.dateLabel}>{formatDateLabel(actionDateKey)}</Text>
              </View>
              <Pressable
                disabled={!canGoForward}
                hitSlop={8}
                onPress={goForwardOneDay}
                style={[styles.navButton, !canGoForward ? styles.navButtonDisabled : undefined]}>
                <Text style={[styles.navButtonText, !canGoForward ? styles.navButtonTextDisabled : undefined]}>
                  {'>'}
                </Text>
              </Pressable>
            </View>

            <Text style={styles.dateHelper}>Swipe or tap arrows to navigate the last 7 days.</Text>

            <View style={styles.actionButtons}>
              {actionEntry ? (
                <View style={[styles.ctaRow, isCompact ? styles.ctaRowCompact : undefined]}>
                  <Pressable
                    disabled={isSavingMood}
                    style={[styles.secondaryCta, isSavingMood ? styles.ctaDisabled : undefined]}
                    onPress={() => {
                      void clearMood(actionDateKey);
                    }}>
                    <Text style={styles.secondaryCtaText}>Clear Day</Text>
                  </Pressable>
                  <Pressable
                    disabled={isSavingMood}
                    style={[
                      styles.cta,
                      styles.ctaHalf,
                      isCompact ? styles.ctaHalfCompact : undefined,
                      isSavingMood ? styles.ctaDisabled : undefined,
                    ]}
                    onPress={() => openMoodPicker(actionDateKey)}>
                    <Text style={styles.ctaText}>Change Mood</Text>
                  </Pressable>
                </View>
              ) : (
                <Pressable
                  disabled={isSavingMood}
                  style={[styles.cta, isSavingMood ? styles.ctaDisabled : undefined]}
                  onPress={() => openMoodPicker(actionDateKey)}>
                  <Text style={styles.ctaText}>{actionLabel}</Text>
                </Pressable>
              )}
            </View>
          </View>
        </View>
      </SafeAreaView>

      <MoodPicker
        visible={Boolean(selectedDateKey)}
        dateKey={selectedDateKey}
        entry={selectedEntry}
        moodColors={theme.moodColors}
        onClose={closeMoodPicker}
        onSave={(level, note) => {
          if (!selectedDateKey) {
            return;
          }
          void setMood(selectedDateKey, level, note);
          closeMoodPicker();
        }}
        onClear={() => {
          if (!selectedDateKey) {
            return;
          }
          void clearMood(selectedDateKey);
          closeMoodPicker();
        }}
      />
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
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.lg,
  },
  header: {
    gap: spacing.sm,
    marginTop: spacing.sm,
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
    fontSize: 42,
    lineHeight: 46,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 15,
    lineHeight: 21,
    color: palette.mutedText,
    maxWidth: 330,
  },
  highlightCard: {
    backgroundColor: palette.glass,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
  },
  highlightCardCompact: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  infoCard: {
    backgroundColor: palette.glass,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: 2,
  },
  infoTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: palette.ink,
  },
  infoText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedText,
  },
  errorCard: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.24)',
    padding: spacing.md,
    gap: 2,
  },
  errorTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 14,
    color: '#b42318',
  },
  errorText: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: '#b42318',
  },
  highlightItem: {
    flex: 1,
    gap: 2,
  },
  highlightLabel: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: palette.mutedText,
  },
  highlightValue: {
    fontFamily: fonts.bodyBold,
    fontSize: 20,
    color: palette.ink,
  },
  divider: {
    width: 1,
    alignSelf: 'stretch',
    marginHorizontal: spacing.md,
    backgroundColor: palette.softStroke,
  },
  dividerCompact: {
    width: '100%',
    height: 1,
    marginHorizontal: 0,
    marginVertical: spacing.xs,
  },
  gridCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.md,
  },
  actionDock: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: 68 + bottomInset,
  },
  actionCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  dateNavigator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  dateMeta: {
    flex: 1,
    alignItems: 'center',
  },
  dateLabel: {
    textAlign: 'center',
    fontFamily: fonts.bodyBold,
    fontSize: 17,
    color: palette.ink,
  },
  dateHelper: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: palette.mutedText,
    textAlign: 'center',
  },
  actionButtons: {
    marginTop: spacing.md,
  },
  navButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navButtonDisabled: {
    opacity: 0.4,
  },
  navButtonText: {
    fontFamily: fonts.bodyBold,
    fontSize: 16,
    color: palette.ink,
  },
  navButtonTextDisabled: {
    color: palette.mutedText,
  },
  cta: {
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ctaRowCompact: {
    flexDirection: 'column',
  },
  ctaHalf: {
    flex: 1,
  },
  ctaHalfCompact: {
    flex: 0,
  },
  secondaryCta: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.surface,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: palette.paper,
  },
  secondaryCtaText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: palette.ink,
  },
  ctaDisabled: {
    opacity: 0.55,
  },
});
