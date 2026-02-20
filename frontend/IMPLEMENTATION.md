# Year in Pixels App - Implementation Status

Last updated: February 18, 2026

## What is implemented

### 1) App initialization and routing
- Expo Router app scaffolded with `pnpm`.
- Root navigation and splash/font bootstrapping implemented.
- Tabs configured for:
  - `app/(tabs)/index.tsx` (Journal/Grid)
  - `app/(tabs)/stats.tsx` (Stats)
  - `app/(tabs)/settings.tsx` (Settings)
- Onboarding screen implemented at `app/onboarding.tsx`.

### 1.1) Onboarding flow (updated)
- Reworked into a real 3-step experience aligned to spec:
  1) year preview grid visual,
  2) mood selection demo,
  3) iOS Shortcuts setup guide.
- Added step transitions, progress indicators, and back/next controls.
- Added "Set Up Shortcut" action:
  - copies wallpaper URL,
  - attempts to open the Shortcuts app via deep link,
  - shows fallback guidance if the app cannot be opened.
- If token URL is missing on step 3, onboarding requests a refresh from `/token` via store sync.

### 1.2) First-launch onboarding gate
- Added launcher route `app/index.tsx` that decides initial navigation:
  - first launch -> `/onboarding`
  - returning user -> `/(tabs)`
- Added persisted onboarding flag in `lib/onboarding.ts` using AsyncStorage.
- Updated root layout initial route to `index` so gating runs on app startup.
- Onboarding now marks completion before exiting to tabs (skip/open journal/finish flows).
- Added Settings test action to reset onboarding and reopen the onboarding flow immediately.

### 2) Minimalist UI system
- Shared visual system in `lib/theme.ts`.
- Custom typography and warm minimalist palette.
- Reusable building blocks:
  - `components/pixel-grid.tsx`
  - `components/mood-picker.tsx`
  - `components/theme-editor.tsx`

### 3) Backend data wiring (Option 1)
Data flow is now wired to API routes for moods, theme, and token.

#### API client (`lib/api.ts`)
Implemented route methods:
- `GET /moods?year=YYYY` -> `getYearMoods`
- `PUT /moods/:date` -> `upsertMood`
- `DELETE /moods/:date` -> `deleteMood`
- `GET /theme` -> `getTheme`
- `PUT /theme` -> `updateTheme`
- `GET /token` -> `getWallpaperUrl`
- `POST /token/rotate` -> `rotateWallpaperUrl`

Also implemented:
- Normalization/parsing for different response shapes.
- Typed API errors via `ApiError`.
- Theme patch serialization to API payload shape (snake_case fields).

#### Auth token source (`lib/auth.ts`)
- Added `getAccessToken()`.
- Current token source is:
  - in-memory session (future Apple Sign-In handoff), or
  - `EXPO_PUBLIC_DEV_BEARER_TOKEN` for local development.

#### Store/state (`lib/store.ts`)
- Demo-seeded mood data removed.
- Zustand state now supports:
  - remote hydration via `/moods`, `/theme`, `/token`
  - optimistic mood save/delete with rollback on API failure
  - theme updates via `/theme`
  - token rotation via `/token/rotate`
  - hydration/saving/error/auth-required flags

#### UI integration
- `app/(tabs)/_layout.tsx`
  - Triggers first hydration when tabs mount.
- `app/(tabs)/index.tsx`
  - Uses backend-backed entries/theme state.
  - Shows sync/auth/error states.
  - Mood save/clear now persists through API.
- `app/(tabs)/stats.tsx`
  - Reads live entries and theme colors.
- `app/(tabs)/settings.tsx`
  - Displays wallpaper URL from `/token`.
  - Adds URL rotation (`/token/rotate`).
  - Adds simple persisted theme controls (`/theme`).
- `app/onboarding.tsx`
  - Uses the live wallpaper URL from store when available.
  - Integrates shortcut helper action with copy + deep-link flow.

## Environment variables

Set these in your Expo env for real backend sync:
- `EXPO_PUBLIC_API_BASE_URL` (default: `https://api.yearinpixels.app`)
- `EXPO_PUBLIC_DEV_BEARER_TOKEN` (temporary dev token until Apple Sign-In is wired)

## Validation
- `pnpm typecheck` passes.

## Current limitations
- Apple Sign-In flow is still a placeholder.
- Theme editor currently exposes a minimal subset (shape/spacing/reset) to validate `/theme` wiring.
- Wallpaper URL copy/QR setup is not implemented yet.
- Onboarding completion persistence uses AsyncStorage only (no server profile sync yet).
