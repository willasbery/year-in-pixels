import type { OnboardingStep } from "./types";

/** Set to true to show the lock screen shortcut step. Disabled for now. */
export const SHORTCUT_STEP_ENABLED = false;

const SHORTCUT_STEP: OnboardingStep = {
  key: "shortcut",
  eyebrow: "Step 5",
  title: "Optional: lock screen automation",
  body:
    "Use iOS Shortcuts to auto-refresh your lock screen wallpaper every day. You can set this up now or later.",
};

export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: "intro",
    eyebrow: "Step 1",
    title: "Your year, one pixel at a time",
    body: "Every day becomes one color. Over time, your mood map tells the story of your year.",
  },
  {
    key: "login",
    eyebrow: "Step 2",
    title: "Sign in once, stay in sync",
    body: "Apple sign-in keeps your journal private.",
  },
  {
    key: "mood",
    eyebrow: "Step 3",
    title: "Log moods in seconds",
    body: "Tap 1 to 5 and optionally add a short note. Fast enough to do daily.",
  },
  {
    key: "reminder",
    eyebrow: "Step 4",
    title: "Reminders (optional)",
    body: "Pick a daily time or choose no reminders. You can change this later in Settings.",
  },
  ...(SHORTCUT_STEP_ENABLED ? [SHORTCUT_STEP] : []),
];
