import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Clipboard from 'expo-clipboard';
import { LinearGradient } from 'expo-linear-gradient';
import * as ExpoLinking from 'expo-linking';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  moodScale,
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

const shortcutSteps = [
  'Add a URL action and paste your wallpaper URL.',
  'Add Get Contents of URL.',
  'Add Set Wallpaper Photo (Lock Screen).',
  'Create a daily Time of Day automation (12:00 AM).',
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

function PreviewGrid({
  active,
  palette,
  styles,
}: {
  active: boolean;
  palette: AppPalette;
  styles: ReturnType<typeof createStyles>;
}) {
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

function LoginStepCard({
  authState,
  authMessage,
  isSigningIn,
  appleAuthAvailable,
  onSignIn,
  palette,
  styles,
}: {
  authState: AuthState;
  authMessage: string | null;
  isSigningIn: boolean;
  appleAuthAvailable: boolean;
  onSignIn: () => void;
  palette: AppPalette;
  styles: ReturnType<typeof createStyles>;
}) {
  if (authState === 'signed_in') {
    return (
      <View style={styles.stageCard}>
        <Text style={styles.stageTitle}>You are signed in</Text>
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Ready to sync</Text>
          <Text style={styles.successBody}>Your account is connected. Continue to set your daily routine.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Connect with Apple</Text>
      <Text style={styles.stageBody}>You only need to do this once.</Text>

      {authState === 'checking' ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.ink} />
          <Text style={styles.loadingText}>Checking your session...</Text>
        </View>
      ) : appleAuthAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          cornerRadius={radii.pill}
          style={styles.appleButton}
          onPress={onSignIn}
        />
      ) : Platform.OS !== 'ios' ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteSubtle}>Apple sign-in is available on iOS devices.</Text>
        </View>
      ) : (
        <Pressable
          disabled={isSigningIn}
          onPress={onSignIn}
          style={[styles.signInButton, isSigningIn ? styles.disabledButton : undefined]}>
          <Text style={styles.signInButtonText}>{isSigningIn ? 'Signing in...' : 'Sign in with Apple'}</Text>
        </Pressable>
      )}

      {authMessage ? <Text style={styles.authError}>{authMessage}</Text> : null}
    </View>
  );
}

function MoodDemo({
  selectedMood,
  onSelectMood,
  palette,
  styles,
}: {
  selectedMood: MoodLevel;
  onSelectMood: (mood: MoodLevel) => void;
  palette: AppPalette;
  styles: ReturnType<typeof createStyles>;
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
        <Text style={styles.noteSubtle}>
          Optional note: &quot;Felt focused after a long walk.&quot;
        </Text>
      </View>
    </View>
  );
}

function ReminderStepCard({
  time,
  onSelectTime,
  onDisableReminders,
  remindersDisabled,
  statusMessage,
  styles,
}: {
  time: ReminderTime;
  onSelectTime: (time: ReminderTime) => void;
  onDisableReminders: () => void;
  remindersDisabled: boolean;
  statusMessage: string | null;
  styles: ReturnType<typeof createStyles>;
}) {
  const [showAndroidPicker, setShowAndroidPicker] = useState(false);
  const pickerValue = useMemo(() => {
    const value = new Date();
    value.setHours(time.hour, time.minute, 0, 0);
    return value;
  }, [time.hour, time.minute]);

  const handleTimeChange = useCallback(
    (event: DateTimePickerEvent, selectedDate?: Date) => {
      if (Platform.OS === 'android') {
        setShowAndroidPicker(false);
      }

      if (event.type === 'dismissed' || !selectedDate) {
        return;
      }

      onSelectTime({
        hour: selectedDate.getHours(),
        minute: selectedDate.getMinutes(),
      });
    },
    [onSelectTime],
  );

  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Daily reminder time</Text>

      {Platform.OS === 'ios' ? (
        <View style={styles.reminderPickerWrap}>
          <DateTimePicker
            value={pickerValue}
            mode="time"
            display="spinner"
            minuteInterval={5}
            onChange={handleTimeChange}
            style={styles.reminderPicker}
          />
        </View>
      ) : (
        <View style={styles.reminderPickerWrap}>
          <Pressable
            onPress={() => {
              setShowAndroidPicker(true);
            }}
            style={styles.reminderPickerButton}>
            <Text style={styles.reminderPickerButtonText}>Choose time</Text>
          </Pressable>
          {showAndroidPicker ? (
            <DateTimePicker
              value={pickerValue}
              mode="time"
              display="default"
              minuteInterval={5}
              onChange={handleTimeChange}
            />
          ) : null}
        </View>
      )}

      <Pressable onPress={onDisableReminders} style={styles.reminderOptOutButton}>
        <Text style={styles.reminderOptOutText}>
          {remindersDisabled ? 'No reminders (selected)' : "I don't want reminders"}
        </Text>
      </Pressable>

      {statusMessage ? <Text style={styles.reminderStatus}>{statusMessage}</Text> : null}
    </View>
  );
}

function ShortcutGuide({ wallpaperUrl, styles }: { wallpaperUrl: string; styles: ReturnType<typeof createStyles> }) {
  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Automation blueprint (optional)</Text>
      <Text style={styles.stageBody}>
        This runs once per day to refresh your lock screen from your private wallpaper URL.
      </Text>
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
              {activeStep.key === 'intro' ? <PreviewGrid active palette={palette} styles={styles} /> : null}
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
                  styles={styles}
                />
              ) : null}
              {activeStep.key === 'mood' ? (
                <MoodDemo
                  selectedMood={selectedMood}
                  onSelectMood={setSelectedMood}
                  palette={palette}
                  styles={styles}
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
                  styles={styles}
                />
              ) : null}
              {activeStep.key === 'shortcut' ? (
                <ShortcutGuide wallpaperUrl={resolvedWallpaperUrl} styles={styles} />
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
      borderColor: palette.softStroke,
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
    stageBody: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.mutedText,
    },
    successCard: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
      padding: spacing.sm,
      gap: 4,
    },
    successTitle: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: palette.ink,
    },
    successBody: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    loadingText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.ink,
    },
    appleButton: {
      width: '100%',
      height: 48,
    },
    signInButton: {
      borderRadius: radii.pill,
      backgroundColor: palette.ink,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    signInButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.paper,
      fontSize: 15,
    },
    authError: {
      fontFamily: fonts.body,
      color: '#b42318',
      fontSize: 13,
      lineHeight: 19,
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
      backgroundColor: palette.glass,
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
    reminderPickerWrap: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.paper,
    },
    reminderPicker: {
      height: 180,
      alignSelf: 'stretch',
    },
    reminderPickerButton: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      backgroundColor: palette.glass,
      margin: spacing.sm,
    },
    reminderPickerButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 13,
    },
    reminderOptOutButton: {
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      backgroundColor: palette.surface,
    },
    reminderOptOutText: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      fontSize: 13,
    },
    reminderStatus: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
    urlCard: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
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
