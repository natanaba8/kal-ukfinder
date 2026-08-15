import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, Text } from 'react-native';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSession } from '@/lib/session';

/**
 * Emoji tab icons keep the app dependency-free across iOS, Android and web —
 * no icon font to load and nothing to go missing in the web build.
 */
const ICONS: Record<string, string> = {
  index: '📰',
  jobs: '💼',
  policy: '🏛️',
  coach: '💬',
  profile: '👤',
};

export default function TabsLayout() {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? Colors.dark : Colors.light;
  const { isOnboarded, isLoading, userId } = useSession();

  // First launch goes through onboarding so the feed has topics to rank against.
  if (!isLoading && userId && !isOnboarded) return <Redirect href="/onboarding" />;

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.card,
          borderTopColor: palette.border,
          ...Platform.select({ web: { height: 64, paddingBottom: 8, paddingTop: 8 }, default: {} }),
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
        tabBarIcon: ({ focused }) => (
          <Text style={[styles.icon, !focused && styles.iconInactive]}>{ICONS[route.name] ?? '•'}</Text>
        ),
      })}>
      <Tabs.Screen name="index" options={{ title: 'Briefing' }} />
      <Tabs.Screen name="jobs" options={{ title: 'Jobs' }} />
      <Tabs.Screen name="policy" options={{ title: 'Policy' }} />
      <Tabs.Screen name="coach" options={{ title: 'Coach' }} />
      <Tabs.Screen name="profile" options={{ title: 'You' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  icon: {
    fontSize: 20,
    lineHeight: 24,
  },
  iconInactive: {
    opacity: 0.55,
  },
});
