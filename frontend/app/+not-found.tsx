import { Link, Stack } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

export default function NotFoundScreen() {
  const { palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);

  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>

        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Go back to the journal</Text>
        </Link>
      </View>
    </>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
    backgroundColor: palette.canvas,
  },
  title: {
    fontFamily: fonts.bodyMedium,
    fontSize: 18,
    color: palette.ink,
  },
  link: {
    marginTop: spacing.md,
    paddingVertical: spacing.sm,
  },
  linkText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.mutedText,
  },
});
