import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, moodScale, radii, spacing, type AppPalette, type MoodLevel } from '@/lib/theme';

type MoodDemoProps = {
  selectedMood: MoodLevel;
  onSelectMood: (mood: MoodLevel) => void;
  palette: AppPalette;
};

export default function MoodDemo({ selectedMood, onSelectMood, palette }: MoodDemoProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
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
  });

export type { MoodDemoProps };
