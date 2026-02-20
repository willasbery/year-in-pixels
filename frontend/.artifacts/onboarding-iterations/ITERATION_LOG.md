# Onboarding Footer Iterations

## 2026-02-20 21:04:38 GMT - Iteration 001
- Baseline screenshot: `.artifacts/onboarding-iterations/iteration-001-baseline.png`
- Updated screenshot: `.artifacts/onboarding-iterations/iteration-001-updated.png`
- Changes:
  - Reintroduced bottom navigation buttons (`Back` and `Continue`) while keeping swipe gestures.
  - Kept first-time onboarding hint: `Swipe left to continue`.
  - Updated persistent hint text after first swipe to: `Swipe left/right or use buttons`.
  - Refined progress dots to be cleaner and more legible (subtle completed state, tighter active pill).
  - Added a restrained footer container treatment (top border + surface background) for clearer affordance.

## 2026-02-20 21:04:38 GMT - Iteration 002 (iPhone)
- iPhone capture (default): `.artifacts/onboarding-iterations/iteration-002-iphone15.png`
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-002-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-002-iphone15-dark.png`
- Changes:
  - Switched screenshot workflow to mobile-first (`iphone15` preset by default).
  - Increased progress indicator contrast with a subtle rail background for better visibility.
  - Reduced footer heaviness by constraining button row width and softening back button treatment.
  - Kept swipe guidance and button affordance combined so both interaction styles remain clear.

## 2026-02-20 21:09:43 GMT - Iteration 003 (Buttons Removed, Styled Dots)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-003-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-003-iphone15-dark.png`
- Changes:
  - Removed footer buttons and kept swipe-only navigation.
  - Restored styled progress dots (not plain): subtle rail, stronger completed state, highlighted active dot.
  - Kept onboarding hint text focused on swipe continuation.

## 2026-02-20 21:18:47 GMT - Iteration 004 (Chevron + Haptics)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-004-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-004-iphone15-dark.png`
- Changes:
  - Added animated hint chevron beside first-step swipe guidance.
  - Added iOS light haptic feedback on successful swipe step transition.
  - Added reusable screenshot command approval (`node scripts/capture-onboarding-step1.mjs`) and updated capture script to accept `device` and `theme` args.

## 2026-02-20 21:34:38 GMT - Iteration 005 (Reviewer Cleanup)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-005-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-005-iphone15-dark.png`
- Changes:
  - Removed animated chevron hint treatment.
  - Kept iOS swipe haptics on successful step transitions.
  - Added subtle footer anchoring (`surface` background + hairline top border).
  - Rethemed progress rail and dots using palette tokens for cleaner light/dark contrast.
  - Simplified hint copy to `Swipe to navigate` after first interaction.

## 2026-02-20 21:43:06 GMT - Iteration 006 (Larger Floating Dock + Animated Dots)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-006-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-006-iphone15-dark.png`
- Changes:
  - Replaced numeric step label with copy-first hint text.
  - Increased floating dock size and internal padding for better legibility.
  - Enlarged progress dots and active pill for stronger visual hierarchy.
  - Added spring-based animated dot-shape transitions so active state changes no longer snap.

## 2026-02-20 21:46:17 GMT - Iteration 007 (Softer Copy + Reviewer Pass)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-007-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-007-iphone15-dark.png`
- Changes:
  - Softened non-technical hint language: `Swipe to keep going`.
  - Added state-aware hint copy:
    - Intro: `Swipe left to continue`
    - Blocked sign-in state: `Sign in to keep going`
    - Final step: `Swipe left to finish`
  - Reviewer pass completed; key recommendations recorded and partially adopted (copy-state accuracy).

## 2026-02-20 21:47:25 GMT - Iteration 008 (Smoother Dot Morph)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-008-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-008-iphone15-dark.png`
- Changes:
  - Switched dot-shape animation from width interpolation to `scaleX` transform.
  - Moved dot animation to native driver (`useNativeDriver: true`) for smoother transitions under load.
  - Kept softened guidance copy and larger floating dock sizing from iteration 007.

## 2026-02-20 21:51:00 GMT - Iteration 009 (Fix Stretched Dots on Native)
- iPhone light mode: `.artifacts/onboarding-iterations/iteration-009-iphone15-light.png`
- iPhone dark mode: `.artifacts/onboarding-iterations/iteration-009-iphone15-dark.png`
- Changes:
  - Removed transform-based dot morph (`scaleX`), which was stretching tiny dots on native.
  - Replaced with `LayoutAnimation`-driven width/state transitions for cleaner shape changes.
  - Eliminated native animated module width error (`Style property 'width' is not supported by native animated module`).

## 2026-02-20 22:02:22 GMT - Iteration 010 (Step 2 Declutter Pass)
- iPhone light mode (Step 2): `.artifacts/onboarding-iterations/iteration-010-iphone15-light-step2.png`
- iPhone dark mode (Step 2): `.artifacts/onboarding-iterations/iteration-010-iphone15-dark-step2.png`
- Changes:
  - Reduced Step 2 headline/body copy to be shorter and less repetitive.
  - Refactored `LoginStepCard` to remove duplicated title/body inside the card.
  - Shifted card emphasis to a primary sign-in action with minimal supporting text.
  - Updated screenshot capture flow to support step-based capture via gesture stepping.

## 2026-02-20 22:02:22 GMT - Iteration 011 (Further Text Reduction)
- iPhone light mode (Step 2): `.artifacts/onboarding-iterations/iteration-011-iphone15-light-step2.png`
- iPhone dark mode (Step 2): `.artifacts/onboarding-iterations/iteration-011-iphone15-dark-step2.png`
- Changes:
  - Removed extra `One-time Apple sign-in` label from the card.
  - Kept only action/fallback + a short support line.

## 2026-02-20 22:02:22 GMT - Iteration 012 (Reviewer-Informed Cleanup)
- iPhone light mode (Step 2): `.artifacts/onboarding-iterations/iteration-012-iphone15-light-step2.png`
- iPhone dark mode (Step 2): `.artifacts/onboarding-iterations/iteration-012-iphone15-dark-step2.png`
- Changes:
  - Applied reviewer feedback to remove repeated helper text in unavailable-sign-in fallback state.
  - Simplified fallback note copy to `Sign in is available on iPhone.`
  - Preserved cleaner single-card structure with lower text density.

## 2026-02-20 22:07:06 GMT - Iteration 013 (Remove Sign-In Outer Box)
- iPhone light mode (Step 2): `.artifacts/onboarding-iterations/iteration-013-iphone15-light-step2.png`
- iPhone dark mode (Step 2): `.artifacts/onboarding-iterations/iteration-013-iphone15-dark-step2.png`
- Changes:
  - Removed outer card chrome around unsigned Step 2 sign-in area.
  - Kept only the core action/fallback element for a cleaner, less cluttered layout.
  - Preserved signed-in status card styling for confirmation state.

## 2026-02-20 22:23:10 GMT - Iteration 014 (Step 4 Opt-Out Toggle)
- iPhone light mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-014-iphone15-light-step4-default.png`
- iPhone dark mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-014-iphone15-dark-step4-default.png`
- iPhone light mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-014-iphone15-light-step4-off.png`
- iPhone dark mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-014-iphone15-dark-step4-off.png`
- Changes:
  - Replaced single opt-out button with an explicit two-option control (`Daily reminder` / `No reminders`).
  - Added dedicated opt-out state card for clearer confirmation.
  - Added capture-script interaction support to click `No reminders` before screenshot.

## 2026-02-20 22:23:10 GMT - Iteration 015 (Reviewer-Guided Optionality)
- iPhone light mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-015-iphone15-light-step4-default.png`
- iPhone dark mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-015-iphone15-dark-step4-default.png`
- iPhone light mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-015-iphone15-light-step4-off.png`
- iPhone dark mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-015-iphone15-dark-step4-off.png`
- Changes:
  - Updated Step 4 heading/body to explicitly frame reminders as optional.
  - Added symmetric selected-state styling with checkmarks for both options.
  - Required an explicit reminder choice before advancing from Step 4.
  - Removed immediate duplicate opt-out status text on toggle.

## 2026-02-20 22:23:10 GMT - Iteration 016 (No Preselected Choice)
- iPhone light mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-016-iphone15-light-step4-default.png`
- iPhone dark mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-016-iphone15-dark-step4-default.png`
- iPhone light mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-016-iphone15-light-step4-off.png`
- iPhone dark mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-016-iphone15-dark-step4-off.png`
- Changes:
  - Aligned visuals with logic by showing no preselected option until user taps one.
  - Preserved explicit-selection requirement before advancing.

## 2026-02-20 22:25:41 GMT - Iteration 017 (Remove Selection Tick)
- iPhone light mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-017-iphone15-light-step4-default.png`
- iPhone dark mode (Step 4, default): `.artifacts/onboarding-iterations/iteration-017-iphone15-dark-step4-default.png`
- iPhone light mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-017-iphone15-light-step4-off.png`
- iPhone dark mode (Step 4, no reminders): `.artifacts/onboarding-iterations/iteration-017-iphone15-dark-step4-off.png`
- Changes:
  - Removed checkmark prefixes from selected reminder options.
  - Kept selection clarity using border/background state only.
