import AsyncStorage from '@react-native-async-storage/async-storage';

export type ColorSchemePreference = 'system' | 'light' | 'dark';

const COLOR_SCHEME_KEY = 'year-in-pixels.color-scheme';

let preference: ColorSchemePreference = 'system';
let hasLoadedPreference = false;
let loadPromise: Promise<void> | null = null;
const subscribers = new Set<(nextPreference: ColorSchemePreference) => void>();

function notifySubscribers() {
  for (const subscriber of subscribers) {
    subscriber(preference);
  }
}

function isPreference(value: string | null): value is ColorSchemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export function getColorSchemePreference(): ColorSchemePreference {
  return preference;
}

export function isColorSchemePreferenceLoaded(): boolean {
  return hasLoadedPreference;
}

export function subscribeColorSchemePreference(
  subscriber: (nextPreference: ColorSchemePreference) => void,
): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

export async function ensureColorSchemePreferenceLoaded(): Promise<void> {
  if (hasLoadedPreference) {
    return;
  }

  if (loadPromise) {
    await loadPromise;
    return;
  }

  loadPromise = (async () => {
    try {
      const raw = await AsyncStorage.getItem(COLOR_SCHEME_KEY);
      if (isPreference(raw)) {
        preference = raw;
      }
    } catch {
      // Ignore persistence errors and continue with in-memory defaults.
    } finally {
      hasLoadedPreference = true;
      loadPromise = null;
      notifySubscribers();
    }
  })();

  await loadPromise;
}

export async function setColorSchemePreference(nextPreference: ColorSchemePreference): Promise<void> {
  preference = nextPreference;
  notifySubscribers();

  try {
    await AsyncStorage.setItem(COLOR_SCHEME_KEY, nextPreference);
  } catch {
    // Ignore persistence errors and keep current in-memory preference.
  }
}
