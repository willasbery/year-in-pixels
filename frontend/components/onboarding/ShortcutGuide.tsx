import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, radii, spacing, type AppPalette } from '@/lib/theme';

const shortcutSteps = [
  'Add a URL action and paste your wallpaper URL.',
  'Add Get Contents of URL.',
  'Add Set Wallpaper Photo (Lock Screen).',
  'Create a daily Time of Day automation (12:00 AM).',
];

type ShortcutGuideProps = {
  wallpaperUrl: string;
  palette: AppPalette;
};

export default function ShortcutGuide({ wallpaperUrl, palette }: ShortcutGuideProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);

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

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
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
  });

export type { ShortcutGuideProps };
