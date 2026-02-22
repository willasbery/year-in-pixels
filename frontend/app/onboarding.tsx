import * as AppleAuthentication from "expo-apple-authentication";
import * as Clipboard from "expo-clipboard";
import * as Haptics from "expo-haptics";
import { LinearGradient } from "expo-linear-gradient";
import * as ExpoLinking from "expo-linking";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Animated,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";

import { ONBOARDING_STEPS } from "@/components/onboarding/constants";
import LoginStepCard from "@/components/onboarding/login-step-card";
import MoodDemo from "@/components/onboarding/mood-demo";
import OnboardingFooter from "@/components/onboarding/onboarding-footer";
import OnboardingHeader from "@/components/onboarding/onboarding-header";
import PreviewGrid from "@/components/onboarding/preview-grid";
import ReminderStepCard from "@/components/onboarding/reminder-step-card";
import type { AuthState } from "@/components/onboarding/types";
import { useOnboardingAnimation } from "@/hooks/use-onboarding-animation";
import { API_BASE_URL } from "@/lib/api";
import {
  getAccessToken,
  normalizeAuthMessage,
  signInWithApple,
} from "@/lib/auth";
import {
  DEFAULT_REMINDER_TIME,
  disableDailyMoodReminder,
  getSavedReminderTime,
  scheduleDailyMoodReminder,
  type ReminderTime,
} from "@/lib/notifications";
import { setOnboardingCompleted } from "@/lib/onboarding";
import { useAppStore } from "@/lib/store";
import {
  fonts,
  spacing,
  useAppTheme,
  type AppColorMode,
  type AppPalette,
  type MoodLevel,
} from "@/lib/theme";

export default function OnboardingScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ step?: string }>();
  const insets = useSafeAreaInsets();
  const { gradients, mode, palette } = useAppTheme();
  const styles = useMemo(
    () => createStyles(palette, mode, insets.bottom),
    [insets.bottom, mode, palette],
  );
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const refreshThemeAndToken = useAppStore(
    (state) => state.refreshThemeAndToken,
  );
  const hydrate = useAppStore((state) => state.hydrate);

  const loginStepIndex = useMemo(
    () => ONBOARDING_STEPS.findIndex((step) => step.key === "login"),
    [],
  );
  const initialStepIndex = params.step === "login" ? loginStepIndex : 0;
  const [stepIndex, setStepIndex] = useState(initialStepIndex);
  const [selectedMood, setSelectedMood] = useState<MoodLevel>(4);
  const [isCompleting, setIsCompleting] = useState(false);
  const [isIntroAnimationComplete, setIsIntroAnimationComplete] =
    useState(false);

  const [authState, setAuthState] = useState<AuthState>("checking");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  const [reminderTime, setReminderTime] = useState<ReminderTime>(
    DEFAULT_REMINDER_TIME,
  );
  const [remindersDisabled, setRemindersDisabled] = useState(false);
  const [hasReminderSelection, setHasReminderSelection] = useState(false);
  const [isSavingReminder, setIsSavingReminder] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<string | null>(null);

  const { opacity, translateY } = useOnboardingAnimation(stepIndex);

  const activeStep = ONBOARDING_STEPS[stepIndex];
  const resolvedWallpaperUrl = wallpaperUrl ?? `${API_BASE_URL}/w/<your-token>`;
  const requiresSignInForContinue = Platform.OS === "ios";

  useEffect(() => {
    if (params.step === "login") {
      setStepIndex(loginStepIndex);
    }
  }, [loginStepIndex, params.step]);

  useEffect(() => {
    let active = true;

    const bootstrapAuthAndReminder = async () => {
      const [token, savedReminderTime] = await Promise.all([
        getAccessToken(),
        getSavedReminderTime(),
      ]);
      if (!active) {
        return;
      }

      setAuthState(token ? "signed_in" : "signed_out");
      if (savedReminderTime) {
        setReminderTime(savedReminderTime);
        setHasReminderSelection(true);
      }
    };

    void bootstrapAuthAndReminder().catch((error: unknown) => {
      if (!active) {
        return;
      }
      setAuthState("signed_out");
      setAuthMessage(normalizeAuthMessage(error));
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== "signed_out") {
      return;
    }

    let active = true;
    const checkAppleAvailability = async () => {
      if (Platform.OS !== "ios") {
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
    if (activeStep.key !== "shortcut" || wallpaperUrl) {
      return;
    }
    void refreshThemeAndToken();
  }, [activeStep.key, refreshThemeAndToken, wallpaperUrl]);

  const lastStepIndex = ONBOARDING_STEPS.length - 1;
  const isLastStep = stepIndex === lastStepIndex;
  const showFinishButton = isLastStep && activeStep.key !== "shortcut";

  const finalizeOnboarding = useCallback(async () => {
    if (isCompleting) {
      return;
    }
    setIsCompleting(true);
    try {
      await setOnboardingCompleted(true);
      router.replace("/(tabs)");
    } finally {
      setIsCompleting(false);
    }
  }, [isCompleting, router]);

  const completeOnboarding = useCallback(async () => {
    if (requiresSignInForContinue && authState !== "signed_in") {
      setStepIndex(loginStepIndex);
      setAuthMessage("Please sign in before continuing.");
      return;
    }

    await finalizeOnboarding();
  }, [
    authState,
    finalizeOnboarding,
    loginStepIndex,
    requiresSignInForContinue,
  ]);

  const handleFinishPress = useCallback(() => {
    if (!showFinishButton) {
      return;
    }
    void completeOnboarding();
  }, [completeOnboarding, showFinishButton]);

  const handleSignIn = useCallback(async () => {
    if (isSigningIn) {
      return;
    }

    setIsSigningIn(true);
    setAuthMessage(null);

    try {
      await signInWithApple();
      useAppStore.setState({ authRequired: false, lastError: null });
      await Promise.all([
        refreshThemeAndToken(),
        hydrate(new Date().getFullYear()),
      ]);
      if (useAppStore.getState().authRequired) {
        throw new Error(
          useAppStore.getState().lastError ?? "Session expired. Sign in again.",
        );
      }
      setAuthState("signed_in");
      setStepIndex((current) => {
        if (
          current !== loginStepIndex ||
          current >= ONBOARDING_STEPS.length - 1
        ) {
          return current;
        }
        return current + 1;
      });
    } catch (error) {
      setAuthState("signed_out");
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
      setReminderStatus("Choose Daily reminder or No reminders.");
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
      if (result === "scheduled") {
        return true;
      }

      if (result === "denied") {
        setReminderStatus(
          "Notifications are disabled. You can enable them later in Settings.",
        );
        return false;
      }

      setReminderStatus(
        "Notifications are not supported on web. Reminder time was still saved.",
      );
      return false;
    } catch {
      setReminderStatus(
        "Could not save reminder right now. You can set it later in Settings.",
      );
      return false;
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

      const shortcutsUrl = "shortcuts://";
      const canOpenShortcuts = await ExpoLinking.canOpenURL(shortcutsUrl);

      if (canOpenShortcuts) {
        await ExpoLinking.openURL(shortcutsUrl);
        Alert.alert(
          "URL copied",
          "Your wallpaper URL is copied. Continue setup in Shortcuts.",
        );
      } else {
        Alert.alert(
          "URL copied",
          "Open the Shortcuts app and paste the copied URL into the URL action.",
        );
      }
    } catch {
      Alert.alert(
        "Unable to open Shortcuts",
        "The URL was copied. Open Shortcuts manually to finish setup.",
      );
    } finally {
      setIsCompleting(false);
      router.replace("/(tabs)");
    }
  }, [isCompleting, resolvedWallpaperUrl, router]);

  const goToNextStep = useCallback(async () => {
    if (
      activeStep.key === "login" &&
      requiresSignInForContinue &&
      authState !== "signed_in"
    ) {
      setAuthMessage("Please sign in to continue.");
      return;
    }

    if (activeStep.key === "reminder") {
      const canAdvance = await handleReminderStepContinue();
      if (!canAdvance) {
        return;
      }
    }

    if (activeStep.key === "shortcut") {
      await setupShortcut();
      return;
    }

    if (stepIndex < ONBOARDING_STEPS.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }
  }, [
    activeStep.key,
    authState,
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
  const isIntroStep = activeStep.key === "intro";
  const handleIntroAnimationComplete = useCallback(() => {
    setIsIntroAnimationComplete(true);
  }, []);

  const isBusy = isCompleting || isSigningIn || isSavingReminder;
  const isSkipDisabled =
    isBusy || (requiresSignInForContinue && authState !== "signed_in");
  const topActionLabel = showFinishButton
    ? isBusy
      ? "Finishing..."
      : "Finish"
    : "Skip";
  const handleTopActionPress = useCallback(() => {
    if (showFinishButton) {
      handleFinishPress();
      return;
    }
    void completeOnboarding();
  }, [completeOnboarding, handleFinishPress, showFinishButton]);
  const showSwipeHint = stepIndex === 0;
  const swipeHintLabel = useMemo(() => {
    if (isBusy) {
      return "One moment...";
    }
    if (
      activeStep.key === "login" &&
      requiresSignInForContinue &&
      authState !== "signed_in"
    ) {
      return "Sign in to keep going";
    }
    if (showSwipeHint) {
      return "Swipe left to continue";
    }
    if (showFinishButton) {
      return "Tap Finish to wrap up";
    }
    return "Swipe to keep going";
  }, [
    activeStep.key,
    authState,
    isBusy,
    requiresSignInForContinue,
    showFinishButton,
    showSwipeHint,
  ]);
  const triggerSwipeHaptic = useCallback(() => {
    if (Platform.OS !== "ios") {
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

          const isIntentionalSwipe =
            Math.abs(gestureState.dx) >= 30 ||
            Math.abs(gestureState.vx) >= 0.45;
          if (!isIntentionalSwipe) {
            return;
          }

          if (gestureState.dx < 0) {
            const canAdvanceStep =
              stepIndex < ONBOARDING_STEPS.length - 1 &&
              !(
                activeStep.key === "login" &&
                requiresSignInForContinue &&
                authState !== "signed_in"
              );
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
    [
      activeStep.key,
      authState,
      goToNextStep,
      goToPreviousStep,
      isBusy,
      requiresSignInForContinue,
      stepIndex,
      triggerSwipeHaptic,
    ],
  );

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={["top"]} style={styles.safeArea}>
        <View style={styles.content} {...swipePanResponder.panHandlers}>
          <View style={styles.topBar}>
            <Text style={styles.eyebrow}>Onboarding</Text>
            <Pressable
              style={({ pressed }) => [
                styles.skipButton,
                showFinishButton ? styles.finishTopActionButton : undefined,
                pressed ? styles.topActionPressed : undefined,
                isSkipDisabled ? styles.topActionDisabled : undefined,
              ]}
              disabled={isSkipDisabled}
              hitSlop={10}
              onPress={handleTopActionPress}
            >
              <Text
                style={[
                  styles.skipText,
                  showFinishButton ? styles.finishTopActionText : undefined,
                  isSkipDisabled ? styles.disabledText : undefined,
                ]}
              >
                {topActionLabel}
              </Text>
            </Pressable>
          </View>

          <ScrollView
            style={styles.bodyScroll}
            contentContainerStyle={styles.bodyScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <OnboardingHeader step={activeStep} palette={palette} />

            <Animated.View
              style={[
                styles.stageContainer,
                {
                  opacity,
                  transform: [{ translateY }],
                },
              ]}
            >
              <View style={isIntroStep ? undefined : styles.stageHidden}>
                <PreviewGrid
                  active={isIntroStep}
                  animationCompleted={isIntroAnimationComplete}
                  onAnimationComplete={handleIntroAnimationComplete}
                  palette={palette}
                />
              </View>
              {activeStep.key === "login" ? (
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
              {activeStep.key === "mood" ? (
                <MoodDemo
                  selectedMood={selectedMood}
                  onSelectMood={setSelectedMood}
                  palette={palette}
                />
              ) : null}
              {activeStep.key === "reminder" ? (
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
              {/* {activeStep.key === 'shortcut' ? (
                <ShortcutGuide wallpaperUrl={resolvedWallpaperUrl} palette={palette} />
              ) : null} */}
            </Animated.View>
          </ScrollView>
        </View>
        <OnboardingFooter
          stepIndex={stepIndex}
          swipeHintLabel={swipeHintLabel}
          bottomInset={insets.bottom}
          palette={palette}
          mode={mode}
        />
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (
  palette: AppPalette,
  mode: AppColorMode,
  bottomInset: number,
) => {
  return StyleSheet.create({
    screen: {
      flex: 1,
    },
    safeArea: {
      flex: 1,
      position: "relative",
    },
    content: {
      flex: 1,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    topBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
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
    eyebrow: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: 1.5,
      color: palette.mutedText,
    },
    skipText: {
      fontFamily: fonts.bodyMedium,
      color: palette.mutedText,
      fontSize: 13,
    },
    finishTopActionText: {
      color: palette.paper,
      fontFamily: fonts.bodyBold,
      letterSpacing: 0.2,
    },
    skipButton: {
      minHeight: 44,
      minWidth: 44,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: spacing.xs,
      borderRadius: 999,
    },
    finishTopActionButton: {
      minWidth: 78,
      paddingHorizontal: spacing.md,
      backgroundColor: palette.ink,
      borderWidth: 1,
      borderColor:
        mode === "dark" ? "rgba(239, 243, 249, 0.14)" : "rgba(20, 14, 10, 0.12)",
      shadowColor: mode === "dark" ? "#000000" : "#2f2214",
      shadowOpacity: mode === "dark" ? 0.34 : 0.16,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    topActionPressed: {
      transform: [{ scale: 0.97 }],
    },
    topActionDisabled: {
      opacity: 0.62,
    },
    stageContainer: {
      minHeight: 0,
    },
    stageHidden: {
      display: "none",
    },
    disabledText: {
      opacity: 0.45,
    },
  });
};
