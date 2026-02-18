import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  fonts,
  moodScale,
  palette,
  radii,
  spacing,
  type ThemeSettings,
} from '@/lib/theme';

type ThemeEditorProps = {
  theme: ThemeSettings;
  isUpdatingTheme: boolean;
  onSetShape: (shape: ThemeSettings['shape']) => void;
  onCycleSpacing: () => void;
  onResetTheme: () => void;
};

export default function ThemeEditor({
  theme,
  isUpdatingTheme,
  onSetShape,
  onCycleSpacing,
  onResetTheme,
}: ThemeEditorProps) {
  const spacingLabel =
    theme.spacing === 'tight'
      ? 'Tight spacing'
      : theme.spacing === 'wide'
        ? 'Wide spacing'
        : 'Medium spacing';

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Theme editor</Text>
      <Text style={styles.subtitle}>
        Updates here persist through `/theme` immediately.
      </Text>

      <View style={styles.row}>
        {moodScale.map((mood) => (
          <View key={mood.level} style={styles.swatchWrap}>
            <View style={[styles.swatch, { backgroundColor: theme.moodColors[mood.level] }]} />
            <Text style={styles.swatchLabel}>{mood.level}</Text>
          </View>
        ))}
      </View>

      <View style={styles.badges}>
        <Pressable
          onPress={() => onSetShape('rounded')}
          style={[
            styles.badge,
            theme.shape === 'rounded' ? styles.badgeActive : undefined,
          ]}>
          <Text
            style={[
              styles.badgeText,
              theme.shape === 'rounded' ? styles.badgeTextActive : undefined,
            ]}>
            Rounded
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onSetShape('square')}
          style={[
            styles.badge,
            theme.shape === 'square' ? styles.badgeActive : undefined,
          ]}>
          <Text
            style={[
              styles.badgeText,
              theme.shape === 'square' ? styles.badgeTextActive : undefined,
            ]}>
            Square
          </Text>
        </Pressable>
        <Pressable onPress={onCycleSpacing} style={styles.badge}>
          <Text style={styles.badgeText}>{spacingLabel}</Text>
        </Pressable>
      </View>

      <Pressable
        disabled={isUpdatingTheme}
        onPress={onResetTheme}
        style={[styles.button, isUpdatingTheme ? styles.buttonDisabled : undefined]}>
        <Text style={styles.buttonText}>
          {isUpdatingTheme ? 'Saving theme...' : 'Reset default colors'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
    gap: spacing.sm,
  },
  title: {
    fontFamily: fonts.bodyMedium,
    fontSize: 16,
    color: palette.ink,
  },
  subtitle: {
    fontFamily: fonts.body,
    fontSize: 13,
    lineHeight: 19,
    color: palette.mutedText,
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  swatchWrap: {
    alignItems: 'center',
    gap: 4,
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 999,
  },
  swatchLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: palette.mutedText,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  badge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: palette.softStroke,
  },
  badgeActive: {
    backgroundColor: palette.ink,
    borderColor: palette.ink,
  },
  badgeText: {
    fontFamily: fonts.body,
    color: palette.ink,
    fontSize: 11,
  },
  badgeTextActive: {
    color: palette.paper,
  },
  button: {
    marginTop: spacing.xs,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  buttonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
});
