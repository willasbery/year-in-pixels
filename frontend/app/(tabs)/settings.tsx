import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useColorSchemePreference } from '@/components/useColorScheme';
import ThemeEditor from '@/components/ThemeEditor';
import { getDefaultThemeSettings } from '@/lib/api';
import { setOnboardingCompleted } from '@/lib/onboarding';
import { useAppStore } from '@/lib/store';
import { fonts, radii, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

export default function SettingsScreen() {
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const { preference, setPreference } = useColorSchemePreference();
  const router = useRouter();
  const [isResettingOnboarding, setIsResettingOnboarding] = useState(false);
  const theme = useAppStore((state) => state.theme);
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const isRotatingToken = useAppStore((state) => state.isRotatingToken);
  const updateThemeSettings = useAppStore((state) => state.updateThemeSettings);
  const rotateWallpaperToken = useAppStore((state) => state.rotateWallpaperToken);
  const refreshThemeAndToken = useAppStore((state) => state.refreshThemeAndToken);
  const lastError = useAppStore((state) => state.lastError);
  const clearError = useAppStore((state) => state.clearError);

  const handleSetShape = useCallback(
    (shape: typeof theme.shape) => {
      void updateThemeSettings({ shape });
    },
    [updateThemeSettings],
  );

  const handleSetSpacing = useCallback(
    (spacingValue: typeof theme.spacing) => {
      void updateThemeSettings({ spacing: spacingValue });
    },
    [updateThemeSettings],
  );

  const handleApplyMoodPreset = useCallback(
    (moodColors: typeof theme.moodColors) => {
      void updateThemeSettings({ moodColors });
    },
    [updateThemeSettings],
  );

  const handleResetTheme = useCallback(() => {
    void updateThemeSettings(getDefaultThemeSettings());
  }, [updateThemeSettings]);

  const resetOnboarding = async () => {
    if (isResettingOnboarding) {
      return;
    }

    setIsResettingOnboarding(true);
    await setOnboardingCompleted(false);
    setIsResettingOnboarding(false);
    router.push('/onboarding');
  };

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            <Text style={styles.eyebrow}>Settings</Text>
            <Text style={styles.title}>Make it yours</Text>
          </View>

          {lastError ? (
            <Pressable style={styles.errorCard} onPress={clearError}>
              <Text style={styles.errorTitle}>Sync issue</Text>
              <Text style={styles.errorText}>{lastError}</Text>
            </Pressable>
          ) : null}

          <ThemeEditor
            theme={theme}
            onSetShape={handleSetShape}
            onSetSpacing={handleSetSpacing}
            onApplyMoodPreset={handleApplyMoodPreset}
            onResetTheme={handleResetTheme}
          />

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Appearance</Text>
            <Text style={styles.cardBody}>
              Choose the app color mode.
            </Text>
            <View style={styles.appearanceRow}>
              <Pressable
                onPress={() => {
                  void setPreference('light');
                }}
                style={[
                  styles.appearanceOption,
                  preference === 'light' ? styles.appearanceOptionActive : undefined,
                ]}>
                <Text
                  style={[
                    styles.appearanceOptionText,
                    preference === 'light' ? styles.appearanceOptionTextActive : undefined,
                  ]}>
                  Light
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void setPreference('dark');
                }}
                style={[
                  styles.appearanceOption,
                  preference === 'dark' ? styles.appearanceOptionActive : undefined,
                ]}>
                <Text
                  style={[
                    styles.appearanceOptionText,
                    preference === 'dark' ? styles.appearanceOptionTextActive : undefined,
                  ]}>
                  Dark
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  void setPreference('system');
                }}
                style={[
                  styles.appearanceOption,
                  preference === 'system' ? styles.appearanceOptionActive : undefined,
                ]}>
                <Text
                  style={[
                    styles.appearanceOptionText,
                    preference === 'system' ? styles.appearanceOptionTextActive : undefined,
                  ]}>
                  System
                </Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Wallpaper URL</Text>
            <Text style={styles.cardBody}>
              This URL is fetched from `/token` and used in iOS Shortcuts.
            </Text>
            <View style={styles.urlPreview}>
              <Text style={styles.urlText}>
                {wallpaperUrl ?? 'URL unavailable. Check auth token and tap refresh.'}
              </Text>
            </View>
            <View style={styles.actions}>
              <Pressable
                onPress={() => {
                  void refreshThemeAndToken();
                }}
                style={[styles.secondaryButton, styles.actionButton]}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
              <Pressable
                disabled={isRotatingToken}
                onPress={() => {
                  void rotateWallpaperToken();
                }}
                style={[
                  styles.primaryButton,
                  styles.actionButton,
                  isRotatingToken ? styles.buttonDisabled : undefined,
                ]}>
                <Text style={styles.primaryButtonText}>
                  {isRotatingToken ? 'Rotating...' : 'Rotate URL'}
                </Text>
              </Pressable>
            </View>
            <Pressable
              disabled={!wallpaperUrl}
              onPress={() => {
                router.push('/wallpaper-preview');
              }}
              style={[
                styles.secondaryButton,
                !wallpaperUrl ? styles.buttonDisabled : undefined,
              ]}>
              <Text style={styles.secondaryButtonText}>Preview today's background</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Current theme payload</Text>
            <Text style={styles.cardBody}>
              {`shape=${theme.shape}, spacing=${theme.spacing}, bg=${theme.bgColor}`}
            </Text>
            <Text style={styles.cardBody}>{`position=${theme.position}`}</Text>
            <Text style={styles.cardBody}>
              {theme.bgImageUrl ? `bgImage=${theme.bgImageUrl}` : 'bgImage=none'}
            </Text>
            <Text style={styles.cardBody}>
              {theme.emptyColor ? `empty=${theme.emptyColor}` : 'empty=auto'}
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Data routing</Text>
            <Text style={styles.cardBody}>
              App state now syncs through `/moods`, `/theme`, and `/token` using Bearer auth.
            </Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Shortcuts setup</Text>
            <Text style={styles.cardBody}>
              Open onboarding for the automation steps.
            </Text>
            <Pressable style={styles.primaryButton} onPress={() => router.push('/onboarding')}>
              <Text style={styles.primaryButtonText}>Open onboarding</Text>
            </Pressable>
          </View>

          <View style={styles.card}>
            <Text style={styles.cardTitle}>Testing tools</Text>
            <Text style={styles.cardBody}>
              Reset onboarding to validate first-launch flow again.
            </Text>
            <Pressable
              disabled={isResettingOnboarding}
              onPress={() => {
                void resetOnboarding();
              }}
              style={[styles.secondaryButton, isResettingOnboarding ? styles.buttonDisabled : undefined]}>
              <Text style={styles.secondaryButtonText}>
                {isResettingOnboarding ? 'Resetting...' : 'Reset onboarding'}
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
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
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: palette.ink,
  },
  cardBody: {
    fontFamily: fonts.body,
    color: palette.mutedText,
    lineHeight: 20,
    fontSize: 14,
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
    color: '#b42318',
    fontSize: 14,
  },
  errorText: {
    fontFamily: fonts.body,
    color: '#b42318',
    fontSize: 13,
    lineHeight: 19,
  },
  urlPreview: {
    borderRadius: radii.sm,
    backgroundColor: palette.emptyPixel,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  urlText: {
    fontFamily: fonts.body,
    fontSize: 12,
    color: palette.ink,
  },
  primaryButton: {
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.paper,
    fontSize: 14,
  },
  secondaryButton: {
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 14,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  appearanceRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  appearanceOption: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  appearanceOptionActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  appearanceOptionText: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 13,
  },
  appearanceOptionTextActive: {
    color: palette.paper,
  },
  actionButton: {
    flex: 1,
    marginTop: spacing.xs,
  },
  buttonDisabled: {
    opacity: 0.55,
  },
});
