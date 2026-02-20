import { applySessionRotation, clearSession, getAccessToken } from '@/lib/auth';
import type { MoodLevel, ThemeSettings } from '@/lib/theme';

export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.yearinpixels.app';

type RequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

type RequestOptions = {
  method?: RequestMethod;
  body?: unknown;
  token?: string;
  skipAuth?: boolean;
};

type AnyRecord = Record<string, unknown>;

export type MoodRecord = {
  date: string;
  level: MoodLevel;
  note?: string;
};

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

const DEFAULT_THEME: ThemeSettings = {
  bgColor: '#0d1117',
  moodColors: {
    1: '#ef4444',
    2: '#f97316',
    3: '#eab308',
    4: '#22c55e',
    5: '#3b82f6',
  },
  emptyColor: null,
  shape: 'rounded',
  spacing: 'medium',
  position: 'clock',
  bgImageUrl: null,
};

function isRecord(value: unknown): value is AnyRecord {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function toMoodLevel(value: unknown): MoodLevel | null {
  if (typeof value !== 'number') {
    return null;
  }
  if (value >= 1 && value <= 5) {
    return value as MoodLevel;
  }
  return null;
}

function normalizeMoodRecord(value: unknown): MoodRecord | null {
  if (!isRecord(value)) {
    return null;
  }

  const dateRaw = value.date;
  const levelRaw = value.level;
  const noteRaw = value.note;

  if (typeof dateRaw !== 'string') {
    return null;
  }

  const level = toMoodLevel(levelRaw);
  if (!level) {
    return null;
  }

  if (typeof noteRaw === 'string' && noteRaw.trim().length > 0) {
    return { date: dateRaw, level, note: noteRaw };
  }

  return { date: dateRaw, level };
}

function normalizeMoodPayload(payload: unknown): MoodRecord[] {
  const moodArray = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.moods)
      ? payload.moods
      : [];

  return moodArray
    .map((item) => normalizeMoodRecord(item))
    .filter((item): item is MoodRecord => item !== null);
}

function normalizeHexColor(value: unknown, fallback: string): string {
  if (typeof value !== 'string') {
    return fallback;
  }
  const trimmed = value.trim();
  if (/^#?[0-9a-fA-F]{6}$/.test(trimmed)) {
    return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  }
  return fallback;
}

function normalizeThemeSettings(payload: unknown): ThemeSettings {
  const source = isRecord(payload) && isRecord(payload.theme) ? payload.theme : payload;
  if (!isRecord(source)) {
    return DEFAULT_THEME;
  }

  const moodColorsRaw = isRecord(source.mood_colors)
    ? source.mood_colors
    : isRecord(source.moodColors)
      ? source.moodColors
      : {};

  return {
    bgColor: normalizeHexColor(source.bg_color ?? source.bgColor, DEFAULT_THEME.bgColor),
    moodColors: {
      1: normalizeHexColor(moodColorsRaw['1'], DEFAULT_THEME.moodColors[1]),
      2: normalizeHexColor(moodColorsRaw['2'], DEFAULT_THEME.moodColors[2]),
      3: normalizeHexColor(moodColorsRaw['3'], DEFAULT_THEME.moodColors[3]),
      4: normalizeHexColor(moodColorsRaw['4'], DEFAULT_THEME.moodColors[4]),
      5: normalizeHexColor(moodColorsRaw['5'], DEFAULT_THEME.moodColors[5]),
    },
    emptyColor:
      source.empty_color === null || source.emptyColor === null
        ? null
        : typeof source.empty_color === 'string' || typeof source.emptyColor === 'string'
          ? normalizeHexColor(source.empty_color ?? source.emptyColor, DEFAULT_THEME.bgColor)
          : DEFAULT_THEME.emptyColor,
    shape: source.shape === 'square' ? 'square' : 'rounded',
    spacing:
      source.spacing === 'tight' || source.spacing === 'wide' || source.spacing === 'medium'
        ? source.spacing
        : 'medium',
    position: source.position === 'center' ? 'center' : 'clock',
    bgImageUrl: typeof source.bg_image_url === 'string'
      ? source.bg_image_url
      : typeof source.bgImageUrl === 'string'
        ? source.bgImageUrl
        : null,
  };
}

function serializeThemePatch(patch: Partial<ThemeSettings>): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  if (typeof patch.bgColor === 'string') {
    payload.bg_color = patch.bgColor;
  }

  if (typeof patch.emptyColor === 'string' || patch.emptyColor === null) {
    payload.empty_color = patch.emptyColor;
  }

  if (patch.shape) {
    payload.shape = patch.shape;
  }

  if (patch.spacing) {
    payload.spacing = patch.spacing;
  }

  if (patch.position) {
    payload.position = patch.position;
  }

  if (typeof patch.bgImageUrl === 'string' || patch.bgImageUrl === null) {
    payload.bg_image_url = patch.bgImageUrl;
  }

  if (patch.moodColors) {
    payload.mood_colors = {
      '1': patch.moodColors[1],
      '2': patch.moodColors[2],
      '3': patch.moodColors[3],
      '4': patch.moodColors[4],
      '5': patch.moodColors[5],
    };
  }

  return payload;
}

function parseWallpaperUrl(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const directUrl =
    (typeof payload.url === 'string' && payload.url) ||
    (typeof payload.wallpaperUrl === 'string' && payload.wallpaperUrl) ||
    (typeof payload.wallpaper_url === 'string' && payload.wallpaper_url);

  if (directUrl) {
    return directUrl;
  }

  const token =
    (typeof payload.token === 'string' && payload.token) ||
    (typeof payload.wallpaper_token === 'string' && payload.wallpaper_token) ||
    (typeof payload.wallpaperToken === 'string' && payload.wallpaperToken);

  if (token) {
    return `${API_BASE_URL}/w/${token}`;
  }

  return null;
}

function extractErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  const message = payload.message ?? payload.error ?? payload.detail;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message.trim();
  }

  return null;
}

function resolveToken(token?: string): string | null {
  if (typeof token !== 'string') {
    return null;
  }

  const trimmed = token.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export async function apiRequest<T>(path: string, options: RequestOptions): Promise<T> {
  const token = resolveToken(options.token) ?? (options.skipAuth ? null : await getAccessToken());
  if (!token && !options.skipAuth) {
    throw new ApiError('No active session. Sign in with Apple and try again.', 401);
  }

  const hasBody = typeof options.body !== 'undefined';
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? 'GET',
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : null),
      ...(token ? { Authorization: `Bearer ${token}` } : null),
    },
    body: hasBody ? JSON.stringify(options.body) : undefined,
  });

  const refreshedToken = response.headers.get('x-session-token');
  if (refreshedToken) {
    const refreshedExpiresAt = response.headers.get('x-session-expires-at');
    await applySessionRotation(refreshedToken, refreshedExpiresAt);
  }

  const responseBody = await response.text();

  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && !options.skipAuth) {
      clearSession();
    }

    let message = `API request failed (${response.status})`;
    if (responseBody.trim().length > 0) {
      try {
        message = extractErrorMessage(JSON.parse(responseBody)) ?? message;
      } catch {
        // Keep the default message when the response is not valid JSON.
      }
    }

    throw new ApiError(message, response.status);
  }

  if (response.status === 204) {
    return null as T;
  }

  if (responseBody.trim().length === 0) {
    return null as T;
  }

  return JSON.parse(responseBody) as T;
}

export async function getYearMoods(year: number, token?: string): Promise<MoodRecord[]> {
  const payload = await apiRequest<unknown>(`/moods?year=${year}`, { token });
  return normalizeMoodPayload(payload);
}

export async function upsertMood(
  date: string,
  mood: { level: MoodLevel; note?: string },
  token?: string,
): Promise<MoodRecord> {
  const payload = await apiRequest<unknown>(`/moods/${date}`, {
    method: 'PUT',
    token,
    body: mood,
  });

  const normalized = normalizeMoodRecord(payload);
  if (normalized) {
    return normalized;
  }

  return { date, level: mood.level, note: mood.note };
}

export async function deleteMood(date: string, token?: string): Promise<void> {
  await apiRequest<unknown>(`/moods/${date}`, {
    method: 'DELETE',
    token,
  });
}

export async function getTheme(token?: string): Promise<ThemeSettings> {
  const payload = await apiRequest<unknown>('/theme', { token });
  return normalizeThemeSettings(payload);
}

export async function updateTheme(
  patch: Partial<ThemeSettings>,
  token?: string,
): Promise<ThemeSettings> {
  const payload = await apiRequest<unknown>('/theme', {
    method: 'PUT',
    token,
    body: serializeThemePatch(patch),
  });
  return normalizeThemeSettings(payload);
}

export async function getWallpaperUrl(token?: string): Promise<string | null> {
  const payload = await apiRequest<unknown>('/token', { token });
  return parseWallpaperUrl(payload);
}

export async function rotateWallpaperUrl(token?: string): Promise<string | null> {
  const payload = await apiRequest<unknown>('/token/rotate', {
    method: 'POST',
    token,
  });
  return parseWallpaperUrl(payload);
}

export function getDefaultThemeSettings(): ThemeSettings {
  return {
    ...DEFAULT_THEME,
    moodColors: {
      ...DEFAULT_THEME.moodColors,
    },
  };
}
