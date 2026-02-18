# Year in Pixels — App Design Document

## Overview

A React Native app that turns your iPhone lock screen into a mood journal. Each day you log how you're feeling, and the pixel grid on your wallpaper fills in with a color representing that mood. Over the year, your lock screen becomes a visual map of your emotional life.

The current project generates a static "days elapsed" wallpaper. The app evolves this into something personal — each pixel is a **choice**, not just a counter.

---

## Core Experience

1. Open app, tap today's pixel
2. Pick a mood (1–5 scale, or custom labels)
3. Your lock screen wallpaper updates automatically via iOS Shortcuts
4. Over time, the grid fills with a mosaic of colors unique to you

That's it. One interaction per day. The wallpaper does the rest.

---

## Mood System

### Default 5-point scale

| Level | Label | Default Color |
|-------|-------|--------------|
| 1 | Awful | `#ef4444` (red) |
| 2 | Bad | `#f97316` (orange) |
| 3 | Okay | `#eab308` (yellow) |
| 4 | Good | `#22c55e` (green) |
| 5 | Great | `#3b82f6` (blue) |

Users can:
- Rename labels ("Awful" → "Rough day")
- Change colors for each level
- Add a 6th or 7th level if they want
- Leave a day blank (empty cell, no mood logged)

### Missed days

If you forget a day, the app prompts you to backfill (up to 7 days back). After that, missed days stay empty. No guilt mechanics.

---

## Wallpaper Generation

The server renders the wallpaper on-demand when iOS Shortcuts fetches the URL. Same `@napi-rs/canvas` approach as the current project, but now each cell's color comes from the user's mood data instead of a binary filled/unfilled.

### Rendering pipeline

```
iOS Shortcuts (midnight) → GET /w/<token> → Server looks up user by token
  → Fetches mood entries for current year
  → Fetches user's theme settings (colors, shape, spacing, position, bg image)
  → Renders PNG → Returns with Cache-Control: max-age=86400
```

### Background images

With a database, we can now support background images:
- User uploads a photo in the app
- Stored in S3 (or R2/Cloudflare)
- Server composites it behind the grid when rendering
- Empty cells become semi-transparent overlays so the photo shows through

---

## URL Security

This is the key challenge: the wallpaper URL must be fetchable by iOS Shortcuts (which can't send auth headers easily), but shouldn't be guessable by anyone else.

### Approach: Opaque user tokens

Each user gets a cryptographically random token (32 bytes, base64url-encoded = 43 characters). This token IS the URL.

```
https://api.yearinpixels.app/w/7Kj2mX9pL4qR8vN1wF5tY3hB6cD0eG_aS
```

**Why this works:**
- 256 bits of entropy — not guessable or brute-forceable
- No auth headers needed — the token in the URL is the credential
- iOS Shortcuts just needs a plain GET request
- Tokens are per-user, revocable, and rotatable

**Security properties:**
- Tokens are generated server-side with `crypto.randomBytes(32)`
- Stored hashed (SHA-256) in the database — if the DB leaks, tokens aren't exposed
- Users can rotate their token at any time (generates new URL, old one dies)
- Rate limiting on the `/w/` endpoint prevents enumeration
- HTTPS only (tokens in URLs are safe in transit, just don't log them server-side)

**Trade-offs:**
- Token in URL means it could leak via browser history, referer headers, or shared screenshots. This is acceptable because: (a) it's a wallpaper, not bank credentials, (b) the only "damage" is someone seeing your mood grid, (c) users can rotate tokens instantly
- No per-request signing or expiration. The token is long-lived. Simplicity wins here.

### Alternative considered: Signed URLs

```
/w/<user_id>?sig=<HMAC>&exp=<timestamp>
```

Rejected because:
- iOS Shortcuts stores a static URL — it can't refresh an expiring signature
- Adds complexity with no real security gain over opaque tokens
- The user would need to update their Shortcut every time the URL expires

### Alternative considered: API key as query param

```
/w/wallpaper.png?key=<api_key>
```

Functionally identical to the token-in-path approach but messier. Query params are more likely to be logged by proxies/CDNs. Path-based tokens are cleaner.

---

## Tech Stack

### App (React Native)

```
year-in-pixels-app/
├── app/                    # Expo Router screens
│   ├── (tabs)/
│   │   ├── index.tsx       # Grid view — tap to log mood
│   │   ├── stats.tsx       # Mood trends, streaks, heatmap
│   │   └── settings.tsx    # Theme, account, export
│   ├── onboarding.tsx      # First launch flow
│   └── _layout.tsx
├── components/
│   ├── PixelGrid.tsx       # Interactive grid (tap a day)
│   ├── MoodPicker.tsx      # Bottom sheet mood selector
│   └── ThemeEditor.tsx     # Color/shape/layout customization
├── lib/
│   ├── api.ts              # API client
│   ├── store.ts            # Zustand state
│   └── auth.ts             # Sign in with Apple
└── package.json
```

- **Expo** (managed workflow) — simplest path to App Store
- **Expo Router** — file-based routing
- **Zustand** — lightweight state (mood entries, theme config)
- **Sign in with Apple** — only auth method needed (iOS-only app)
- No local database — all data lives on the server, cached locally

### Backend (API server)

Extend the existing Bun + Hono server or deploy separately:

```
src/
├── index.ts                # Routes
├── auth.ts                 # Apple Sign In verification
├── wallpaper.ts            # Rendering endpoint (/w/<token>)
├── moods.ts                # CRUD for mood entries
├── themes.ts               # User theme settings
├── uploads.ts              # Background image upload/storage
├── db.ts                   # Database client
└── canvas.ts               # Rendering (existing, extended)
```

### Database (Postgres or SQLite/Turso)

```sql
users
  id            uuid primary key
  apple_sub     text unique not null    -- Apple Sign In subject
  token_hash    text not null           -- SHA-256 of wallpaper token
  created_at    timestamptz

moods
  id            uuid primary key
  user_id       uuid references users
  date          date not null           -- 2026-02-18
  level         int not null            -- 1-5
  note          text                    -- optional short note
  unique(user_id, date)

themes
  user_id       uuid primary key references users
  bg_color      text default '0d1117'
  mood_colors   jsonb                   -- {"1":"ef4444","2":"f97316",...}
  empty_color   text                    -- null = auto-derive from bg
  shape         text default 'rounded'
  spacing       text default 'medium'
  position      text default 'clock'
  bg_image_url  text                    -- S3 URL or null

tokens
  id            uuid primary key
  user_id       uuid references users
  token_hash    text unique not null
  created_at    timestamptz
  revoked_at    timestamptz             -- null = active
```

### Image Storage

- **Cloudflare R2** or **AWS S3** for background images
- Images are resized server-side to max 1290x2796 on upload (no point storing larger)
- Serve via CDN with private bucket + signed read URLs (separate from wallpaper tokens)

---

## API Routes

```
POST   /auth/apple          — Exchange Apple ID token for session
DELETE /auth/session         — Sign out

GET    /moods?year=2026     — Get all moods for a year
PUT    /moods/:date         — Set mood for a date { level, note? }
DELETE /moods/:date         — Remove mood entry

GET    /theme               — Get user's theme settings
PUT    /theme               — Update theme settings
POST   /theme/background    — Upload background image (multipart)
DELETE /theme/background    — Remove background image

GET    /token               — Get current wallpaper URL
POST   /token/rotate        — Generate new token, revoke old one

GET    /w/<token>           — Render and return wallpaper PNG (public, no auth)
```

All routes except `/w/<token>` require authentication (Bearer token from Apple Sign In flow).

---

## App Screens

### 1. Grid View (main tab)

The year grid, just like the wallpaper but interactive. Tap a day to log or change its mood. Today pulses gently. Past days show their mood colors. Future days are dimmed.

Bottom sheet slides up with the mood picker: five colored circles in a row, tap one. Optional: add a one-line note. Done.

### 2. Stats tab

- Current streak (days logged in a row)
- Mood distribution (pie/bar chart)
- Monthly averages
- Best/worst months
- Simple, not overwhelming

### 3. Settings tab

- **Theme editor** — same controls as `/create` page (bg color, pixel colors per mood level, shape, spacing, position, background image upload)
- **Wallpaper URL** — show the URL, copy button, QR code for easy Shortcut setup
- **Rotate URL** — regenerate token if compromised
- **Export data** — JSON or CSV download
- **Account** — sign out, delete account

### 4. Onboarding

Three screens max:
1. "Your year, one pixel at a time" — visual of the grid filling in
2. "How are you today?" — demo the mood picker
3. "Set up your lock screen" — guide to iOS Shortcuts automation

---

## iOS Shortcuts Integration

The app should include a "Set Up Shortcut" button that:
1. Copies the wallpaper URL
2. Opens Shortcuts app with deep link
3. Shows step-by-step instructions

Or, if possible, use the Shortcuts URL scheme to pre-build the automation. The steps are:
1. URL → `https://api.yearinpixels.app/w/<token>`
2. Get Contents of URL
3. Set Wallpaper Photo (Lock Screen)
4. Trigger: Time of Day, 12:00 AM, Daily

---

## Notifications

One daily reminder (configurable time, default 9 PM):
> "How was your day?"

Tapping opens the app with today's mood picker ready. If the user already logged today, no notification. Respect the user's time.

---

## Privacy

- Mood data is personal. Encrypt at rest in the database.
- No analytics beyond basic crash reporting.
- No social features. This is a private journal.
- "Delete account" actually deletes everything (GDPR-style).
- Background images stored in private buckets, not publicly accessible.
- Wallpaper URLs contain no user-identifiable information.

---

## Monetization (optional, future)

- Free tier: basic colors, no background image, default mood scale
- Pro ($2.99/year or $0.99 one-time): custom colors, background images, custom mood labels, data export
- No ads. Ever.

---

## Development Phases

### Phase 1 — MVP
- Sign in with Apple
- Mood logging (5-point scale, default colors)
- Wallpaper generation with mood colors
- Token-based URL security
- Basic theme customization (bg color, pixel shape)
- iOS Shortcuts setup guide

### Phase 2 — Polish
- Custom mood labels and colors
- Background image upload
- Stats tab
- Daily notification
- Onboarding flow

### Phase 3 — Nice to haves
- Widgets (iOS home screen widget showing today's mood or mini grid)
- Apple Watch complication
- Export/share year grid as image
- "Year in Review" summary at year end
