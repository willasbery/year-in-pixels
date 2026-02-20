import { describe, expect, it, vi } from 'vitest';

type MoodLevel = 1 | 2 | 3 | 4 | 5;

type MoodRecord = {
  date: string;
  level: MoodLevel;
  note?: string;
};

type ThemeSettings = {
  bgColor: string;
  moodColors: Record<MoodLevel, string>;
  emptyColor: string | null;
  shape: 'rounded' | 'square';
  spacing: 'tight' | 'medium' | 'wide';
  position: 'clock' | 'center';
  bgImageUrl: string | null;
};

type MoodEntry = {
  level: MoodLevel;
  note?: string;
};

type StoreSnapshot = {
  entries: Record<string, MoodEntry>;
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
};

const MISSING_TOKEN_MESSAGE = 'No active session found. Sign in with Apple to continue.';

const createDefaultThemeSettings = (): ThemeSettings => ({
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
});

class MockApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

let currentToken: string | null = 'token-123';

let deleteMoodCalls: Array<[string, string | undefined]> = [];
let getThemeCalls: Array<[string | undefined]> = [];
let getWallpaperUrlCalls: Array<[string | undefined]> = [];
let getYearMoodsCalls: Array<[number, string | undefined]> = [];
let rotateWallpaperUrlCalls: Array<[string | undefined]> = [];
let updateThemeCalls: Array<[Partial<ThemeSettings>, string | undefined]> = [];
let upsertMoodCalls: Array<[string, { level: MoodLevel; note?: string }, string | undefined]> = [];

let deleteMoodImpl: (date: string, token?: string) => Promise<void>;
let getThemeImpl: (token?: string) => Promise<ThemeSettings>;
let getWallpaperUrlImpl: (token?: string) => Promise<string | null>;
let getYearMoodsImpl: (year: number, token?: string) => Promise<MoodRecord[]>;
let rotateWallpaperUrlImpl: (token?: string) => Promise<string | null>;
let updateThemeImpl: (patch: Partial<ThemeSettings>, token?: string) => Promise<ThemeSettings>;
let upsertMoodImpl: (
  date: string,
  mood: { level: MoodLevel; note?: string },
  token?: string,
) => Promise<MoodRecord>;

function resetDoubles() {
  currentToken = 'token-123';

  deleteMoodCalls = [];
  getThemeCalls = [];
  getWallpaperUrlCalls = [];
  getYearMoodsCalls = [];
  rotateWallpaperUrlCalls = [];
  updateThemeCalls = [];
  upsertMoodCalls = [];

  deleteMoodImpl = async () => {};
  getThemeImpl = async () => createDefaultThemeSettings();
  getWallpaperUrlImpl = async () => null;
  getYearMoodsImpl = async () => [];
  rotateWallpaperUrlImpl = async () => null;
  updateThemeImpl = async (patch) => ({
    ...createDefaultThemeSettings(),
    ...patch,
    moodColors: patch.moodColors
      ? {
          ...createDefaultThemeSettings().moodColors,
          ...patch.moodColors,
        }
      : createDefaultThemeSettings().moodColors,
  });
  upsertMoodImpl = async (date, mood) => ({
    date,
    level: mood.level,
    ...(mood.note ? { note: mood.note } : null),
  });
}

resetDoubles();

vi.mock('@/lib/auth', () => ({
  getAccessToken: async () => currentToken,
}));

vi.mock('@/lib/api', () => ({
  ApiError: MockApiError,
  deleteMood: async (date: string, token?: string) => {
    deleteMoodCalls.push([date, token]);
    await deleteMoodImpl(date, token);
  },
  getDefaultThemeSettings: createDefaultThemeSettings,
  getTheme: async (token?: string) => {
    getThemeCalls.push([token]);
    return getThemeImpl(token);
  },
  getWallpaperUrl: async (token?: string) => {
    getWallpaperUrlCalls.push([token]);
    return getWallpaperUrlImpl(token);
  },
  getYearMoods: async (year: number, token?: string) => {
    getYearMoodsCalls.push([year, token]);
    return getYearMoodsImpl(year, token);
  },
  rotateWallpaperUrl: async (token?: string) => {
    rotateWallpaperUrlCalls.push([token]);
    return rotateWallpaperUrlImpl(token);
  },
  updateTheme: async (patch: Partial<ThemeSettings>, token?: string) => {
    updateThemeCalls.push([patch, token]);
    return updateThemeImpl(patch, token);
  },
  upsertMood: async (date: string, mood: { level: MoodLevel; note?: string }, token?: string) => {
    upsertMoodCalls.push([date, mood, token]);
    return upsertMoodImpl(date, mood, token);
  },
}));

let cachedStore: (typeof import('../store'))['useAppStore'] | null = null;

async function getStore() {
  if (!cachedStore) {
    const module = await import('../store');
    cachedStore = module.useAppStore;
  }

  return cachedStore;
}

async function resetStoreState() {
  const store = await getStore();
  const snapshot: StoreSnapshot = {
    entries: {},
    theme: createDefaultThemeSettings(),
    wallpaperUrl: null,
    isHydrating: false,
    isSavingMood: false,
    isUpdatingTheme: false,
    isRotatingToken: false,
    hasHydrated: false,
    authRequired: false,
    lastError: null,
    selectedDateKey: null,
  };

  store.setState(snapshot);
  return store;
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

async function waitForCondition(predicate: () => boolean, attempts = 10) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 0);
    });
  }
}

describe('app store mood editing + persistence', () => {
  it('opens and closes the mood picker for a selected pixel', async () => {
    resetDoubles();
    const store = await resetStoreState();

    store.getState().openMoodPicker('2026-02-18');
    expect(store.getState().selectedDateKey).toBe('2026-02-18');

    store.getState().closeMoodPicker();
    expect(store.getState().selectedDateKey).toBe(null);
  });

  it('optimistically sets mood, trims notes, and keeps server-confirmed values', async () => {
    resetDoubles();
    const store = await resetStoreState();
    const sync = createDeferred<MoodRecord>();

    upsertMoodImpl = async () => sync.promise;

    const updatePromise = store.getState().setMood('2026-02-18', 4, '  strong day  ');

    expect(store.getState().entries['2026-02-18']).toEqual({ level: 4, note: 'strong day' });
    expect(store.getState().isSavingMood).toBe(true);
    await waitForCondition(() => upsertMoodCalls.length > 0);
    expect(upsertMoodCalls).toEqual([
      ['2026-02-18', { level: 4, note: 'strong day' }, 'token-123'],
    ]);

    sync.resolve({ date: '2026-02-18', level: 5, note: 'synced note' });
    await updatePromise;

    expect(store.getState().entries['2026-02-18']).toEqual({ level: 5, note: 'synced note' });
    expect(store.getState().isSavingMood).toBe(false);
    expect(store.getState().authRequired).toBe(false);
  });

  it('rolls back mood edits when persistence fails', async () => {
    resetDoubles();
    const store = await resetStoreState();

    store.setState({
      entries: {
        '2026-02-18': { level: 2, note: 'previous note' },
      },
    });

    upsertMoodImpl = async () => {
      throw new MockApiError('failed write', 500);
    };

    await store.getState().setMood('2026-02-18', 4, 'new value');

    expect(store.getState().entries['2026-02-18']).toEqual({ level: 2, note: 'previous note' });
    expect(store.getState().lastError).toBe('Request failed (500).');
    expect(store.getState().authRequired).toBe(false);
    expect(store.getState().isSavingMood).toBe(false);
  });

  it('restores optimistic mood edits when no session token is available', async () => {
    resetDoubles();
    currentToken = null;
    const store = await resetStoreState();

    await store.getState().setMood('2026-02-18', 3, 'no token');

    expect(store.getState().entries['2026-02-18']).toBe(undefined);
    expect(store.getState().authRequired).toBe(true);
    expect(store.getState().lastError).toBe(MISSING_TOKEN_MESSAGE);
    expect(upsertMoodCalls).toHaveLength(0);
  });

  it('optimistically clears mood and persists deletion', async () => {
    resetDoubles();
    const store = await resetStoreState();
    const sync = createDeferred<void>();

    store.setState({
      entries: {
        '2026-02-18': { level: 5, note: 'to remove' },
      },
    });

    deleteMoodImpl = async () => sync.promise;

    const clearPromise = store.getState().clearMood('2026-02-18');

    expect(store.getState().entries['2026-02-18']).toBe(undefined);
    expect(store.getState().isSavingMood).toBe(true);
    await waitForCondition(() => deleteMoodCalls.length > 0);
    expect(deleteMoodCalls).toEqual([['2026-02-18', 'token-123']]);

    sync.resolve();
    await clearPromise;

    expect(store.getState().entries['2026-02-18']).toBe(undefined);
    expect(store.getState().authRequired).toBe(false);
    expect(store.getState().isSavingMood).toBe(false);
  });

  it('restores cleared mood when delete persistence fails with auth error', async () => {
    resetDoubles();
    const store = await resetStoreState();

    store.setState({
      entries: {
        '2026-02-18': { level: 5, note: 'to restore' },
      },
    });

    deleteMoodImpl = async () => {
      throw new MockApiError('session expired', 401);
    };

    await store.getState().clearMood('2026-02-18');

    expect(store.getState().entries['2026-02-18']).toEqual({ level: 5, note: 'to restore' });
    expect(store.getState().authRequired).toBe(true);
    expect(store.getState().lastError).toBe('Session expired. Sign in again.');
    expect(store.getState().isSavingMood).toBe(false);
  });

  it('hydrates entries, theme, and wallpaper url from persistence APIs', async () => {
    resetDoubles();
    const store = await resetStoreState();

    getYearMoodsImpl = async () => [
      { date: '2026-01-02', level: 2 },
      { date: '2026-01-03', level: 4, note: 'steady' },
    ];
    getThemeImpl = async () => ({
      ...createDefaultThemeSettings(),
      shape: 'square',
      spacing: 'wide',
      moodColors: {
        1: '#111111',
        2: '#222222',
        3: '#333333',
        4: '#444444',
        5: '#555555',
      },
    });
    getWallpaperUrlImpl = async () => 'https://example.com/wallpaper.png';

    await store.getState().hydrate(2026);

    expect(getYearMoodsCalls).toEqual([[2026, 'token-123']]);
    expect(getThemeCalls).toEqual([['token-123']]);
    expect(getWallpaperUrlCalls).toEqual([['token-123']]);
    expect(store.getState().entries).toEqual({
      '2026-01-02': { level: 2, note: undefined },
      '2026-01-03': { level: 4, note: 'steady' },
    });
    expect(store.getState().theme.shape).toBe('square');
    expect(store.getState().theme.spacing).toBe('wide');
    expect(store.getState().wallpaperUrl).toBe('https://example.com/wallpaper.png');
    expect(store.getState().hasHydrated).toBe(true);
    expect(store.getState().isHydrating).toBe(false);
  });
});
