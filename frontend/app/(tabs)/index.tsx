import { LinearGradient } from 'expo-linear-gradient';
import { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import MoodPicker from '@/components/MoodPicker';
import PixelGrid from '@/components/PixelGrid';
import { getDaysInYear, getTodayKey } from '@/lib/date';
import { useAppStore } from '@/lib/store';
import { fonts, gradients, moodScale, palette, radii, spacing } from '@/lib/theme';

function getMoodLabel(level?: number) {
  return moodScale.find((mood) => mood.level === level)?.label ?? 'Not logged';
}

export default function GridScreen() {
  const year = new Date().getFullYear();
  const todayKey = getTodayKey();
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

  const selectedEntry = selectedDateKey ? entries[selectedDateKey] : undefined;
  const todayEntry = entries[todayKey];
  const loggedCount = useMemo(
    () => Object.keys(entries).filter((dateKey) => dateKey.startsWith(`${year}-`)).length,
    [entries, year],
  );
  const completion = Math.round((loggedCount / getDaysInYear(year)) * 100);

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

          <View style={styles.highlightCard}>
            <View style={styles.highlightItem}>
              <Text style={styles.highlightLabel}>Today</Text>
              <Text style={styles.highlightValue}>
                {!hasHydrated || isHydrating ? 'Syncing...' : getMoodLabel(todayEntry?.level)}
              </Text>
            </View>
            <View style={styles.divider} />
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
              onSelectDate={openMoodPicker}
            />
          </View>

          <Pressable
            disabled={isSavingMood}
            style={[styles.cta, isSavingMood ? styles.ctaDisabled : undefined]}
            onPress={() => openMoodPicker(todayKey)}>
            <Text style={styles.ctaText}>{isSavingMood ? 'Saving...' : 'Log Today'}</Text>
          </Pressable>
        </ScrollView>
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

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 120,
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
  gridCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.md,
  },
  cta: {
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaText: {
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
    color: palette.paper,
  },
  ctaDisabled: {
    opacity: 0.55,
  },
});
