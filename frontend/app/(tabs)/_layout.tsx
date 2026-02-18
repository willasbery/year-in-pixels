import Ionicons from '@expo/vector-icons/Ionicons';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { LinearGradient } from 'expo-linear-gradient';
import { Tabs, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { getAccessToken } from '@/lib/auth';
import { useAppStore } from '@/lib/store';
import { fonts, spacing, useAppTheme, type AppPalette } from '@/lib/theme';

type AuthState = 'checking' | 'signed_out' | 'signed_in';

function TabBarIcon(props: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
}) {
  return <Ionicons size={17} {...props} />;
}

type FloatingTabBarProps = BottomTabBarProps & {
  barWidth: number;
  barRadius: number;
  styles: ReturnType<typeof createStyles>;
};

function FloatingTabBar({ barWidth, barRadius, styles, ...props }: FloatingTabBarProps) {
  return (
    <View pointerEvents="box-none" style={styles.tabBarHost}>
      <View style={[styles.tabBarFrame, { width: barWidth, borderRadius: barRadius }]}>
        <BottomTabBar {...props} />
      </View>
    </View>
  );
}

export default function TabLayout() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { gradients, palette } = useAppTheme();
  const styles = useMemo(() => createStyles(palette), [palette]);
  const hydrate = useAppStore((state) => state.hydrate);
  const authRequired = useAppStore((state) => state.authRequired);
  const hasHydrated = useAppStore((state) => state.hasHydrated);
  const isHydrating = useAppStore((state) => state.isHydrating);

  const [authState, setAuthState] = useState<AuthState>('checking');
  const isCompactTabBar = width < 390;
  const tabBarHorizontalMargin = isCompactTabBar ? 24 : 28;
  const tabBarWidth = Math.min(width - tabBarHorizontalMargin * 2, 360);
  const tabBarRadius = isCompactTabBar ? 24 : 28;

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
        useAppStore.setState({ authRequired: false, lastError: null });
        setAuthState('signed_in');
        return;
      }

      setAuthState('signed_out');
    };

    void bootstrapAuth().catch((error: unknown) => {
      if (!active) {
        return;
      }
      setAuthState('signed_out');
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (authState !== 'signed_in' || hasHydrated || isHydrating) {
      return;
    }
    void hydrateCurrentYear();
  }, [authState, hasHydrated, hydrateCurrentYear, isHydrating]);

  useEffect(() => {
    if (!authRequired) {
      return;
    }
    setAuthState('signed_out');
  }, [authRequired]);

  useEffect(() => {
    if (authState !== 'signed_out') {
      return;
    }

    router.replace({ pathname: '/onboarding', params: { step: 'login' } });
  }, [authState, router]);

  if (authState === 'checking') {
    return (
      <LinearGradient colors={gradients.app} style={styles.authScreen}>
        <SafeAreaView edges={['top']} style={styles.authSafeArea}>
          <View style={styles.authLoadingCard}>
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={palette.ink} />
              <Text style={styles.loadingText}>Checking your session...</Text>
            </View>
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (authState === 'signed_out') {
    return null;
  }

  return (
    <Tabs
      tabBar={(props) => (
        <FloatingTabBar {...props} barWidth={tabBarWidth} barRadius={tabBarRadius} styles={styles} />
      )}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarActiveTintColor: palette.ink,
        tabBarInactiveTintColor: palette.mutedText,
        tabBarActiveBackgroundColor: 'transparent',
        tabBarShowLabel: !isCompactTabBar,
        tabBarStyle: [
          styles.tabBar,
          isCompactTabBar ? styles.tabBarCompact : styles.tabBarRegular,
          { borderRadius: tabBarRadius },
        ],
        tabBarItemStyle: [styles.tabBarItem, { borderRadius: tabBarRadius - 8 }],
        tabBarLabelStyle: styles.tabBarLabel,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Journal',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconChip, focused ? styles.tabIconChipActive : undefined]}>
              <TabBarIcon name="grid-outline" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: 'Stats',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconChip, focused ? styles.tabIconChipActive : undefined]}>
              <TabBarIcon name="pulse-outline" color={color} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ color, focused }) => (
            <View style={[styles.tabIconChip, focused ? styles.tabIconChipActive : undefined]}>
              <TabBarIcon name="options-outline" color={color} />
            </View>
          ),
        }}
      />
    </Tabs>
  );
}

const createStyles = (palette: AppPalette) => StyleSheet.create({
  authScreen: {
    flex: 1,
  },
  authSafeArea: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  authLoadingCard: {
    backgroundColor: palette.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: palette.softStroke,
    padding: spacing.md,
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
  tabBarHost: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 14,
    alignItems: 'center',
  },
  tabBarFrame: {
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: palette.softStroke,
    backgroundColor: palette.paper,
  },
  tabBar: {
    borderTopWidth: 0,
    backgroundColor: 'transparent',
    height: 60,
    elevation: 0,
    paddingHorizontal: 4,
    paddingTop: 5,
    paddingBottom: Platform.OS === 'ios' ? 7 : 5,
    overflow: 'hidden',
  },
  tabBarRegular: {
    height: 60,
  },
  tabBarCompact: {
    height: 52,
    paddingHorizontal: 2,
    paddingTop: 3,
    paddingBottom: Platform.OS === 'ios' ? 5 : 3,
  },
  tabBarItem: {
    minWidth: 0,
    overflow: 'hidden',
  },
  tabBarLabel: {
    fontFamily: fonts.bodyMedium,
    fontSize: 10,
  },
  tabIconChip: {
    width: 30,
    height: 30,
    borderRadius: 999,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconChipActive: {
    backgroundColor: palette.surface,
    borderWidth: 1,
    borderColor: palette.softStroke,
  },
});
