import * as AppleAuthentication from 'expo-apple-authentication';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  UIManager,
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
  spacing,
  useAppTheme,
  type AppColorMode,
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
    title: 'Sign in once, stay in sync',
    body: 'Apple sign-in keeps your journal private.',
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
    title: 'Reminders (optional)',
    body: 'Pick a daily time or choose no reminders. You can change this later in Settings.',
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
  const { gradients, mode, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, mode, insets.bottom), [insets.bottom, mode, palette]);
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
  const [hasReminderSelection, setHasReminderSelection] = useState(false);
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
        setHasReminderSelection(true);
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
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, LayoutAnimation.Types.easeInEaseOut, LayoutAnimation.Properties.opacity),
    );
  }, [stepIndex]);

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
      return false;
    }

    if (!hasReminderSelection) {
      setReminderStatus('Choose Daily reminder or No reminders.');
      return false;
    }

    setIsSavingReminder(true);
    setReminderStatus(null);

    try {
      if (remindersDisabled) {
        await disableDailyMoodReminder();
        return true;
      }

      const result = await scheduleDailyMoodReminder(reminderTime);
      if (result === 'scheduled') {
        setReminderStatus(`Reminder set for ${formatReminderTime(reminderTime)}.`);
        return true;
      }

      if (result === 'denied') {
        setReminderStatus('Notifications are disabled. You can enable them later in Settings.');
        return true;
      }

      setReminderStatus('Notifications are not supported on web. Reminder time was still saved.');
      return true;
    } catch {
      setReminderStatus('Could not save reminder right now. You can set it later in Settings.');
      return true;
    } finally {
      setIsSavingReminder(false);
    }
  }, [hasReminderSelection, isSavingReminder, reminderTime, remindersDisabled]);

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
      const canAdvance = await handleReminderStepContinue();
      if (!canAdvance) {
        return;
      }
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

  const goToPreviousStep = useCallback(() => {
    if (stepIndex > 0) {
      setStepIndex((current) => current - 1);
    }
  }, [stepIndex]);
  const isIntroStep = activeStep.key === 'intro';
  const handleIntroAnimationComplete = useCallback(() => {
    setIsIntroAnimationComplete(true);
  }, []);

  const isBusy = isCompleting || isSigningIn || isSavingReminder;
  const isSkipDisabled = isCompleting || (requiresSignInForContinue && authState !== 'signed_in');
  const showSwipeHint = stepIndex === 0;
  const swipeHintLabel = useMemo(() => {
    if (isBusy) {
      return 'One moment...';
    }
    if (activeStep.key === 'login' && requiresSignInForContinue && authState !== 'signed_in') {
      return 'Sign in to keep going';
    }
    if (showSwipeHint) {
      return 'Swipe left to continue';
    }
    if (stepIndex === steps.length - 1) {
      return 'Swipe left to finish';
    }
    return 'Swipe to keep going';
  }, [activeStep.key, authState, isBusy, requiresSignInForContinue, showSwipeHint, stepIndex]);
  const triggerSwipeHaptic = useCallback(() => {
    if (Platform.OS !== 'ios') {
      return;
    }
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  }, []);

  const swipePanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !isBusy &&
          Math.abs(gestureState.dx) > 14 &&
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.35,
        onPanResponderRelease: (_, gestureState) => {
          if (isBusy) {
            return;
          }

          const isIntentionalSwipe = Math.abs(gestureState.dx) >= 30 || Math.abs(gestureState.vx) >= 0.45;
          if (!isIntentionalSwipe) {
            return;
          }

          if (gestureState.dx < 0) {
            const canAdvanceStep =
              stepIndex < steps.length - 1 &&
              !(activeStep.key === 'login' && requiresSignInForContinue && authState !== 'signed_in');
            if (canAdvanceStep) {
              triggerSwipeHaptic();
            }
            void goToNextStep();
            return;
          }

          if (stepIndex > 0) {
            triggerSwipeHaptic();
          }
          goToPreviousStep();
        },
      }),
    [activeStep.key, authState, goToNextStep, goToPreviousStep, isBusy, requiresSignInForContinue, stepIndex, triggerSwipeHaptic],
  );

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.content} {...swipePanResponder.panHandlers}>
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>Onboarding</Text>
            <Pressable
              style={styles.skipButton}
              disabled={isSkipDisabled}
              hitSlop={10}
              onPress={() => void completeOnboarding()}>
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
                  hasSelection={hasReminderSelection}
                  onSelectTime={(time) => {
                    setReminderTime(time);
                    setRemindersDisabled(false);
                    setHasReminderSelection(true);
                    setReminderStatus(null);
                  }}
                  onEnableReminders={() => {
                    setRemindersDisabled(false);
                    setHasReminderSelection(true);
                    setReminderStatus(null);
                  }}
                  onDisableReminders={() => {
                    setRemindersDisabled(true);
                    setHasReminderSelection(true);
                    setReminderStatus(null);
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
        </View>
        <View pointerEvents="none" style={styles.footerOverlay}>
          <View style={styles.footerPill}>
            <View style={styles.progressRow}>
              {steps.map((step, index) => (
                <View
                  key={step.key}
                  style={[
                    styles.progressDot,
                    index === stepIndex ? styles.progressDotActive : undefined,
                    index < stepIndex ? styles.progressDotCompleted : undefined,
                  ]}
                />
              ))}
            </View>
            <Text style={styles.swipeHintText}>{swipeHintLabel}</Text>
          </View>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette, mode: AppColorMode, bottomInset: number) => {
  const isDark = mode === 'dark';
  const footerPillBackground = isDark ? 'rgba(25, 28, 33, 0.78)' : 'rgba(255, 250, 242, 0.78)';
  const footerPillBorder = isDark ? 'rgba(224, 230, 238, 0.12)' : 'rgba(53, 41, 28, 0.12)';

  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      position: 'relative',
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
      flexGrow: 1,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl + bottomInset + 58,
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
    skipButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.xs,
      borderRadius: 999,
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
      gap: 5,
      marginTop: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderRadius: 0,
      backgroundColor: 'transparent',
    },
    footerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: bottomInset + spacing.sm,
      alignItems: 'center',
    },
    footerPill: {
      flexDirection: 'column',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: footerPillBorder,
      backgroundColor: footerPillBackground,
      shadowColor: isDark ? '#000000' : '#1f1a14',
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    progressDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: palette.mutedText,
      opacity: 0.26,
    },
    progressDotCompleted: {
      opacity: 0.56,
    },
    progressDotActive: {
      width: 16,
      height: 6,
      opacity: 1,
      backgroundColor: palette.ink,
    },
    swipeHintText: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 17,
      color: palette.mutedText,
      marginTop: 0,
    },
    disabledText: {
      opacity: 0.45,
    },
  });
};
