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
        <View style={styles.stateRow}>
          <View style={[styles.stateDot, styles.stateDotSuccess]} />
          <Text style={styles.stateText}>Signed in with Apple</Text>
        </View>
        <Text style={styles.helperText}>You are ready for the next step.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.stageCard, styles.stageCardMinimal]}>
      {authState === 'checking' ? (
        <View style={styles.loadingPill}>
          <ActivityIndicator size="small" color={palette.ink} />
          <Text style={styles.loadingText}>Checking your account...</Text>
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
          <Text style={styles.noteSubtle}>Sign in is available on iPhone.</Text>
        </View>
      ) : (
        <Pressable
          disabled={isSigningIn}
          onPress={onSignIn}
          style={[styles.signInButton, isSigningIn ? styles.disabledButton : undefined]}>
          <Text style={styles.signInButtonText}>{isSigningIn ? 'Signing in...' : 'Sign in with Apple'}</Text>
        </Pressable>
      )}

      {authMessage ? (
        <View style={styles.errorPill}>
          <Text style={styles.authError}>{authMessage}</Text>
        </View>
      ) : null}
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
      gap: spacing.sm,
    },
    stageCardMinimal: {
      backgroundColor: 'transparent',
      borderWidth: 0,
      borderRadius: 0,
      padding: 0,
      gap: spacing.sm,
    },
    stateRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
    },
    stateDot: {
      width: 8,
      height: 8,
      borderRadius: 999,
      backgroundColor: palette.ink,
      opacity: 0.45,
    },
    stateDotSuccess: {
      opacity: 1,
      backgroundColor: '#22c55e',
    },
    stateText: {
      fontFamily: fonts.bodyMedium,
      fontSize: 14,
      color: palette.ink,
    },
    loadingPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: palette.softStroke,
      backgroundColor: palette.glass,
      padding: spacing.sm,
    },
    loadingText: {
      fontFamily: fonts.body,
      fontSize: 14,
      color: palette.mutedText,
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
    helperText: {
      fontFamily: fonts.body,
      fontSize: 13,
      lineHeight: 18,
      color: palette.mutedText,
    },
    errorPill: {
      borderRadius: radii.sm,
      borderWidth: 1,
      borderColor: 'rgba(180, 35, 24, 0.28)',
      backgroundColor: 'rgba(180, 35, 24, 0.09)',
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
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
      lineHeight: 18,
    },
    disabledButton: {
      opacity: 0.45,
    },
  });

export type { LoginStepCardProps };
