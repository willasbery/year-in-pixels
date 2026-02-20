import * as AppleAuthentication from 'expo-apple-authentication';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import LoginStepCard from '@/components/onboarding/LoginStepCard';
import MoodDemo from '@/components/onboarding/MoodDemo';
import PreviewGrid from '@/components/onboarding/PreviewGrid';
import ReminderStepCard from '@/components/onboarding/ReminderStepCard';
import ShortcutGuide from '@/components/onboarding/ShortcutGuide';
import { API_BASE_URL } from '@/lib/api';
import { getAccessToken, signInWithApple } from '@/lib/auth';
import {
  DEFAULT_REMINDER_TIME,
  disableDailyMoodReminder,
  formatReminderTime,
  getSavedReminderTime,
  scheduleDailyMoodReminder,
  type ReminderTime,
} from '@/lib/notifications';
import { setOnboardingCompleted } from '@/lib/onboarding';
import { useAppStore } from '@/lib/store';
import {
  fonts,
  radii,
  spacing,
  useAppTheme,
  type AppPalette,
  type MoodLevel,
} from '@/lib/theme';

type AuthState = 'checking' | 'signed_out' | 'signed_in';

type OnboardingStep = {
  key: 'intro' | 'login' | 'mood' | 'reminder' | 'shortcut';
  eyebrow: string;
  title: string;
  body: string;
};

const steps: OnboardingStep[] = [
  {
    key: 'intro',
    eyebrow: 'Step 1',
    title: 'Your year, one pixel at a time',
    body: 'Every day becomes one color. Over time, your mood map tells the story of your year.',
  },
  {
    key: 'login',
    eyebrow: 'Step 2',
    title: 'Sign in to keep it private',
    body: 'Use Apple sign-in so your journal syncs securely across sessions.',
  },
  {
    key: 'mood',
    eyebrow: 'Step 3',
    title: 'Log moods in seconds',
    body: 'Tap 1 to 5 and optionally add a short note. Fast enough to do daily.',
  },
  {
    key: 'reminder',
    eyebrow: 'Step 4',
    title: 'When should we remind you?',
    body: 'Choose a daily notification time so adding your mood becomes a habit.',
  },
  {
    key: 'shortcut',
    eyebrow: 'Step 5',
    title: 'Optional: lock screen automation',
    body: 'Use iOS Shortcuts to auto-refresh your lock screen wallpaper every day. You can set this up now or later.',
  },
];

function normalizeAuthMessage(error: unknown): string {
  if (error instanceof Error && /canceled|cancelled/i.test(error.message)) {
    return 'Sign in was canceled.';
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Unable to sign in right now. Please try again.';
}

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, insets.bottom), [insets.bottom, palette]);
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const refreshThemeAndToken = useAppStore((state) => state.refreshThemeAndToken);
  const hydrate = useAppStore((state) => state.hydrate);
  const isCompact = width < 380;

  const loginStepIndex = useMemo(() => steps.findIndex((step) => step.key === 'login'), []);
  const initialStepIndex = params.step === 'login' ? loginStepIndex : 0;
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [selectedMood, setSelectedMood] = useState<MoodLevel>(4);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isIntroAnimationComplete, setIsIntroAnimationComplete] = useState(false);

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  const [reminderTime, setReminderTime] = useState<ReminderTime>(DEFAULT_REMINDER_TIME);
  const [remindersDisabled, setRemindersDisabled] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  const opacity = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const activeStep = steps[stepIndex];
  const resolvedWallpaperUrl = wallpaperUrl ?? `${API_BASE_URL}/w/<your-token>`;
  const requiresSignInForContinue = Platform.OS === 'ios';

  useEffect(() => {
    if (params.step === 'login') {
      setStepIndex(loginStepIndex);
    }
  }, [loginStepIndex, params.step]);

  useEffect(() => {
    let active = true;

    const bootstrapAuthAndReminder = async () => {
      const [token, savedReminderTime] = await Promise.all([getAccessToken(), getSavedReminderTime()]);
      if (!active) {
        return;
      }

      setAuthState(token ? 'signed_in' : 'signed_out');
      if (savedReminderTime) {
        setReminderTime(savedReminderTime);
      }
    };

    void bootstrapAuthAndReminder().catch((error: unknown) => {
      if (!active) {
        return;
      }
      setAuthState('signed_out');
      setAuthMessage(normalizeAuthMessage(error));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed_out') {
      return;
    }

    let active = true;
    const checkAppleAvailability = async () => {
      if (Platform.OS !== 'ios') {
        if (active) {
          setAppleAuthAvailable(false);
        }
        return;
      }

      const available = await AppleAuthentication.isAvailableAsync();
      if (active) {
        setAppleAuthAvailable(available);
      }
    };

    void checkAppleAvailability().catch(() => {
      if (active) {
        setAppleAuthAvailable(false);
      }
    });

    return () => {
      active = false;
    };
  }, [authState]);

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
    if (activeStep.key !== 'shortcut' || wallpaperUrl) {
      return;
    }
    void refreshThemeAndToken();
  }, [activeStep.key, refreshThemeAndToken, wallpaperUrl]);

  const completeOnboarding = useCallback(async () => {
    if (isCompleting) {
      return;
    }

    if (requiresSignInForContinue && authState !== 'signed_in') {
      setStepIndex(loginStepIndex);
      setAuthMessage('Please sign in before continuing.');
      return;
    }

    setIsCompleting(true);
    try {
      await setOnboardingCompleted(true);
      router.replace('/(tabs)');
    } finally {
      setIsCompleting(false);
    }
  }, [authState, isCompleting, loginStepIndex, requiresSignInForContinue, router]);

  const handleSignIn = useCallback(async () => {
    if (isSigningIn) {
      return;
    }

    setIsSigningIn(true);
    setAuthMessage(null);

    try {
      await signInWithApple();
      useAppStore.setState({ authRequired: false, lastError: null });
      await Promise.all([refreshThemeAndToken(), hydrate(new Date().getFullYear())]);
      if (useAppStore.getState().authRequired) {
        throw new Error(useAppStore.getState().lastError ?? 'Session expired. Sign in again.');
      }
      setAuthState('signed_in');
      setStepIndex((current) => {
        if (current !== loginStepIndex || current >= steps.length - 1) {
          return current;
        }
        return current + 1;
      });
    } catch (error) {
      setAuthState('signed_out');
      setAuthMessage(normalizeAuthMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  }, [hydrate, isSigningIn, loginStepIndex, refreshThemeAndToken]);

  const handleReminderStepContinue = useCallback(async () => {
    if (isSavingReminder) {
      return;
    }

    setIsSavingReminder(true);
    setReminderStatus(null);

    try {
      if (remindersDisabled) {
        await disableDailyMoodReminder();
        setReminderStatus('Daily reminders are turned off. You can enable them later in Settings.');
        return;
      }

      const result = await scheduleDailyMoodReminder(reminderTime);
      if (result === 'scheduled') {
        setReminderStatus(`Reminder set for ${formatReminderTime(reminderTime)}.`);
        return;
      }

      if (result === 'denied') {
        setReminderStatus('Notifications are disabled. You can enable them later in Settings.');
        return;
      }

      setReminderStatus('Notifications are not supported on web. Reminder time was still saved.');
    } catch {
      setReminderStatus('Could not save reminder right now. You can set it later in Settings.');
    } finally {
      setIsSavingReminder(false);
    }
  }, [isSavingReminder, reminderTime, remindersDisabled]);

  const setupShortcut = useCallback(async () => {
    if (isCompleting) {
      return;
    }

    setIsCompleting(true);

    try {
      await setOnboardingCompleted(true);
      await Clipboard.setStringAsync(resolvedWallpaperUrl);

      const shortcutsUrl = 'shortcuts://';
      const canOpenShortcuts = await ExpoLinking.canOpenURL(shortcutsUrl);

      if (canOpenShortcuts) {
        await ExpoLinking.openURL(shortcutsUrl);
        Alert.alert('URL copied', 'Your wallpaper URL is copied. Continue setup in Shortcuts.');
      } else {
        Alert.alert('URL copied', 'Open the Shortcuts app and paste the copied URL into the URL action.');
      }
    } catch {
      Alert.alert('Unable to open Shortcuts', 'The URL was copied. Open Shortcuts manually to finish setup.');
    } finally {
      setIsCompleting(false);
      router.replace('/(tabs)');
    }
  }, [isCompleting, resolvedWallpaperUrl, router]);

  const goToNextStep = useCallback(async () => {
    if (activeStep.key === 'login' && requiresSignInForContinue && authState !== 'signed_in') {
      setAuthMessage('Please sign in to continue.');
      return;
    }

    if (activeStep.key === 'reminder') {
      await handleReminderStepContinue();
    }

    if (activeStep.key === 'shortcut') {
      await setupShortcut();
      return;
    }

    if (stepIndex < steps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    await completeOnboarding();
  }, [
    activeStep.key,
    authState,
    completeOnboarding,
    handleReminderStepContinue,
    requiresSignInForContinue,
    setupShortcut,
    stepIndex,
  ]);

  const goToPreviousStep = () => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
    }
  };
  const isIntroStep = activeStep.key === 'intro';
  const handleIntroAnimationComplete = useCallback(() => {
    setIsIntroAnimationComplete(true);
  }, []);

  const isBusy = isCompleting || isSigningIn || isSavingReminder;
  const isBackDisabled = stepIndex === 0 || isBusy;
  const isSkipDisabled = isCompleting || (requiresSignInForContinue && authState !== 'signed_in');

  const isPrimaryDisabled =
    isBusy ||
    (activeStep.key === 'login' && requiresSignInForContinue && authState !== 'signed_in') ||
    (activeStep.key === 'login' && authState === 'checking');

  const primaryButtonLabel =
    activeStep.key === 'shortcut'
      ? isCompleting
        ? 'Saving...'
        : 'Set Up Shortcut'
      : activeStep.key === 'reminder'
        ? isSavingReminder
          ? 'Saving reminder...'
          : remindersDisabled
            ? 'Continue'
            : 'Save & Continue'
        : activeStep.key === 'login'
          ? authState === 'signed_in'
            ? 'Continue'
            : authState === 'checking'
              ? 'Checking...'
              : 'Sign in to continue'
          : 'Next';

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>Onboarding</Text>
            <Pressable disabled={isSkipDisabled} onPress={() => void completeOnboarding()}>
              <Text style={[styles.skipText, isSkipDisabled ? styles.disabledText : undefined]}>Skip</Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={false}>
            <View style={styles.header}>
              <Text style={styles.stepEyebrow}>{activeStep.eyebrow}</Text>
              <Text style={[styles.title, isCompact ? styles.titleCompact : undefined]}>{activeStep.title}</Text>
              <Text style={[styles.subtitle, isCompact ? styles.subtitleCompact : undefined]}>{activeStep.body}</Text>
            </View>

            <Animated.View
              style={[
                styles.stageContainer,
                {
                  opacity,
                  transform: [{ translateY }],
                },
              ]}>
              <View style={isIntroStep ? undefined : styles.stageHidden}>
                <PreviewGrid
                  active={isIntroStep}
                  animationCompleted={isIntroAnimationComplete}
                  onAnimationComplete={handleIntroAnimationComplete}
                  palette={palette}
                />
              </View>
              {activeStep.key === 'login' ? (
                <LoginStepCard
                  authState={authState}
                  authMessage={authMessage}
                  isSigningIn={isSigningIn}
                  appleAuthAvailable={appleAuthAvailable}
                  onSignIn={() => {
                    void handleSignIn();
                  }}
                  palette={palette}
                />
              ) : null}
              {activeStep.key === 'mood' ? (
                <MoodDemo
                  selectedMood={selectedMood}
                  onSelectMood={setSelectedMood}
                  palette={palette}
                />
              ) : null}
              {activeStep.key === 'reminder' ? (
                <ReminderStepCard
                  time={reminderTime}
                  onSelectTime={(time) => {
                    setReminderTime(time);
                    setRemindersDisabled(false);
                    setReminderStatus(null);
                  }}
                  onDisableReminders={() => {
                    setRemindersDisabled(true);
                    setReminderStatus('No reminders will be sent.');
                  }}
                  remindersDisabled={remindersDisabled}
                  statusMessage={reminderStatus}
                  palette={palette}
                />
              ) : null}
              {activeStep.key === 'shortcut' ? (
                <ShortcutGuide wallpaperUrl={resolvedWallpaperUrl} palette={palette} />
              ) : null}
            </Animated.View>

          </ScrollView>

          <View style={styles.actionWrap}>
            <View style={styles.actionRow}>
              <Pressable
                disabled={isBackDisabled}
                onPress={goToPreviousStep}
                style={[styles.ghostButton, isBackDisabled ? styles.disabledButton : undefined]}>
                <Text style={styles.ghostButtonText}>Back</Text>
              </Pressable>

              <Pressable
                disabled={isPrimaryDisabled}
                onPress={() => {
                  void goToNextStep();
                }}
                style={[styles.primaryButton, isPrimaryDisabled ? styles.disabledButton : undefined]}>
                <Text style={styles.primaryButtonText}>{primaryButtonLabel}</Text>
              </Pressable>
            </View>
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
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette, bottomInset: number) =>
  StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    bodyScroll: {
      flex: 1,
    },
    bodyScrollContent: {
      paddingTop: spacing.sm,
      paddingBottom: spacing.sm,
      gap: spacing.lg,
    },
    header: {
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
      lineHeight: 44,
      color: palette.ink,
    },
    titleCompact: {
      fontSize: 32,
      lineHeight: 38,
    },
    subtitle: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      lineHeight: 21,
      fontSize: 14,
      maxWidth: 340,
    },
    subtitleCompact: {
      fontSize: 13,
      lineHeight: 19,
    },
    stageContainer: {
      minHeight: 0,
    },
    stageHidden: {
      display: 'none',
    },
    progressRow: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.sm,
    },
    actionWrap: {
      paddingTop: spacing.xs,
      paddingBottom: Math.max(bottomInset, spacing.xs),
    },
    progressDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: palette.softStroke,
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
      backgroundColor: palette.surface,
    },
    ghostButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 15,
    },
    disabledButton: {
      opacity: 0.45,
    },
    disabledText: {
      opacity: 0.45,
    },
  });
