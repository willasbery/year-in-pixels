import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { formatDateLabel } from '@/lib/date';
import type { MoodEntry } from '@/lib/store';
import {
  fonts,
  moodScale,
  radii,
  spacing,
  useAppTheme,
  type AppColorMode,
  type AppPalette,
  type MoodLevel,
  type ThemeSettings,
} from '@/lib/theme';

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

type MoodPickerProps = {
  visible: boolean;
  dateKey: string | null;
  entry?: MoodEntry;
  moodColors: ThemeSettings['moodColors'];
  onClose: () => void;
  onSave: (level: MoodLevel, note?: string) => void;
  onClear: () => void;
};

export default function MoodPicker({
  visible,
  dateKey,
  entry,
  moodColors,
  onClose,
  onSave,
  onClear,
}: MoodPickerProps) {
  const { mode, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(mode, palette), [mode, palette]);
  const [isMounted, setIsMounted] = useState(visible);
  const [selectedLevel, setSelectedLevel] = useState<MoodLevel | null>(entry?.level ?? null);
  const [note, setNote] = useState(entry?.note ?? '');
  const [activeDateKey, setActiveDateKey] = useState<string | null>(dateKey);
  const sheetProgress = useRef(new Animated.Value(visible ? 0 : 1)).current;
  const backdropOpacity = useRef(new Animated.Value(visible ? 1 : 0)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }
    setSelectedLevel(entry?.level ?? null);
    setNote(entry?.note ?? '');
  }, [entry?.level, entry?.note, visible]);

  useEffect(() => {
    if (!visible) {
      return;
    }
    setActiveDateKey(dateKey);
  }, [dateKey, visible]);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
    }
  }, [visible]);

  useEffect(() => {
    if (!isMounted) {
      return;
    }

    if (visible) {
      sheetProgress.setValue(1);
      backdropOpacity.setValue(0);
      let backdropInAnimation: Animated.CompositeAnimation | null = null;
      const openAnimation = Animated.timing(sheetProgress, {
        toValue: 0,
        duration: 260,
        useNativeDriver: true,
      });
      openAnimation.start(({ finished }) => {
        if (finished) {
          backdropInAnimation = Animated.timing(backdropOpacity, {
            toValue: 1,
            duration: 80,
            useNativeDriver: true,
          });
          backdropInAnimation.start();
        }
      });
      return () => {
        openAnimation.stop();
        backdropInAnimation?.stop();
      };
    }

    backdropOpacity.setValue(0);

    const closeAnimation = Animated.timing(sheetProgress, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    });

    closeAnimation.start(({ finished }) => {
      if (finished) {
        setIsMounted(false);
      }
    });

    return () => closeAnimation.stop();
  }, [backdropOpacity, isMounted, sheetProgress, visible]);

  const title = useMemo(() => {
    if (!activeDateKey) {
      return 'How was your day?';
    }
    return formatDateLabel(activeDateKey);
  }, [activeDateKey]);

  if (!isMounted) {
    return null;
  }

  const sheetTranslateY = sheetProgress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 420],
  });

  return (
    <Modal animationType="none" transparent visible={isMounted} onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <AnimatedPressable style={[styles.backdrop, { opacity: backdropOpacity }]} onPress={onClose} />
        <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetTranslateY }] }]}>
          <Text style={styles.eyebrow}>Log mood</Text>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.options}>
            {moodScale.map((mood) => (
              <Pressable
                key={mood.level}
                onPress={() => setSelectedLevel(mood.level)}
                style={styles.option}>
                <View
                  style={[
                    styles.swatch,
                    {
                      backgroundColor: moodColors[mood.level] ?? mood.color,
                      borderColor:
                        selectedLevel === mood.level ? palette.ink : 'rgba(0, 0, 0, 0)',
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.optionLabel,
                    selectedLevel === mood.level ? styles.optionLabelActive : undefined,
                  ]}>
                  {mood.label}
                </Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="Optional note..."
            placeholderTextColor={palette.mutedText}
            maxLength={80}
            multiline
            style={styles.noteInput}
          />

          <View style={styles.actions}>
            <Pressable style={styles.ghostButton} onPress={onClear}>
              <Text style={styles.ghostButtonText}>Clear day</Text>
            </Pressable>

            <Pressable
              disabled={!selectedLevel}
              onPress={() => {
                if (!selectedLevel) {
                  return;
                }
                onSave(selectedLevel, note.trim() || undefined);
              }}
              style={[styles.primaryButton, !selectedLevel ? styles.primaryButtonDisabled : undefined]}>
              <Text style={styles.primaryButtonText}>Save mood</Text>
            </Pressable>
          </View>
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const createStyles = (mode: AppColorMode, palette: AppPalette) => StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: mode === 'dark' ? 'rgba(0, 0, 0, 0.5)' : 'rgba(24, 21, 18, 0.2)',
  },
  sheet: {
    backgroundColor: palette.paper,
    borderTopLeftRadius: radii.card,
    borderTopRightRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  eyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: palette.mutedText,
  },
  title: {
    fontFamily: fonts.bodyBold,
    color: palette.ink,
    fontSize: 22,
  },
  options: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  option: {
    alignItems: 'center',
    gap: 6,
    flex: 1,
  },
  swatch: {
    width: 42,
    height: 42,
    borderRadius: 999,
    borderWidth: 2,
  },
  optionLabel: {
    fontFamily: fonts.body,
    fontSize: 11,
    color: palette.mutedText,
  },
  optionLabelActive: {
    color: palette.ink,
    fontFamily: fonts.bodyMedium,
  },
  noteInput: {
    minHeight: 80,
    borderRadius: radii.sm,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.surface,
    padding: spacing.sm,
    textAlignVertical: 'top',
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.ink,
  },
  actions: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    gap: spacing.sm,
  },
  ghostButton: {
    flex: 1,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: palette.softStroke,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  ghostButtonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.ink,
    fontSize: 13,
  },
  primaryButton: {
    flex: 1,
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.45,
  },
  primaryButtonText: {
    fontFamily: fonts.bodyMedium,
    color: palette.paper,
    fontSize: 13,
  },
});
