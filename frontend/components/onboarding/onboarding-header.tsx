import { useMemo } from "react";
import { StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { fonts, spacing, type AppPalette } from "@/lib/theme";
import type { OnboardingStep } from "./types";

type OnboardingHeaderProps = {
  step: OnboardingStep;
  palette: AppPalette;
};

export default function OnboardingHeader({
  step,
  palette,
}: OnboardingHeaderProps) {
  const { width } = useWindowDimensions();
  const isCompact = width < 380;
  const styles = useMemo(
    () => createStyles(palette, isCompact),
    [palette, isCompact],
  );

  return (
    <View style={styles.header}>
      <Text style={styles.stepEyebrow}>{step.eyebrow}</Text>
      <Text style={[styles.title, isCompact ? styles.titleCompact : undefined]}>
        {step.title}
      </Text>
      <Text
        style={[
          styles.subtitle,
          isCompact ? styles.subtitleCompact : undefined,
        ]}
      >
        {step.body}
      </Text>
    </View>
  );
}

const createStyles = (palette: AppPalette, isCompact: boolean) =>
  StyleSheet.create({
    header: {
      gap: spacing.xs,
    },
    stepEyebrow: {
      fontFamily: fonts.bodyMedium,
      color: palette.mutedText,
      textTransform: "uppercase",
      letterSpacing: 1.4,
      fontSize: 11,
    },
    title: {
      fontFamily: fonts.display,
      fontSize: 38,
      lineHeight: 44,
      color: palette.ink,
    },
    titleCompact: {
      fontSize: 32,
      lineHeight: 38,
    },
    subtitle: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      lineHeight: 21,
      fontSize: 14,
      maxWidth: 340,
    },
    subtitleCompact: {
      fontSize: 13,
      lineHeight: 19,
    },
  });
