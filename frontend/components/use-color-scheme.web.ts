import { useCallback, useEffect, useState } from 'react';

import {
  ensureColorSchemePreferenceLoaded,
  getColorSchemePreference,
  isColorSchemePreferenceLoaded,
  setColorSchemePreference as persistColorSchemePreference,
  subscribeColorSchemePreference,
  type ColorSchemePreference,
} from '@/lib/colorSchemePreference';

function getPreferredScheme(): 'light' | 'dark' {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveColorScheme(
  systemColorScheme: 'light' | 'dark',
  preference: ColorSchemePreference,
): 'light' | 'dark' {
  if (preference === 'light' || preference === 'dark') {
    return preference;
  }
  return systemColorScheme;
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

export function useColorScheme(): 'light' | 'dark' {
  const { preference } = useColorSchemePreference();
  const [systemScheme, setSystemScheme] = useState<'light' | 'dark'>(getPreferredScheme);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = (event: MediaQueryListEvent) => {
      setSystemScheme(event.matches ? 'dark' : 'light');
    };

    mediaQuery.addEventListener('change', handleChange);
    setSystemScheme(mediaQuery.matches ? 'dark' : 'light');

    return () => {
      mediaQuery.removeEventListener('change', handleChange);
    };
  }, []);

  return resolveColorScheme(systemScheme, preference);
}
