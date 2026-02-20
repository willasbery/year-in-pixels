import { memo, useCallback, useMemo } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import {
  fonts,
  radii,
  spacing,
  useAppTheme,
  type AppPalette,
  type ThemeSettings,
} from "@/lib/theme";

type WallpaperEditorProps = {
  theme: ThemeSettings;
  onSetAvoidLockScreenUi: (enabled: boolean) => void;
  onSetColumns: (columns: number) => void;
  onPreviewWallpaper: () => void;
  previewDisabled?: boolean;
};

type OptionButtonProps = {
  label: string;
  active: boolean;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
};

const OptionButton = memo(function OptionButton({
  label,
  active,
  onPress,
  styles,
}: OptionButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.badge, active ? styles.badgeActive : undefined]}
    >
      <Text
        style={[styles.badgeText, active ? styles.badgeTextActive : undefined]}
      >
        {label}
      </Text>
    </Pressable>
  );
});

const columnOptions = [7, 13, 14, 21] as const;

function WallpaperEditor({
  theme,
  onSetAvoidLockScreenUi,
  onSetColumns,
  onPreviewWallpaper,
  previewDisabled = false,
}: WallpaperEditorProps) {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  const handleEnableSafeAreas = useCallback(() => {
    onSetAvoidLockScreenUi(true);
  }, [onSetAvoidLockScreenUi]);

  const handleDisableSafeAreas = useCallback(() => {
    onSetAvoidLockScreenUi(false);
  }, [onSetAvoidLockScreenUi]);

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Wallpaper</Text>
      <Text style={styles.subtitle}>
        Configure iPhone lock-screen safe areas and day columns.
      </Text>

      <View style={styles.sectionStack}>
        <View style={styles.controlSection}>
          <Text style={styles.sectionLabel}>Lock-Screen Safe Areas</Text>
          <View style={styles.badges}>
            <OptionButton
              label="Avoid Clock + Widgets"
              active={theme.avoidLockScreenUi}
              onPress={handleEnableSafeAreas}
              styles={styles}
            />
            <OptionButton
              label="Allow Full Area"
              active={!theme.avoidLockScreenUi}
              onPress={handleDisableSafeAreas}
              styles={styles}
            />
          </View>
          <Text style={styles.hintText}>
            Avoid mode keeps all dots below the iPhone clock and widgets.
          </Text>
        </View>

        <View style={styles.controlSection}>
          <Text style={styles.sectionLabel}>Columns</Text>
          <View style={styles.badges}>
            {columnOptions.map((option) => (
              <OptionButton
                key={`wallpaper-columns-${option}`}
                label={String(option)}
                active={theme.columns === option}
                onPress={() => onSetColumns(option)}
                styles={styles}
              />
            ))}
          </View>
          <Text style={styles.hintText}>
            Higher columns fit more days per row on vertical iPhone wallpapers.
          </Text>
        </View>
      </View>

      <Pressable
        onPress={onPreviewWallpaper}
        disabled={previewDisabled}
        style={[
          styles.button,
          previewDisabled ? styles.buttonDisabled : undefined,
        ]}
      >
        <Text style={styles.buttonText}>Preview Lock Screen</Text>
      </Pressable>
    </View>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: palette.softStroke,
      padding: spacing.md,
      gap: spacing.sm,
    },
    title: {
      fontFamily: fonts.bodyMedium,
      fontSize: 16,
      color: palette.ink,
    },
    subtitle: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
    sectionStack: {
      marginTop: spacing.sm,
      gap: spacing.md,
    },
    controlSection: {
      gap: spacing.xs,
    },
    sectionLabel: {
      fontFamily: fonts.bodyMedium,
      fontSize: 12,
      color: palette.mutedText,
      textTransform: "uppercase",
      letterSpacing: 1,
    },
    badges: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: spacing.xs,
    },
    badge: {
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
    },
    badgeActive: {
      backgroundColor: palette.ink,
      borderColor: palette.ink,
    },
    badgeText: {
      fontFamily: fonts.body,
      color: palette.ink,
      fontSize: 11,
    },
    badgeTextActive: {
      color: palette.paper,
    },
    hintText: {
      fontFamily: fonts.body,
      color: palette.mutedText,
      lineHeight: 18,
      fontSize: 12,
    },
    button: {
      marginTop: spacing.xs,
      borderRadius: radii.pill,
      borderWidth: 1,
      borderColor: palette.softStroke,
      paddingVertical: spacing.sm,
      alignItems: "center",
    },
    buttonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.ink,
      fontSize: 14,
    },
    buttonDisabled: {
      opacity: 0.55,
    },
  });

export default memo(WallpaperEditor);
