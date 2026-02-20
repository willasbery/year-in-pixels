export type AuthState = "checking" | "signed_out" | "signed_in";

export type OnboardingStepKey =
  | "intro"
  | "login"
  | "mood"
  | "reminder"
  | "shortcut";

export type OnboardingStep = {
  key: OnboardingStepKey;
  eyebrow: string;
  title: string;
  body: string;
};
