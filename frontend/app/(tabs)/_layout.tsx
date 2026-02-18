import Ionicons from '@expo/vector-icons/Ionicons';
import * as AppleAuthentication from 'expo-apple-authentication';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAccessToken, signInWithApple } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { fonts, gradients, palette, radii, spacing } from '@/lib/theme';

type AuthState = 'checking' | 'signed_out' | 'signed_in';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={18} {...props} />;
}

function normalizeAuthMessage(error: unknown): string {
  if (error instanceof Error && /canceled|cancelled/i.test(error.message)) {
    return 'Sign in was canceled.';
  }
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }
  return 'Unable to sign in right now. Please try again.';
}

export default function TabLayout() {
  const hydrate = useAppStore((state) => state.hydrate);
  const authRequired = useAppStore((state) => state.authRequired);
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isHydrating = useAppStore((state) => state.isHydrating);
  const clearError = useAppStore((state) => state.clearError);

  const [authState, setAuthState] = useState<AuthState>('checking');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [appleAuthAvailable, setAppleAuthAvailable] = useState(false);

  const hydrateCurrentYear = useCallback(async () => {
    await hydrate(new Date().getFullYear());
  }, [hydrate]);

  useEffect(() => {
    let active = true;

    const bootstrapAuth = async () => {
      const token = await getAccessToken();
      if (!active) {
        return;
      }

      if (token) {
        setAuthState('signed_in');
        return;
      }

      setAuthState('signed_out');
    };

    void bootstrapAuth().catch((error: unknown) => {
      if (!active) {
        return;
      }
      setAuthMessage(normalizeAuthMessage(error));
      setAuthState('signed_out');
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed_out') {
      return;
    }

    let active = true;
    const checkAppleAvailability = async () => {
      if (Platform.OS !== 'ios') {
        if (active) {
          setAppleAuthAvailable(false);
        }
        return;
      }

      const available = await AppleAuthentication.isAvailableAsync();
      if (active) {
        setAppleAuthAvailable(available);
      }
    };

    void checkAppleAvailability().catch(() => {
      if (active) {
        setAppleAuthAvailable(false);
      }
    });

    return () => {
      active = false;
    };
  }, [authState]);

  useEffect(() => {
    if (authState !== 'signed_in' || hasHydrated || isHydrating) {
      return;
    }
    void hydrateCurrentYear();
  }, [authState, hasHydrated, hydrateCurrentYear, isHydrating]);

  useEffect(() => {
    if (!authRequired || isSigningIn) {
      return;
    }
    setAuthState('signed_out');
  }, [authRequired, isSigningIn]);

  const handleSignIn = useCallback(async () => {
    if (isSigningIn) {
      return;
    }
    setIsSigningIn(true);
    setAuthMessage(null);
    clearError();
    try {
      await signInWithApple();
      useAppStore.setState({ authRequired: false, lastError: null });
      await hydrateCurrentYear();
      if (useAppStore.getState().authRequired) {
        throw new Error(useAppStore.getState().lastError ?? 'Session expired. Sign in again.');
      }
      setAuthState('signed_in');
    } catch (error) {
      setAuthState('signed_out');
      setAuthMessage(normalizeAuthMessage(error));
    } finally {
      setIsSigningIn(false);
    }
  }, [clearError, hydrateCurrentYear, isSigningIn]);

  if (authState !== 'signed_in') {
    return (
      <LinearGradient colors={gradients.app} style={styles.authScreen}>
        <SafeAreaView edges={['top']} style={styles.authSafeArea}>
          <View style={styles.authCard}>
            <Text style={styles.authEyebrow}>Year in Pixels</Text>
            <Text style={styles.authTitle}>Sign in to continue</Text>
            <Text style={styles.authBody}>
              Your journal is private. Please authenticate with Apple before using the app.
            </Text>

            {authState === 'checking' ? (
              <View style={styles.loadingRow}>
                <ActivityIndicator size="small" color={palette.ink} />
                <Text style={styles.loadingText}>Checking your session...</Text>
              </View>
            ) : (
              <View style={styles.signInArea}>
                {appleAuthAvailable ? (
                  <AppleAuthentication.AppleAuthenticationButton
                    buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                    buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                    cornerRadius={radii.pill}
                    style={styles.appleButton}
                    onPress={handleSignIn}
                  />
                ) : (
                  <Pressable
                    disabled={isSigningIn}
                    onPress={handleSignIn}
                    style={[styles.signInButton, isSigningIn ? styles.signInButtonDisabled : undefined]}>
                    <Text style={styles.signInButtonText}>
                      {isSigningIn ? 'Signing in...' : 'Sign in with Apple'}
                    </Text>
                  </Pressable>
                )}

                {authMessage ? <Text style={styles.authError}>{authMessage}</Text> : null}
              </View>
            )}
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.mutedText,
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabBarLabel,
        tabBarBackground: () => <View style={styles.tabBarBackground} />,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color }) => <TabBarIcon name="grid-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color }) => <TabBarIcon name="pulse-outline" color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color }) => <TabBarIcon name="options-outline" color={color} />,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  authScreen: {
    flex: 1,
  },
  authSafeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  authCard: {
    backgroundColor: palette.surface,
    borderRadius: radii.card,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  authEyebrow: {
    fontFamily: fonts.bodyMedium,
    fontSize: 12,
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    color: palette.mutedText,
  },
  authTitle: {
    fontFamily: fonts.display,
    fontSize: 34,
    lineHeight: 40,
    color: palette.ink,
  },
  authBody: {
    fontFamily: fonts.body,
    fontSize: 14,
    lineHeight: 21,
    color: palette.mutedText,
  },
  loadingRow: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: {
    fontFamily: fonts.body,
    fontSize: 14,
    color: palette.ink,
  },
  signInArea: {
    marginTop: spacing.sm,
    gap: spacing.sm,
  },
  appleButton: {
    width: '100%',
    height: 48,
  },
  signInButton: {
    borderRadius: radii.pill,
    backgroundColor: palette.ink,
    paddingVertical: spacing.sm,
    alignItems: 'center',
  },
  signInButtonDisabled: {
    opacity: 0.6,
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
  tabBar: {
    borderTopColor: 'transparent',
    backgroundColor: 'transparent',
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: 20,
    height: 64,
    elevation: 0,
  },
  tabBarBackground: {
    flex: 1,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.glass,
  },
  tabBarLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 11,
    marginBottom: 8,
  },
});
