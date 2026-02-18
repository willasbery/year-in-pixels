import { DefaultTheme, type Theme } from '@react-navigation/native';

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
  bgImageUrl: string | null;
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

export const palette = {
  canvas: '#f6f0e4',
  paper: '#fffaf0',
  surface: 'rgba(255, 251, 244, 0.76)',
  glass: 'rgba(255, 250, 240, 0.66)',
  emptyPixel: 'rgba(113, 97, 79, 0.14)',
  futurePixel: 'rgba(113, 97, 79, 0.07)',
  softStroke: 'rgba(64, 51, 36, 0.12)',
  mutedText: '#6f6252',
  ink: '#1f1a14',
};

export const gradients = {
  app: ['#f8f3ea', '#f2ebdf', '#ece4d6'] as const,
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

export const navigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.ink,
    background: 'transparent',
    card: 'transparent',
    text: palette.ink,
    border: 'transparent',
  },
};
