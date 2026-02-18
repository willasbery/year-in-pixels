import { useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppStore } from '@/lib/store';
import { fonts, radii, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

export default function WallpaperPreviewScreen() {
  const router = useRouter();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const wallpaperUrl = useAppStore((state) => state.wallpaperUrl);
  const [isLoadingImage, setIsLoadingImage] = useState(Boolean(wallpaperUrl));
  const [hasImageError, setHasImageError] = useState(false);

  const showEmptyState = !wallpaperUrl || hasImageError;

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView edges={['top', 'bottom']} style={styles.safeArea}>
        <View style={styles.content}>
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
              <Pressable onPress={() => router.back()} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>Go back</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.previewFrame}>
              <Image
                source={{ uri: wallpaperUrl }}
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
              {isLoadingImage ? (
                <View style={styles.loadingOverlay}>
                  <ActivityIndicator color={palette.ink} size="small" />
                  <Text style={styles.loadingText}>Loading preview...</Text>
                </View>
              ) : null}
            </View>
          )}

          {!showEmptyState ? <Text style={styles.hint}>Previewing today's background in-app.</Text> : null}
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette) =>
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
      paddingBottom: spacing.lg,
      gap: spacing.lg,
    },
    topBar: {
      marginTop: spacing.sm,
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
      flex: 1,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: palette.softStroke,
      overflow: 'hidden',
      backgroundColor: palette.paper,
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
  });
