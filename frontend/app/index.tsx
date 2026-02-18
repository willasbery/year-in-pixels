import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getOnboardingCompleted } from '@/lib/onboarding';
import { fonts, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

export default function AppLauncherScreen() {
  const router = useRouter();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  useEffect(() => {
    let active = true;

    const routeFromLaunchState = async () => {
      const onboardingCompleted = await getOnboardingCompleted();
      if (!active) {
        return;
      }

      router.replace(onboardingCompleted ? '/(tabs)' : '/onboarding');
    };

    void routeFromLaunchState();

    return () => {
      active = false;
    };
  }, [router]);

  return (
    <LinearGradient colors={gradients.app} style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.content}>
          <ActivityIndicator color={palette.ink} />
          <Text style={styles.label}>Loading...</Text>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.body,
    fontSize: 13,
    color: palette.mutedText,
  },
});
