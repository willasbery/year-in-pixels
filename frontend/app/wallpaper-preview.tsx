import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppStore } from '@/lib/store';
import { fonts, radii, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

const IPHONE_WALLPAPER_ASPECT_RATIO = 1290 / 2796;
const IPHONE_WALLPAPER_WIDTH = 1290;
const IPHONE_WALLPAPER_HEIGHT = 2796;
const CLOCK_GUIDE_RECT = {
  left: 0.17,
  top: 0.05,
  right: 0.83,
  bottom: (320 + 220) / IPHONE_WALLPAPER_HEIGHT,
};
const WIDGET_GUIDE_RECT = {
  left: 72 / IPHONE_WALLPAPER_WIDTH,
  top: (320 + 170) / IPHONE_WALLPAPER_HEIGHT,
  right: (IPHONE_WALLPAPER_WIDTH - 72) / IPHONE_WALLPAPER_WIDTH,
  bottom: (320 + 620) / IPHONE_WALLPAPER_HEIGHT,
};

export default function WallpaperPreviewScreen() {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette, insets.bottom), [insets.bottom, palette]);
  const isCompact = width < 370;
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const theme = useAppStore((state) => state.theme);
  const [previewNonce, setPreviewNonce] = useState(0);
  const imageUri = useMemo(() => {
    if (!wallpaperUrl) {
      return null;
    }

    const themeFingerprint = [
      theme.bgColor,
      theme.emptyColor ?? 'auto',
      theme.shape,
      theme.spacing,
      theme.position,
      String(theme.columns),
      theme.avoidLockScreenUi ? 'safe-on' : 'safe-off',
      theme.moodColors[1],
      theme.moodColors[2],
      theme.moodColors[3],
      theme.moodColors[4],
      theme.moodColors[5],
    ].join('|');
    const separator = wallpaperUrl.includes('?') ? '&' : '?';

    return `${wallpaperUrl}${separator}preview=1&theme=${encodeURIComponent(themeFingerprint)}&nonce=${previewNonce}`;
  }, [previewNonce, theme, wallpaperUrl]);

  const [isLoadingImage, setIsLoadingImage] = useState(Boolean(imageUri));
  const [hasImageError, setHasImageError] = useState(false);
  const [showClockGuide, setShowClockGuide] = useState(true);
  const [showWidgetGuide, setShowWidgetGuide] = useState(true);
  const previewFrameSize = useMemo(() => {
    const availableWidth = Math.max(220, width - (spacing.lg * 2));
    const maxPreviewHeight = Math.max(360, height * 0.66);

    let frameWidth = Math.min(availableWidth, 430);
    let frameHeight = frameWidth / IPHONE_WALLPAPER_ASPECT_RATIO;

    if (frameHeight > maxPreviewHeight) {
      frameHeight = maxPreviewHeight;
      frameWidth = frameHeight * IPHONE_WALLPAPER_ASPECT_RATIO;
    }

    return {
      width: Math.round(frameWidth),
      height: Math.round(frameHeight),
    };
  }, [height, width]);

  const showEmptyState = !imageUri || hasImageError;
  const retryPreview = useCallback(() => {
    setHasImageError(false);
    setIsLoadingImage(Boolean(imageUri));
    setPreviewNonce((current) => current + 1);
  }, [imageUri]);

  const clockGuideStyle = useMemo(
    () => ({
      left: Math.round(previewFrameSize.width * CLOCK_GUIDE_RECT.left),
      top: Math.round(previewFrameSize.height * CLOCK_GUIDE_RECT.top),
      width: Math.round(previewFrameSize.width * (CLOCK_GUIDE_RECT.right - CLOCK_GUIDE_RECT.left)),
      height: Math.round(previewFrameSize.height * (CLOCK_GUIDE_RECT.bottom - CLOCK_GUIDE_RECT.top)),
    }),
    [previewFrameSize.height, previewFrameSize.width],
  );

  const widgetGuideStyle = useMemo(
    () => ({
      left: Math.round(previewFrameSize.width * WIDGET_GUIDE_RECT.left),
      top: Math.round(previewFrameSize.height * WIDGET_GUIDE_RECT.top),
      width: Math.round(previewFrameSize.width * (WIDGET_GUIDE_RECT.right - WIDGET_GUIDE_RECT.left)),
      height: Math.round(previewFrameSize.height * (WIDGET_GUIDE_RECT.bottom - WIDGET_GUIDE_RECT.top)),
    }),
    [previewFrameSize.height, previewFrameSize.width],
  );

  const switchTrackColors = useMemo(
    () => ({
      false: 'rgba(120, 128, 138, 0.35)',
      true: palette.ink,
    }),
    [palette.ink],
  );

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}>
          <View style={styles.topBar}>
            <Pressable onPress={() => router.back()} style={styles.backButton}>
              <Text style={styles.backButtonText}>Back</Text>
            </Pressable>
            <Text style={styles.eyebrow}>Wallpaper Preview</Text>
          </View>

          {showEmptyState ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyTitle}>Preview unavailable</Text>
              <Text style={styles.emptyBody}>
                {wallpaperUrl
                  ? 'Unable to load this wallpaper right now. Try refreshing the URL.'
                  : 'No wallpaper URL is available yet. Go back and refresh in Settings.'}
              </Text>
              <View style={[styles.emptyActions, isCompact ? styles.emptyActionsStack : undefined]}>
                <Pressable style={[styles.primaryButton, styles.emptyActionButton]} onPress={() => router.push('/(tabs)/settings')}>
                  <Text style={styles.primaryButtonText}>Open settings</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    if (hasImageError) {
                      retryPreview();
                      return;
                    }
                    router.back();
                  }}
                  style={[styles.secondaryButton, styles.emptyActionButton]}>
                  <Text style={styles.secondaryButtonText}>{hasImageError ? 'Retry preview' : 'Go back'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.previewCanvas}>
              <View style={[styles.previewFrame, previewFrameSize]}>
                <Image
                  source={{ uri: imageUri, cache: 'reload' }}
                  style={styles.previewImage}
                  resizeMode="cover"
                  onLoadStart={() => {
                    setIsLoadingImage(true);
                  }}
                  onLoadEnd={() => {
                    setIsLoadingImage(false);
                  }}
                  onError={() => {
                    setHasImageError(true);
                    setIsLoadingImage(false);
                  }}
                />
                {showClockGuide || showWidgetGuide ? (
                  <View pointerEvents="none" style={styles.guideOverlay}>
                    {showClockGuide ? (
                      <View style={[styles.clockGuideBox, clockGuideStyle]}>
                        <Text style={styles.guideLabel}>Clock</Text>
                      </View>
                    ) : null}
                    {showWidgetGuide ? (
                      <View style={[styles.widgetGuideBox, widgetGuideStyle]}>
                        <Text style={styles.guideLabel}>Widgets</Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {isLoadingImage ? (
                  <View style={styles.loadingOverlay}>
                    <ActivityIndicator color={palette.ink} size="small" />
                    <Text style={styles.loadingText}>Loading preview...</Text>
                  </View>
                ) : null}
              </View>
            </View>
          )}

          {!showEmptyState ? <Text style={styles.hint}>Previewing today&apos;s background in-app.</Text> : null}

          <View style={styles.settingsCard}>
            <Text style={styles.settingsTitle}>Settings</Text>
            <Text style={styles.settingsSubtitle}>
              Toggle lock-screen guide overlays captured from your `lock-preview-base.png` reference.
            </Text>

            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.settingLabel}>Clock Area</Text>
                <Text style={styles.settingHint}>Date and time zone at the top of lock screen.</Text>
              </View>
              <Switch
                value={showClockGuide}
                onValueChange={setShowClockGuide}
                trackColor={switchTrackColors}
                ios_backgroundColor={switchTrackColors.false}
              />
            </View>

            <View style={styles.settingRow}>
              <View style={styles.settingCopy}>
                <Text style={styles.settingLabel}>Widget Area</Text>
                <Text style={styles.settingHint}>Upper-middle widget zone on iPhone lock screen.</Text>
              </View>
              <Switch
                value={showWidgetGuide}
                onValueChange={setShowWidgetGuide}
                trackColor={switchTrackColors}
                ios_backgroundColor={switchTrackColors.false}
              />
            </View>
          </View>
        </ScrollView>
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
    scroll: {
      flex: 1,
    },
    content: {
      paddingHorizontal: spacing.lg,
      paddingBottom: Math.max(spacing.lg, bottomInset + spacing.sm),
      paddingTop: spacing.sm,
      gap: spacing.lg,
    },
    topBar: {
      gap: spacing.sm,
    },
    backButton: {
      alignSelf: 'flex-start',
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: palette.paper,
    },
    backButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 13,
    },
    eyebrow: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 1.5,
      color: palette.mutedText,
    },
    previewFrame: {
      borderRadius: 44,
      borderWidth: 1,
      borderColor: palette.softStroke,
      overflow: 'hidden',
      backgroundColor: palette.paper,
    },
    previewCanvas: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    settingsCard: {
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.22)',
      backgroundColor: 'rgba(24, 30, 40, 0.45)',
      padding: spacing.sm,
      gap: spacing.xs,
    },
    settingsTitle: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 14,
    },
    settingsSubtitle: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      fontSize: 12,
      lineHeight: 17,
    },
    settingRow: {
      marginTop: 4,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    settingCopy: {
      flex: 1,
      gap: 2,
    },
    settingLabel: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 13,
    },
    settingHint: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      fontSize: 12,
      lineHeight: 17,
    },
    guideOverlay: {
      ...StyleSheet.absoluteFillObject,
    },
    clockGuideBox: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: 'rgba(239, 68, 68, 0.85)',
      backgroundColor: 'rgba(239, 68, 68, 0.16)',
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    widgetGuideBox: {
      position: 'absolute',
      borderWidth: 1,
      borderColor: 'rgba(245, 158, 11, 0.85)',
      backgroundColor: 'rgba(245, 158, 11, 0.14)',
      borderRadius: 16,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    guideLabel: {
      fontFamily: fonts.bodyMedium,
      color: '#ffffff',
      fontSize: 11,
      textShadowColor: 'rgba(0,0,0,0.25)',
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    previewImage: {
      width: '100%',
      height: '100%',
    },
    loadingOverlay: {
      ...StyleSheet.absoluteFillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: 'rgba(255, 255, 255, 0.55)',
    },
    loadingText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 13,
    },
    hint: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      fontSize: 13,
      textAlign: 'center',
    },
    emptyCard: {
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    emptyTitle: {
      fontFamily: fonts.bodyMedium,
      fontSize: 16,
      color: palette.ink,
    },
    emptyBody: {
      fontFamily: fonts.body,
      fontSize: 14,
      lineHeight: 20,
      color: palette.mutedText,
    },
    primaryButton: {
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
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      paddingVertical: spacing.sm,
      alignItems: 'center',
      backgroundColor: palette.surface,
    },
    secondaryButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 14,
    },
    emptyActions: {
      marginTop: spacing.xs,
      flexDirection: 'row',
      gap: spacing.sm,
    },
    emptyActionsStack: {
      flexDirection: 'column',
    },
    emptyActionButton: {
      flex: 1,
    },
  });
