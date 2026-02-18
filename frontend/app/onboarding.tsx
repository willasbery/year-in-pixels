import * as Clipboard from 'expo-clipboard';
import * as ExpoLinking from 'expo-linking';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { API_BASE_URL } from '@/lib/api';
import { setOnboardingCompleted } from '@/lib/onboarding';
import { useAppStore } from '@/lib/store';
import { fonts, moodScale, palette, radii, spacing, type MoodLevel } from '@/lib/theme';

type OnboardingStep = {
  key: string;
  eyebrow: string;
  title: string;
  body: string;
};

const steps: OnboardingStep[] = [
  {
    key: 'year',
    eyebrow: 'Step 1',
    title: 'Your year, one pixel at a time',
    body: 'One color each day builds a quiet emotional map you can carry on your lock screen.',
  },
  {
    key: 'mood',
    eyebrow: 'Step 2',
    title: 'How are you today?',
    body: 'Pick a mood from one to five, and optionally add a short note.',
  },
  {
    key: 'shortcut',
    eyebrow: 'Step 3',
    title: 'Set up your lock screen',
    body: 'Copy your wallpaper URL, open Shortcuts, and run a daily midnight automation.',
  },
];

const shortcutSteps = [
  'URL -> paste your wallpaper URL',
  'Get Contents of URL',
  'Set Wallpaper Photo (Lock Screen)',
  'Automation: Time of Day, 12:00 AM, Daily',
];

function PreviewGrid({ active }: { active: boolean }) {
  const [fillTick, setFillTick] = useState(18);
  const totalCells = 98;

  useEffect(() => {
    if (!active) {
      return;
    }

    const interval = setInterval(() => {
      setFillTick((current) => (current >= totalCells ? 18 : current + 1));
    }, 110);

    return () => clearInterval(interval);
  }, [active]);

  return (
    <View style={styles.previewCard}>
      <View style={styles.previewGrid}>
        {Array.from({ length: totalCells }).map((_, index) => {
          const activeCell = index < fillTick;
          const moodColor = moodScale[index % moodScale.length].color;

          return (
            <View
              key={`preview-${index}`}
              style={[
                styles.previewCell,
                {
                  backgroundColor: activeCell ? moodColor : palette.futurePixel,
                  opacity: activeCell ? 1 : 0.45,
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.previewHint}>A tiny mood history, day by day.</Text>
    </View>
  );
}

function MoodDemo({
  selectedMood,
  onSelectMood,
}: {
  selectedMood: MoodLevel;
  onSelectMood: (mood: MoodLevel) => void;
}) {
  const selectedLabel = moodScale.find((mood) => mood.level === selectedMood)?.label ?? 'Good';

  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Tap a mood</Text>
      <View style={styles.moodRow}>
        {moodScale.map((mood) => (
          <Pressable
            key={mood.level}
            onPress={() => onSelectMood(mood.level)}
            style={styles.moodItem}>
            <View
              style={[
                styles.moodSwatch,
                {
                  backgroundColor: mood.color,
                  borderColor: selectedMood === mood.level ? palette.ink : 'rgba(0, 0, 0, 0)',
                },
              ]}
            />
            <Text style={styles.moodLabel}>{mood.label}</Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.noteCard}>
        <Text style={styles.noteText}>
          Logged: <Text style={styles.noteStrong}>{selectedLabel}</Text>
        </Text>
        <Text style={styles.noteSubtle}>Optional note: "Felt focused after a long walk."</Text>
      </View>
    </View>
  );
}

function ShortcutGuide({ wallpaperUrl }: { wallpaperUrl: string }) {
  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Automation blueprint</Text>
      <View style={styles.urlCard}>
        <Text style={styles.urlLabel}>Wallpaper URL</Text>
        <Text numberOfLines={2} style={styles.urlText}>
          {wallpaperUrl}
        </Text>
      </View>
      <View style={styles.shortcutList}>
        {shortcutSteps.map((step, index) => (
          <View key={step} style={styles.shortcutRow}>
            <View style={styles.shortcutIndex}>
              <Text style={styles.shortcutIndexText}>{index + 1}</Text>
            </View>
            <Text style={styles.shortcutStep}>{step}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

export default function OnboardingScreen() {
  const router = useRouter();
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const refreshThemeAndToken = useAppStore((state) => state.refreshThemeAndToken);
  const [stepIndex, setStepIndex] = useState(0);
  const [selectedMood, setSelectedMood] = useState<MoodLevel>(4);
  const [isCompleting, setIsCompleting] = useState(false);
  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const activeStep = steps[stepIndex];
  const resolvedWallpaperUrl = wallpaperUrl ?? `${API_BASE_URL}/w/<your-token>`;

  useEffect(() => {
    opacity.setValue(0);
    translateY.setValue(14);

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
  }, [opacity, stepIndex, translateY]);

  useEffect(() => {
    if (stepIndex !== 2 || wallpaperUrl) {
      return;
    }
    void refreshThemeAndToken();
  }, [refreshThemeAndToken, stepIndex, wallpaperUrl]);

  const completeOnboarding = async () => {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);
    await setOnboardingCompleted(true);
    router.replace('/(tabs)');
  };

  const goToNextStep = () => {
    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }
    void completeOnboarding();
  };

  const goToPreviousStep = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
    }
  };

  const setupShortcut = async () => {
    try {
      await setOnboardingCompleted(true);
      await Clipboard.setStringAsync(resolvedWallpaperUrl);

      const shortcutsUrl = 'shortcuts://';
      const canOpenShortcuts = await ExpoLinking.canOpenURL(shortcutsUrl);

      if (canOpenShortcuts) {
        await ExpoLinking.openURL(shortcutsUrl);
        Alert.alert('URL copied', 'Your wallpaper URL is copied. Continue setup in Shortcuts.');
        return;
      }

      Alert.alert('URL copied', 'Open the Shortcuts app and paste the copied URL into the URL action.');
    } catch {
      Alert.alert('Unable to open Shortcuts', 'The URL was copied. Open Shortcuts manually to finish setup.');
    }
  };

  return (
    <LinearGradient colors={['#fbf6ec', '#f3ead9', '#e7dbc8']} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>Onboarding</Text>
            <Pressable onPress={() => void completeOnboarding()}>
              <Text style={styles.skipText}>Skip</Text>
            </Pressable>
          </View>

          <View style={styles.header}>
            <Text style={styles.stepEyebrow}>{activeStep.eyebrow}</Text>
            <Text style={styles.title}>{activeStep.title}</Text>
            <Text style={styles.subtitle}>{activeStep.body}</Text>
          </View>

          <Animated.View
            style={[
              styles.stageContainer,
              {
                opacity,
                transform: [{ translateY }],
              },
            ]}>
            {stepIndex === 0 ? <PreviewGrid active /> : null}
            {stepIndex === 1 ? (
              <MoodDemo selectedMood={selectedMood} onSelectMood={setSelectedMood} />
            ) : null}
            {stepIndex === 2 ? <ShortcutGuide wallpaperUrl={resolvedWallpaperUrl} /> : null}
          </Animated.View>

          <View style={styles.progressRow}>
            {steps.map((step, index) => (
              <View
                key={step.key}
                style={[
                  styles.progressDot,
                  index === stepIndex ? styles.progressDotActive : undefined,
                ]}
              />
            ))}
          </View>

          <View style={styles.actionRow}>
            <Pressable
              disabled={stepIndex === 0 || isCompleting}
              onPress={goToPreviousStep}
              style={[
                styles.ghostButton,
                stepIndex === 0 || isCompleting ? styles.disabledButton : undefined,
              ]}>
              <Text style={styles.ghostButtonText}>Back</Text>
            </Pressable>

            {stepIndex < 2 ? (
              <Pressable disabled={isCompleting} onPress={goToNextStep} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>{isCompleting ? 'Saving...' : 'Next'}</Text>
              </Pressable>
            ) : (
              <Pressable disabled={isCompleting} onPress={setupShortcut} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>
                  {isCompleting ? 'Saving...' : 'Set Up Shortcut'}
                </Text>
              </Pressable>
            )}
          </View>

          <Pressable style={styles.secondaryAction} onPress={() => void completeOnboarding()}>
            <Text style={styles.secondaryActionText}>
              {stepIndex === 2 ? 'Open journal' : 'Skip to journal'}
            </Text>
          </Pressable>
        </View>
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
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.lg,
  },
  topBar: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  skipText: {
    fontFamily: fonts.bodyMedium,
    color: palette.mutedText,
    fontSize: 13,
  },
  stepEyebrow: {
    fontFamily: fonts.bodyMedium,
    color: palette.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1.4,
    fontSize: 11,
  },
  title: {
    fontFamily: fonts.display,
    fontSize: 38,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    lineHeight: 21,
    fontSize: 14,
    maxWidth: 340,
  },
  stageContainer: {
    flex: 1,
  },
  previewCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  previewGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  previewCell: {
    width: 14,
    height: 14,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: 'rgba(31, 26, 20, 0.08)',
  },
  previewHint: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 13,
  },
  stageCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.md,
  },
  stageTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: palette.ink,
  },
  moodRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  moodItem: {
    flex: 1,
    alignItems: 'center',
    gap: 5,
  },
  moodSwatch: {
    width: 40,
    height: 40,
    borderRadius: 999,
    borderWidth: 2,
  },
  moodLabel: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 11,
  },
  noteCard: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: 'rgba(255, 250, 240, 0.88)',
    padding: spacing.sm,
    gap: 4,
  },
  noteText: {
    fontFamily: fonts.body,
    color: palette.ink,
    fontSize: 14,
  },
  noteStrong: {
    fontFamily: fonts.bodyMedium,
  },
  noteSubtle: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.mutedText,
  },
  urlCard: {
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: 'rgba(255, 250, 240, 0.88)',
    padding: spacing.sm,
    gap: 4,
  },
  urlLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1,
    color: palette.mutedText,
  },
  urlText: {
    fontFamily: fonts.body,
    color: palette.ink,
    fontSize: 12,
  },
  shortcutList: {
    gap: spacing.sm,
  },
  shortcutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  shortcutIndex: {
    width: 22,
    height: 22,
    borderRadius: 999,
    backgroundColor: palette.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shortcutIndexText: {
    fontFamily: fonts.bodyMedium,
    color: palette.paper,
    fontSize: 12,
  },
  shortcutStep: {
    flex: 1,
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 14,
    lineHeight: 20,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  progressDot: {
    width: 8,
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(31, 26, 20, 0.18)',
  },
  progressDotActive: {
    width: 24,
    backgroundColor: palette.ink,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  primaryButton: {
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: palette.paper,
    fontFamily: fonts.bodyMedium,
    fontSize: 15,
  },
  ghostButton: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.md,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 250, 240, 0.6)',
  },
  ghostButtonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 15,
  },
  disabledButton: {
    opacity: 0.45,
  },
  secondaryAction: {
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  secondaryActionText: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    fontSize: 13,
  },
});
