import * as AppleAuthentication from 'expo-apple-authentication';
import { useMemo } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { fonts, radii, spacing, type AppPalette } from '@/lib/theme';

type AuthState = 'checking' | 'signed_out' | 'signed_in';

type LoginStepCardProps = {
  authState: AuthState;
  authMessage: string | null;
  isSigningIn: boolean;
  appleAuthAvailable: boolean;
  onSignIn: () => void;
  palette: AppPalette;
};

export default function LoginStepCard({
  authState,
  authMessage,
  isSigningIn,
  appleAuthAvailable,
  onSignIn,
  palette,
}: LoginStepCardProps) {
  const styles = useMemo(() => createStyles(palette), [palette]);

  if (authState === 'signed_in') {
    return (
      <View style={styles.stageCard}>
        <Text style={styles.stageTitle}>You are signed in</Text>
        <View style={styles.successCard}>
          <Text style={styles.successTitle}>Ready to sync</Text>
          <Text style={styles.successBody}>Your account is connected. Continue to set your daily routine.</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.stageCard}>
      <Text style={styles.stageTitle}>Connect with Apple</Text>
      <Text style={styles.stageBody}>You only need to do this once.</Text>

      {authState === 'checking' ? (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={palette.ink} />
          <Text style={styles.loadingText}>Checking your session...</Text>
        </View>
      ) : appleAuthAvailable ? (
        <AppleAuthentication.AppleAuthenticationButton
          buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
          buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
          cornerRadius={radii.pill}
          style={styles.appleButton}
          onPress={onSignIn}
        />
      ) : Platform.OS !== 'ios' ? (
        <View style={styles.noteCard}>
          <Text style={styles.noteSubtle}>Apple sign-in is available on iOS devices.</Text>
        </View>
      ) : (
        <Pressable
          disabled={isSigningIn}
          onPress={onSignIn}
          style={[styles.signInButton, isSigningIn ? styles.disabledButton : undefined]}>
          <Text style={styles.signInButtonText}>{isSigningIn ? 'Signing in...' : 'Sign in with Apple'}</Text>
        </Pressable>
      )}

      {authMessage ? <Text style={styles.authError}>{authMessage}</Text> : null}
    </View>
  );
}

const createStyles = (palette: AppPalette) =>
  StyleSheet.create({
    stageCard: {
      backgroundColor: palette.surface,
      borderRadius: radii.card,
      borderWidth: 1,
      borderColor: palette.softStroke,
      padding: spacing.md,
      gap: spacing.md,
    },
    stageTitle: {
      fontFamily: fonts.bodyMedium,
      fontSize: 16,
      color: palette.ink,
    },
    stageBody: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.mutedText,
    },
    successCard: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
      padding: spacing.sm,
      gap: 4,
    },
    successTitle: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: palette.ink,
    },
    successBody: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 19,
      color: palette.mutedText,
    },
    loadingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    loadingText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.ink,
    },
    appleButton: {
      width: '100%',
      height: 48,
    },
    noteCard: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
      padding: spacing.sm,
      gap: 4,
    },
    noteSubtle: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.mutedText,
    },
    signInButton: {
      borderRadius: radii.pill,
      backgroundColor: palette.ink,
      paddingVertical: spacing.sm,
      alignItems: 'center',
    },
    signInButtonText: {
      fontFamily: fonts.bodyMedium,
      color: palette.paper,
      fontSize: 15,
    },
    authError: {
      fontFamily: fonts.body,
      color: '#b42318',
      fontSize: 13,
      lineHeight: 19,
    },
    disabledButton: {
      opacity: 0.45,
    },
  });

export type { LoginStepCardProps };
