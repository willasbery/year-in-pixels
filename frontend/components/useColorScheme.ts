import { useCallback, useEffect, useState } from 'react';
import { useColorScheme as useNativeColorScheme } from 'react-native';

import {
  ensureColorSchemePreferenceLoaded,
  getColorSchemePreference,
  isColorSchemePreferenceLoaded,
  setColorSchemePreference as persistColorSchemePreference,
  subscribeColorSchemePreference,
  type ColorSchemePreference,
} from '@/lib/colorSchemePreference';

type AppColorScheme = 'light' | 'dark';

function resolveColorScheme(
  systemColorScheme: AppColorScheme | null | undefined,
  preference: ColorSchemePreference,
): AppColorScheme {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemColorScheme === 'dark' ? 'dark' : 'light';
}

export function useColorSchemePreference(): {
  preference: ColorSchemePreference;
  setPreference: (preference: ColorSchemePreference) => Promise<void>;
  isLoaded: boolean;
} {
  const [preference, setPreferenceState] = useState<ColorSchemePreference>(() => getColorSchemePreference());
  const [isLoaded, setIsLoaded] = useState<boolean>(() => isColorSchemePreferenceLoaded());

  useEffect(() => {
    const unsubscribe = subscribeColorSchemePreference((nextPreference) => {
      setPreferenceState(nextPreference);
      setIsLoaded(isColorSchemePreferenceLoaded());
    });

    void ensureColorSchemePreferenceLoaded().then(() => {
      setIsLoaded(true);
      setPreferenceState(getColorSchemePreference());
    });

    return unsubscribe;
  }, []);

  const setPreference = useCallback(
    async (nextPreference: ColorSchemePreference) => {
      await persistColorSchemePreference(nextPreference);
    },
    [],
  );

  return { preference, setPreference, isLoaded };
}

export function useColorScheme(): AppColorScheme {
  const systemColorScheme = useNativeColorScheme();
  const { preference } = useColorSchemePreference();
  return resolveColorScheme(systemColorScheme, preference);
}
