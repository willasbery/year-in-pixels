import { create } from 'zustand';

import {
  ApiError,
  deleteMood,
  getDefaultThemeSettings,
  getTheme,
  getWallpaperUrl,
  getYearMoods,
  rotateWallpaperUrl,
  updateTheme,
  upsertMood,
} from '@/lib/api';
import { getAccessToken } from '@/lib/auth';
import type { MoodLevel, ThemeSettings } from '@/lib/theme';

export type MoodEntry = {
  level: MoodLevel;
  note?: string;
};

export type MoodEntries = Record<string, MoodEntry>;

type AppState = {
  entries: MoodEntries;
  theme: ThemeSettings;
  wallpaperUrl: string | null;
  isHydrating: boolean;
  isSavingMood: boolean;
  isUpdatingTheme: boolean;
  isRotatingToken: boolean;
  hasHydrated: boolean;
  authRequired: boolean;
  lastError: string | null;
  selectedDateKey: string | null;
  hydrate: (year: number) => Promise<void>;
  refreshThemeAndToken: () => Promise<void>;
  rotateWallpaperToken: () => Promise<void>;
  updateThemeSettings: (patch: Partial<ThemeSettings>) => Promise<void>;
  openMoodPicker: (dateKey: string) => void;
  closeMoodPicker: () => void;
  setMood: (dateKey: string, level: MoodLevel, note?: string) => Promise<void>;
  clearMood: (dateKey: string) => Promise<void>;
  clearError: () => void;
};

const MISSING_TOKEN_MESSAGE = 'No active session found. Sign in with Apple to continue.';
let latestThemeUpdateRequestId = 0;

function isUnauthorizedError(error: unknown): boolean {
  return error instanceof ApiError && (error.status === 401 || error.status === 403);
}

function normalizeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) {
      return 'Session expired. Sign in again.';
    }
    return `Request failed (${error.status}).`;
  }
  if (error instanceof Error && error.message.trim()) {
    return error.message;
  }
  return 'Something went wrong while syncing data.';
}

function toEntriesMap(records: Array<{ date: string; level: MoodLevel; note?: string }>): MoodEntries {
  return records.reduce<MoodEntries>((acc, record) => {
    acc[record.date] = {
      level: record.level,
      note: record.note,
    };
    return acc;
  }, {});
}

async function requireToken(set: (partial: Partial<AppState>) => void): Promise<string | null> {
  const token = await getAccessToken();
  if (token) {
    return token;
  }

  set({
    authRequired: true,
    lastError: MISSING_TOKEN_MESSAGE,
  });
  return null;
}

export const useAppStore = create<AppState>((set, get) => ({
  entries: {},
  theme: getDefaultThemeSettings(),
  wallpaperUrl: null,
  isHydrating: false,
  isSavingMood: false,
  isUpdatingTheme: false,
  isRotatingToken: false,
  hasHydrated: false,
  authRequired: false,
  lastError: null,
  selectedDateKey: null,
  hydrate: async (year) => {
    set({ isHydrating: true, lastError: null });

    const token = await requireToken(set);
    if (!token) {
      set({
        entries: {},
        theme: getDefaultThemeSettings(),
        wallpaperUrl: null,
        hasHydrated: true,
        isHydrating: false,
      });
      return;
    }

    const [moodsResult, themeResult, wallpaperResult] = await Promise.allSettled([
      getYearMoods(year, token),
      getTheme(token),
      getWallpaperUrl(token),
    ]);

    const partial: Partial<AppState> = {
      hasHydrated: true,
      isHydrating: false,
      authRequired: false,
    };

    if (moodsResult.status === 'fulfilled') {
      partial.entries = toEntriesMap(moodsResult.value);
    } else {
      partial.lastError = normalizeErrorMessage(moodsResult.reason);
      if (isUnauthorizedError(moodsResult.reason)) {
        partial.authRequired = true;
      }
    }

    if (themeResult.status === 'fulfilled') {
      partial.theme = themeResult.value;
    } else {
      partial.theme = getDefaultThemeSettings();
      partial.lastError = partial.lastError ?? normalizeErrorMessage(themeResult.reason);
      if (isUnauthorizedError(themeResult.reason)) {
        partial.authRequired = true;
      }
    }

    if (wallpaperResult.status === 'fulfilled') {
      partial.wallpaperUrl = wallpaperResult.value;
    } else {
      partial.wallpaperUrl = null;
      partial.lastError = partial.lastError ?? normalizeErrorMessage(wallpaperResult.reason);
      if (isUnauthorizedError(wallpaperResult.reason)) {
        partial.authRequired = true;
      }
    }

    if (partial.authRequired) {
      partial.entries = {};
      partial.theme = getDefaultThemeSettings();
      partial.wallpaperUrl = null;
    }

    set(partial);
  },
  refreshThemeAndToken: async () => {
    const token = await requireToken(set);
    if (!token) {
      return;
    }

    set({ isUpdatingTheme: true, lastError: null, authRequired: false });
    try {
      const [theme, wallpaperUrl] = await Promise.all([getTheme(token), getWallpaperUrl(token)]);
      set({
        theme,
        wallpaperUrl,
        authRequired: false,
      });
    } catch (error) {
      set({
        lastError: normalizeErrorMessage(error),
        authRequired: isUnauthorizedError(error),
      });
    } finally {
      set({ isUpdatingTheme: false });
    }
  },
  rotateWallpaperToken: async () => {
    const token = await requireToken(set);
    if (!token) {
      return;
    }

    set({ isRotatingToken: true, lastError: null, authRequired: false });
    try {
      const wallpaperUrl = await rotateWallpaperUrl(token);
      set({
        wallpaperUrl,
        authRequired: false,
      });
    } catch (error) {
      set({
        lastError: normalizeErrorMessage(error),
        authRequired: isUnauthorizedError(error),
      });
    } finally {
      set({ isRotatingToken: false });
    }
  },
  updateThemeSettings: async (patch) => {
    const requestId = ++latestThemeUpdateRequestId;
    const previousTheme = get().theme;
    const optimisticMoodColors = patch.moodColors
      ? {
          ...previousTheme.moodColors,
          ...patch.moodColors,
        }
      : previousTheme.moodColors;

    const optimisticTheme: ThemeSettings = {
      ...previousTheme,
      ...patch,
      moodColors: optimisticMoodColors,
    };

    set({ theme: optimisticTheme, isUpdatingTheme: true, lastError: null });

    const token = await requireToken(set);
    if (!token) {
      if (requestId === latestThemeUpdateRequestId) {
        set({ theme: previousTheme, isUpdatingTheme: false });
      }
      return;
    }

    try {
      const nextTheme = await updateTheme(patch, token);
      if (requestId === latestThemeUpdateRequestId) {
        set({ theme: nextTheme, authRequired: false });
      }
    } catch (error) {
      if (requestId === latestThemeUpdateRequestId) {
        set({
          theme: previousTheme,
          lastError: normalizeErrorMessage(error),
          authRequired: isUnauthorizedError(error),
        });
      }
    } finally {
      if (requestId === latestThemeUpdateRequestId) {
        set({ isUpdatingTheme: false });
      }
    }
  },
  openMoodPicker: (dateKey) => set({ selectedDateKey: dateKey }),
  closeMoodPicker: () => set({ selectedDateKey: null }),
  setMood: async (dateKey, level, note) => {
    const normalizedNote = note?.trim() || undefined;
    const previousEntry = get().entries[dateKey];

    set((state) => ({
      isSavingMood: true,
      lastError: null,
      entries: {
        ...state.entries,
        [dateKey]: { level, note: normalizedNote },
      },
    }));

    const token = await requireToken(set);
    if (!token) {
      set((state) => {
        const nextEntries = { ...state.entries };
        if (previousEntry) {
          nextEntries[dateKey] = previousEntry;
        } else {
          delete nextEntries[dateKey];
        }
        return { entries: nextEntries, isSavingMood: false };
      });
      return;
    }

    try {
      const savedMood = await upsertMood(dateKey, { level, note: normalizedNote }, token);
      set((state) => ({
        authRequired: false,
        entries: {
          ...state.entries,
          [dateKey]: { level: savedMood.level, note: savedMood.note },
        },
      }));
    } catch (error) {
      set((state) => {
        const nextEntries = { ...state.entries };
        if (previousEntry) {
          nextEntries[dateKey] = previousEntry;
        } else {
          delete nextEntries[dateKey];
        }
        return {
          entries: nextEntries,
          lastError: normalizeErrorMessage(error),
          authRequired: isUnauthorizedError(error),
        };
      });
    } finally {
      set({ isSavingMood: false });
    }
  },
  clearMood: async (dateKey) => {
    const previousEntry = get().entries[dateKey];
    if (!previousEntry) {
      return;
    }

    set((state) => {
      const nextEntries = { ...state.entries };
      delete nextEntries[dateKey];
      return {
        entries: nextEntries,
        isSavingMood: true,
        lastError: null,
      };
    });

    const token = await requireToken(set);
    if (!token) {
      set((state) => ({
        entries: {
          ...state.entries,
          [dateKey]: previousEntry,
        },
        isSavingMood: false,
      }));
      return;
    }

    try {
      await deleteMood(dateKey, token);
      set({ authRequired: false });
    } catch (error) {
      set((state) => ({
        entries: {
          ...state.entries,
          [dateKey]: previousEntry,
        },
        lastError: normalizeErrorMessage(error),
        authRequired: isUnauthorizedError(error),
      }));
    } finally {
      set({ isSavingMood: false });
    }
  },
  clearError: () => set({ lastError: null }),
}));
