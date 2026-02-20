import { DarkTheme, DefaultTheme, type Theme } from '@react-navigation/native';

import { useColorScheme } from '@/components/useColorScheme';

export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export type ThemeShape = 'rounded' | 'square';
export type ThemeSpacing = 'tight' | 'medium' | 'wide';
export type ThemePosition = 'clock' | 'center';

export type ThemeSettings = {
  bgColor: string;
  moodColors: Record<MoodLevel, string>;
  emptyColor: string | null;
  shape: ThemeShape;
  spacing: ThemeSpacing;
  position: ThemePosition;
  avoidLockScreenUi: boolean;
  columns: number;
  bgImageUrl: string | null;
};

export type AppColorMode = 'light' | 'dark';

export type AppPalette = {
  canvas: string;
  paper: string;
  surface: string;
  glass: string;
  emptyPixel: string;
  futurePixel: string;
  softStroke: string;
  mutedText: string;
  ink: string;
};

export type AppGradients = {
  app: readonly [string, string, string];
};

export type AppTheme = {
  mode: AppColorMode;
  palette: AppPalette;
  gradients: AppGradients;
};

export const moodScale: Array<{ level: MoodLevel; label: string; color: string }> = [
  { level: 1, label: 'Awful', color: '#ef4444' },
  { level: 2, label: 'Bad', color: '#f97316' },
  { level: 3, label: 'Okay', color: '#eab308' },
  { level: 4, label: 'Good', color: '#22c55e' },
  { level: 5, label: 'Great', color: '#3b82f6' },
];

export const moodColorByLevel: Record<MoodLevel, string> = {
  1: '#ef4444',
  2: '#f97316',
  3: '#eab308',
  4: '#22c55e',
  5: '#3b82f6',
};

const lightPalette: AppPalette = {
  canvas: '#f6f0e4',
  paper: '#fffaf0',
  surface: 'rgba(255, 251, 244, 0.76)',
  glass: 'rgba(255, 250, 240, 0.66)',
  emptyPixel: 'rgba(113, 97, 79, 0.14)',
  futurePixel: 'rgba(113, 97, 79, 0.10)',
  softStroke: 'rgba(64, 51, 36, 0.12)',
  mutedText: '#6f6252',
  ink: '#1f1a14',
};

const darkPalette: AppPalette = {
  canvas: '#111113',
  paper: '#18191b',
  surface: '#212225',
  glass: '#272a2d',
  emptyPixel: 'rgba(176, 180, 186, 0.24)',
  futurePixel: 'rgba(176, 180, 186, 0.14)',
  softStroke: '#363a3f',
  mutedText: '#b0b4ba',
  ink: '#edeef0',
};

const lightGradients: AppGradients = {
  app: ['#f8f3ea', '#f2ebdf', '#ece4d6'] as const,
};

const darkGradients: AppGradients = {
  app: ['#111113', '#16181b', '#1b1e22'] as const,
};

const lightAppTheme: AppTheme = {
  mode: 'light',
  palette: lightPalette,
  gradients: lightGradients,
};

const darkAppTheme: AppTheme = {
  mode: 'dark',
  palette: darkPalette,
  gradients: darkGradients,
};

const lightNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightPalette.ink,
    background: 'transparent',
    card: 'transparent',
    text: lightPalette.ink,
    border: 'transparent',
  },
};

const darkNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: darkPalette.ink,
    background: 'transparent',
    card: 'transparent',
    text: darkPalette.ink,
    border: 'transparent',
  },
};

export const fonts = {
  display: 'PlayfairDisplay_600SemiBold',
  body: 'Manrope_400Regular',
  bodyMedium: 'Manrope_600SemiBold',
  bodyBold: 'Manrope_700Bold',
} as const;

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
} as const;

export const radii = {
  xs: 4,
  sm: 10,
  card: 20,
  pill: 999,
} as const;

export function resolveColorMode(colorScheme: 'light' | 'dark' | null | undefined): AppColorMode {
  return colorScheme === 'dark' ? 'dark' : 'light';
}

export function getAppTheme(mode: AppColorMode): AppTheme {
  return mode === 'dark' ? darkAppTheme : lightAppTheme;
}

export function getNavigationTheme(mode: AppColorMode): Theme {
  return mode === 'dark' ? darkNavigationTheme : lightNavigationTheme;
}

export function getStatusBarStyle(mode: AppColorMode): 'light' | 'dark' {
  return mode === 'dark' ? 'light' : 'dark';
}

export function useAppTheme(): AppTheme {
  const colorScheme = useColorScheme();
  return getAppTheme(resolveColorMode(colorScheme));
}

// Kept for compatibility while consumers migrate to useAppTheme().
export const palette = lightPalette;
export const gradients = lightGradients;
