import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useCallback, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radii, spacing, type AppPalette } from '@/lib/theme';
import type { ReminderTime } from '@/lib/notifications';

type ReminderStepCardProps = {
  time: ReminderTime;
  hasSelection: boolean;
  onSelectTime: (time: ReminderTime) => void;
  onEnableReminders: () => void;
  onDisableReminders: () => void;
  remindersDisabled: boolean;
  statusMessage: string | null;
  palette: AppPalette;
};

export default function ReminderStepCard({
  time,
  hasSelection,
  onSelectTime,
  onEnableReminders,
  onDisableReminders,
  remindersDisabled,
  statusMessage,
  palette,
}: ReminderStepCardProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);
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
      <View style={styles.choiceRow}>
        <Pressable
          onPress={onEnableReminders}
          style={[
            styles.choiceButton,
            hasSelection && !remindersDisabled ? styles.choiceButtonActive : undefined,
          ]}>
          <Text
            style={[
              styles.choiceButtonText,
              hasSelection && !remindersDisabled ? styles.choiceButtonTextActive : undefined,
            ]}>
            Daily reminder
          </Text>
        </Pressable>
        <Pressable
          onPress={onDisableReminders}
          style={[
            styles.choiceButton,
            hasSelection && remindersDisabled ? styles.choiceButtonActive : undefined,
          ]}>
          <Text
            style={[
              styles.choiceButtonText,
              hasSelection && remindersDisabled ? styles.choiceButtonTextActive : undefined,
            ]}>
            No reminders
          </Text>
        </Pressable>
      </View>

      {!remindersDisabled ? (
        Platform.OS === 'ios' ? (
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
        )
      ) : (
        <View style={styles.reminderOffCard}>
          <Text style={styles.reminderOffTitle}>No reminders selected</Text>
          <Text style={styles.reminderOffBody}>You can enable them anytime in Settings.</Text>
        </View>
      )}

      {statusMessage ? <Text style={styles.reminderStatus}>{statusMessage}</Text> : null}
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
    choiceRow: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    choiceButton: {
      flex: 1,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.surface,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    choiceButtonActive: {
      borderColor: palette.ink,
      backgroundColor: palette.glass,
    },
    choiceButtonText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 13,
      color: palette.mutedText,
    },
    choiceButtonTextActive: {
      color: palette.ink,
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
    reminderOffCard: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
      padding: spacing.sm,
      gap: 4,
    },
    reminderOffTitle: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 13,
    },
    reminderOffBody: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      fontSize: 13,
      lineHeight: 18,
    },
    reminderStatus: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
  });

export type { ReminderStepCardProps };
