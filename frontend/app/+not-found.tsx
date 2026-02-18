import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { fonts, palette, spacing } from '@/lib/theme';

export default function NotFoundScreen() {
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

const styles = StyleSheet.create({
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
