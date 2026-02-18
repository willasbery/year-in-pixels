import { memo, useCallback, useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  fonts,
  moodScale,
  radii,
  spacing,
  useAppTheme,
  type AppPalette,
  type ThemeSettings,
} from '@/lib/theme';

type ThemeEditorProps = {
  theme: ThemeSettings;
  onSetShape: (shape: ThemeSettings['shape']) => void;
  onSetSpacing: (spacing: ThemeSettings['spacing']) => void;
  onApplyMoodPreset: (moodColors: ThemeSettings['moodColors']) => void;
  onResetTheme: () => void;
};

type OptionButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
};

const OptionButton = memo(function OptionButton({ label, active, onPress, styles }: OptionButtonProps) {
  return (
    <Pressable onPress={onPress} style={[styles.badge, active ? styles.badgeActive : undefined]}>
      <Text style={[styles.badgeText, active ? styles.badgeTextActive : undefined]}>{label}</Text>
    </Pressable>
  );
});

const moodColorPresets: Array<{
  key: string;
  label: string;
  moodColors: ThemeSettings['moodColors'];
}> = [
  {
    key: 'classic',
    label: 'Classic',
    moodColors: {
      1: '#ef4444',
      2: '#f97316',
      3: '#eab308',
      4: '#22c55e',
      5: '#3b82f6',
    },
  },
  {
    key: 'sunset',
    label: 'Sunset',
    moodColors: {
      1: '#be123c',
      2: '#e11d48',
      3: '#f97316',
      4: '#fb7185',
      5: '#f59e0b',
    },
  },
  {
    key: 'forest',
    label: 'Forest',
    moodColors: {
      1: '#4b5563',
      2: '#7c2d12',
      3: '#a3a3a3',
      4: '#16a34a',
      5: '#14532d',
    },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    moodColors: {
      1: '#1d4ed8',
      2: '#0284c7',
      3: '#06b6d4',
      4: '#2dd4bf',
      5: '#0f766e',
    },
  },
  {
    key: 'pastel',
    label: 'Pastel',
    moodColors: {
      1: '#f9a8d4',
      2: '#fda4af',
      3: '#fde68a',
      4: '#86efac',
      5: '#93c5fd',
    },
  },
  {
    key: 'mono',
    label: 'Monochrome',
    moodColors: {
      1: '#262626',
      2: '#525252',
      3: '#737373',
      4: '#a3a3a3',
      5: '#d4d4d4',
    },
  },
];

function isMoodPresetActive(
  current: ThemeSettings['moodColors'],
  preset: ThemeSettings['moodColors'],
): boolean {
  return moodScale.every(
    (mood) => current[mood.level].toLowerCase() === preset[mood.level].toLowerCase(),
  );
}

function ThemeEditor({
  theme,
  onSetShape,
  onSetSpacing,
  onApplyMoodPreset,
  onResetTheme,
}: ThemeEditorProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const handleRoundedPress = useCallback(() => {
    onSetShape('rounded');
  }, [onSetShape]);

  const handleSquarePress = useCallback(() => {
    onSetShape('square');
  }, [onSetShape]);

  const handleTightPress = useCallback(() => {
    onSetSpacing('tight');
  }, [onSetSpacing]);

  const handleMediumPress = useCallback(() => {
    onSetSpacing('medium');
  }, [onSetSpacing]);

  const handleWidePress = useCallback(() => {
    onSetSpacing('wide');
  }, [onSetSpacing]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Theme editor</Text>
      <Text style={styles.subtitle}>
        Updates here persist through `/theme` immediately.
      </Text>

      <View style={styles.sectionStack}>
        <View style={styles.controlSection}>
          <Text style={styles.sectionLabel}>Mood Colors</Text>
          <View style={styles.presetGrid}>
            {moodColorPresets.map((preset) => {
              const active = isMoodPresetActive(theme.moodColors, preset.moodColors);
              return (
                <Pressable
                  key={preset.key}
                  onPress={() => onApplyMoodPreset(preset.moodColors)}
                  style={[styles.presetCard, active ? styles.presetCardActive : undefined]}>
                  <Text style={[styles.presetLabel, active ? styles.presetLabelActive : undefined]}>
                    {preset.label}
                  </Text>
                  <View style={styles.presetSwatches}>
                    {moodScale.map((mood) => (
                      <View
                        key={`${preset.key}-${mood.level}`}
                        style={[styles.presetSwatch, { backgroundColor: preset.moodColors[mood.level] }]}
                      />
                    ))}
                  </View>
                </Pressable>
              );
            })}
          </View>
        </View>

        <View style={styles.controlSection}>
          <Text style={styles.sectionLabel}>Shape</Text>
          <View style={styles.badges}>
            <OptionButton
              label="Rounded"
              active={theme.shape === 'rounded'}
              onPress={handleRoundedPress}
              styles={styles}
            />
            <OptionButton
              label="Square"
              active={theme.shape === 'square'}
              onPress={handleSquarePress}
              styles={styles}
            />
          </View>
        </View>

        <View style={styles.controlSection}>
          <Text style={styles.sectionLabel}>Gap</Text>
          <View style={styles.badges}>
            <OptionButton
              label="Tight"
              active={theme.spacing === 'tight'}
              onPress={handleTightPress}
              styles={styles}
            />
            <OptionButton
              label="Medium"
              active={theme.spacing === 'medium'}
              onPress={handleMediumPress}
              styles={styles}
            />
            <OptionButton label="Wide" active={theme.spacing === 'wide'} onPress={handleWidePress} styles={styles} />
          </View>
        </View>
      </View>

      <Pressable
        onPress={onResetTheme}
        style={styles.button}>
        <Text style={styles.buttonText}>Reset default colors</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
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
  sectionStack: {
    marginTop: spacing.sm,
    gap: spacing.md,
  },
  badges: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  controlSection: {
    gap: spacing.xs,
  },
  presetGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  presetCard: {
    width: '48%',
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    backgroundColor: palette.paper,
  },
  presetCardActive: {
    borderColor: palette.ink,
    backgroundColor: palette.glass,
  },
  presetLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: palette.ink,
  },
  presetLabelActive: {
    color: palette.ink,
  },
  presetSwatches: {
    flexDirection: 'row',
    gap: 4,
  },
  presetSwatch: {
    flex: 1,
    height: 8,
    borderRadius: 999,
  },
  sectionLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    color: palette.mutedText,
    textTransform: 'uppercase',
    letterSpacing: 1,
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
});

export default memo(ThemeEditor);
