import { useMemo } from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  fonts,
  spacing,
  type AppColorMode,
  type AppPalette,
} from "@/lib/theme";
import { ONBOARDING_STEPS } from "./constants";

type OnboardingFooterProps = {
  stepIndex: number;
  swipeHintLabel: string;
  bottomInset: number;
  palette: AppPalette;
  mode: AppColorMode;
};

export default function OnboardingFooter({
  stepIndex,
  swipeHintLabel,
  bottomInset,
  palette,
  mode,
}: OnboardingFooterProps) {
  const styles = useMemo(
    () => createStyles(palette, mode, bottomInset),
    [palette, mode, bottomInset],
  );

  return (
    <View pointerEvents="none" style={styles.footerOverlay}>
      <View style={styles.footerPill}>
        <View style={styles.progressRow}>
          {ONBOARDING_STEPS.map((step, index) => (
            <View
              key={step.key}
              style={[
                styles.progressDot,
                index === stepIndex ? styles.progressDotActive : undefined,
                index < stepIndex ? styles.progressDotCompleted : undefined,
              ]}
            />
          ))}
        </View>
        <Text style={styles.swipeHintText}>{swipeHintLabel}</Text>
      </View>
    </View>
  );
}

const createStyles = (
  palette: AppPalette,
  mode: AppColorMode,
  bottomInset: number,
) => {
  const isDark = mode === "dark";
  const footerPillBackground = isDark
    ? "rgba(25, 28, 33, 0.78)"
    : "rgba(255, 250, 242, 0.78)";
  const footerPillBorder = isDark
    ? "rgba(224, 230, 238, 0.12)"
    : "rgba(53, 41, 28, 0.12)";

  return StyleSheet.create({
    progressRow: {
      flexDirection: "row",
      justifyContent: "center",
      gap: 5,
      marginTop: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      borderRadius: 0,
      backgroundColor: "transparent",
    },
    footerOverlay: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: bottomInset + spacing.sm,
      alignItems: "center",
    },
    footerPill: {
      flexDirection: "column",
      alignItems: "center",
      gap: 8,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: footerPillBorder,
      backgroundColor: footerPillBackground,
      shadowColor: isDark ? "#000000" : "#1f1a14",
      shadowOpacity: isDark ? 0.32 : 0.12,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 5 },
      elevation: 3,
    },
    progressDot: {
      width: 6,
      height: 6,
      borderRadius: 999,
      backgroundColor: palette.mutedText,
      opacity: 0.26,
    },
    progressDotCompleted: {
      opacity: 0.56,
    },
    progressDotActive: {
      width: 16,
      height: 6,
      opacity: 1,
      backgroundColor: palette.ink,
    },
    swipeHintText: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 17,
      color: palette.mutedText,
      marginTop: 0,
    },
  });
};
