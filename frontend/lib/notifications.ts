import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export type ReminderTime = {
  hour: number;
  minute: number;
};

export type ReminderScheduleResult = 'scheduled' | 'denied' | 'unsupported';

const REMINDER_TIME_KEY = 'year_in_pixels_daily_reminder_time_v1';
const REMINDER_NOTIFICATION_ID_KEY = 'year_in_pixels_daily_reminder_id_v1';
const REMINDER_CHANNEL_ID = 'year_in_pixels_daily_reminder';

export const DEFAULT_REMINDER_TIME: ReminderTime = {
  hour: 20,
  minute: 0,
};

function normalizeReminderTime(value: unknown): ReminderTime | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  const hour = typeof record.hour === 'number' ? Math.floor(record.hour) : NaN;
  const minute = typeof record.minute === 'number' ? Math.floor(record.minute) : NaN;

  if (Number.isNaN(hour) || Number.isNaN(minute)) {
    return null;
  }

  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return { hour, minute };
}

async function ensureNotificationPermission(): Promise<boolean> {
  const notifications = await getNotificationsModule();
  if (!notifications) {
    return false;
  }

  const currentPermission = await notifications.getPermissionsAsync();
  if (currentPermission.status === 'granted') {
    return true;
  }

  const requestedPermission = await notifications.requestPermissionsAsync();
  return requestedPermission.status === 'granted';
}

async function ensureAndroidNotificationChannel(): Promise<void> {
  if (Platform.OS !== 'android') {
    return;
  }

  const notifications = await getNotificationsModule();
  if (!notifications) {
    return;
  }

  await notifications.setNotificationChannelAsync(REMINDER_CHANNEL_ID, {
    name: 'Daily Mood Reminder',
    importance: notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 200, 120, 200],
  });
}

async function getNotificationsModule() {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

function formatHourMinute(hour: number, minute: number): string {
  const period = hour >= 12 ? 'PM' : 'AM';
  const normalizedHour = ((hour + 11) % 12) + 1;
  const minuteText = String(minute).padStart(2, '0');
  return `${normalizedHour}:${minuteText} ${period}`;
}

export function formatReminderTime(time: ReminderTime): string {
  return formatHourMinute(time.hour, time.minute);
}

export async function getSavedReminderTime(): Promise<ReminderTime | null> {
  try {
    const raw = await AsyncStorage.getItem(REMINDER_TIME_KEY);
    if (!raw) {
      return null;
    }
    return normalizeReminderTime(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveReminderTime(time: ReminderTime): Promise<void> {
  const normalized = normalizeReminderTime(time);
  if (!normalized) {
    return;
  }

  try {
    await AsyncStorage.setItem(REMINDER_TIME_KEY, JSON.stringify(normalized));
  } catch {
    // Best-effort persistence only.
  }
}

export async function scheduleDailyMoodReminder(time: ReminderTime): Promise<ReminderScheduleResult> {
  const normalized = normalizeReminderTime(time);
  if (!normalized) {
    throw new Error('Reminder time is invalid.');
  }

  await saveReminderTime(normalized);

  if (Platform.OS === 'web') {
    return 'unsupported';
  }

  const notifications = await getNotificationsModule();
  if (!notifications) {
    return 'unsupported';
  }

  const hasPermission = await ensureNotificationPermission();
  if (!hasPermission) {
    return 'denied';
  }

  await ensureAndroidNotificationChannel();

  try {
    const previousIdentifier = await AsyncStorage.getItem(REMINDER_NOTIFICATION_ID_KEY);
    if (previousIdentifier) {
      await notifications.cancelScheduledNotificationAsync(previousIdentifier);
    }
  } catch {
    // Continue and schedule a new reminder.
  }

  const notificationId = await notifications.scheduleNotificationAsync({
    content: {
      title: 'Year in Pixels',
      body: "How are you feeling today? Log today's mood in one tap.",
    },
    trigger: {
      type: notifications.SchedulableTriggerInputTypes.DAILY,
      channelId: Platform.OS === 'android' ? REMINDER_CHANNEL_ID : undefined,
      hour: normalized.hour,
      minute: normalized.minute,
    },
  });

  try {
    await AsyncStorage.setItem(REMINDER_NOTIFICATION_ID_KEY, notificationId);
  } catch {
    // Best-effort persistence only.
  }

  return 'scheduled';
}

export async function disableDailyMoodReminder(): Promise<void> {
  try {
    const previousIdentifier = await AsyncStorage.getItem(REMINDER_NOTIFICATION_ID_KEY);
    if (!previousIdentifier) {
      return;
    }

    const notifications = await getNotificationsModule();
    if (notifications && Platform.OS !== 'web') {
      await notifications.cancelScheduledNotificationAsync(previousIdentifier);
    }
  } catch {
    // Best-effort cancellation only.
  } finally {
    try {
      await AsyncStorage.removeItem(REMINDER_NOTIFICATION_ID_KEY);
    } catch {
      // Ignore cleanup failures.
    }
  }
}
