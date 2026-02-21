import { DarkTheme, DefaultTheme, type Theme } from "@react-navigation/native";

import { useColorScheme } from "@/components/use-color-scheme";

export type MoodLevel = 1 | 2 | 3 | 4 | 5;
export type ThemeShape = "rounded" | "square" | "rough";
export type ThemeSpacing = "tight" | "medium" | "wide";
export type ThemePosition = "clock" | "center";

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

export type AppColorMode = "light" | "dark";

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

export const moodScale: {[]
  level: MoodLevel;
  label: string;
  color: string;
}> = [
  { level: 1, label: "Awful", color: "#ef4444" },
  { level: 2, label: "Bad", color: "#f97316" },
  { level: 3, label: "Okay", color: "#eab308" },
  { level: 4, label: "Good", color: "#22c55e" },
  { level: 5, label: "Great", color: "#3b82f6" },
];

export const moodColorByLevel: Record<MoodLevel, string> = {
  1: "#ef4444",
  2: "#f97316",
  3: "#eab308",
  4: "#22c55e",
  5: "#3b82f6",
};

const lightPalette: AppPalette = {
  canvas: "#f6f0e4",
  paper: "#fffaf0",
  surface: "rgba(255, 251, 244, 0.76)",
  glass: "rgba(255, 250, 240, 0.66)",
  emptyPixel: "rgba(113, 97, 79, 0.14)",
  futurePixel: "rgba(113, 97, 79, 0.10)",
  softStroke: "rgba(64, 51, 36, 0.12)",
  mutedText: "#6f6252",
  ink: "#1f1a14",
};

const darkPalette: AppPalette = {
  canvas: "#111113",
  paper: "#18191b",
  surface: "#212225",
  glass: "#272a2d",
  emptyPixel: "rgba(176, 180, 186, 0.24)",
  futurePixel: "rgba(176, 180, 186, 0.14)",
  softStroke: "#363a3f",
  mutedText: "#b0b4ba",
  ink: "#edeef0",
};

const lightGradients: AppGradients = {
  app: ["#f8f3ea", "#f2ebdf", "#ece4d6"] as const,
};

const darkGradients: AppGradients = {
  app: ["#111113", "#16181b", "#1b1e22"] as const,
};

const lightAppTheme: AppTheme = {
  mode: "light",
  palette: lightPalette,
  gradients: lightGradients,
};

const darkAppTheme: AppTheme = {
  mode: "dark",
  palette: darkPalette,
  gradients: darkGradients,
};

const lightNavigationTheme: Theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: lightPalette.ink,
    background: "transparent",
    card: "transparent",
    text: lightPalette.ink,
    border: "transparent",
  },
};

const darkNavigationTheme: Theme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    primary: darkPalette.ink,
    background: "transparent",
    card: "transparent",
    text: darkPalette.ink,
    border: "transparent",
  },
};

export const fonts = {
  display: "PlayfairDisplay_600SemiBold",
  body: "Manrope_400Regular",
  bodyMedium: "Manrope_600SemiBold",
  bodyBold: "Manrope_700Bold",
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

export function buildRoughRectPath(
  width: number,
  height: number,
  seed: number,
  roughness: number = 0.5,
  cornerRadius: number = 0,
): string {
  const rand = (n: number, range: number): number => {
    let s = (Math.imul(seed, (n * 2654435761) | 0) ^ (seed >>> 16)) | 0;
    s ^= s >>> 16;
    s = Math.imul(s, 0x45d9f3b);
    s ^= s >>> 16;
    return ((s >>> 0) / 0x100000000 - 0.5) * 2 * range;
  };

  const N = 12; // Number of points per side for roughness
  const points: [number, number][] = [];

  const addRoughLine = (
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    pointSeed: number,
  ) => {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.sqrt(dx * dx + dy * dy);
    const numSegments = Math.max(2, Math.ceil(length / (N / 2))); // Adjust segments based on length

    for (let i = 0; i <= numSegments; i++) {
      const t = i / numSegments;
      const x = x1 + dx * t + rand(pointSeed + i * 2, roughness);
      const y = y1 + dy * t + rand(pointSeed + i * 2 + 1, roughness);
      points.push([x, y]);
    }
  };

  // Generate points for the four sides with optional corner rounding
  if (cornerRadius === 0) {
    addRoughLine(0, 0, width, 0, 1); // Top
    addRoughLine(width, 0, width, height, 2); // Right
    addRoughLine(width, height, 0, height, 3); // Bottom
    addRoughLine(0, height, 0, 0, 4); // Left
  } else {
    // Top-left corner
    const numCornerSegments = Math.max(2, Math.ceil(cornerRadius / (N / 2)));
    for (let i = 0; i <= numCornerSegments; i++) {
      const t = i / numCornerSegments;
      const angle = Math.PI - (t * Math.PI) / 2; // From 180 to 90 degrees
      const x =
        cornerRadius -
        Math.cos(angle) * cornerRadius +
        rand(seed + i * 2, roughness);
      const y =
        cornerRadius -
        Math.sin(angle) * cornerRadius +
        rand(seed + i * 2 + 1, roughness);
      points.push([x, y]);
    }

    addRoughLine(cornerRadius, 0, width - cornerRadius, 0, 1); // Top

    // Top-right corner
    for (let i = 0; i <= numCornerSegments; i++) {
      const t = i / numCornerSegments;
      const angle = Math.PI / 2 - (t * Math.PI) / 2; // From 90 to 0 degrees
      const x =
        width -
        cornerRadius +
        Math.cos(angle) * cornerRadius +
        rand(seed + i * 2, roughness);
      const y =
        cornerRadius -
        Math.sin(angle) * cornerRadius +
        rand(seed + i * 2 + 1, roughness);
      points.push([x, y]);
    }

    addRoughLine(width, cornerRadius, width, height - cornerRadius, 2); // Right

    // Bottom-right corner
    for (let i = 0; i <= numCornerSegments; i++) {
      const t = i / numCornerSegments;
      const angle = 0 - (t * Math.PI) / 2; // From 0 to -90 degrees
      const x =
        width -
        cornerRadius +
        Math.cos(angle) * cornerRadius +
        rand(seed + i * 2, roughness);
      const y =
        height -
        cornerRadius -
        Math.sin(angle) * cornerRadius +
        rand(seed + i * 2 + 1, roughness);
      points.push([x, y]);
    }

    addRoughLine(width - cornerRadius, height, cornerRadius, height, 3); // Bottom

    // Bottom-left corner
    for (let i = 0; i <= numCornerSegments; i++) {
      const t = i / numCornerSegments;
      const angle = -Math.PI / 2 - (t * Math.PI) / 2; // From -90 to -180 degrees
      const x =
        cornerRadius +
        Math.cos(angle) * cornerRadius +
        rand(seed + i * 2, roughness);
      const y =
        height -
        cornerRadius -
        Math.sin(angle) * cornerRadius +
        rand(seed + i * 2 + 1, roughness);
      points.push([x, y]);
    }

    addRoughLine(0, height - cornerRadius, 0, cornerRadius, 4); // Left
  }

  // Connect via Catmull-Rom for a smooth closed loop.
  const p = (i: number) =>
    points[((i % points.length) + points.length) % points.length];
  const f = (n: number) => n.toFixed(2);

  let d = `M ${f(points[0][0])},${f(points[0][1])}`;
  for (let i = 0; i < points.length; i++) {
    const [p0, p1, p2, p3] = [p(i - 1), p(i), p(i + 1), p(i + 2)];
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
    d += ` C ${f(c1[0])},${f(c1[1])} ${f(c2[0])},${f(c2[1])} ${f(p2[0])},${f(p2[1])}`;
  }
  return d + " Z";
}

export function resolveColorMode(
  colorScheme: "light" | "dark" | null | undefined,
): AppColorMode {
  return colorScheme === "dark" ? "dark" : "light";
}

export function getAppTheme(mode: AppColorMode): AppTheme {
  return mode === "dark" ? darkAppTheme : lightAppTheme;
}

export function getNavigationTheme(mode: AppColorMode): Theme {
  return mode === "dark" ? darkNavigationTheme : lightNavigationTheme;
}

export function getStatusBarStyle(mode: AppColorMode): "light" | "dark" {
  return mode === "dark" ? "light" : "dark";
}

export function useAppTheme(): AppTheme {
  const colorScheme = useColorScheme();
  return getAppTheme(resolveColorMode(colorScheme));
}

// Kept for compatibility while consumers migrate to useAppTheme().
export const palette = lightPalette;
export const gradients = lightGradients;
