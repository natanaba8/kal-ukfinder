import { OverlayProvider } from '@gluestack-ui/overlay';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import '@/global.css';

import { ErrorScreen } from '@/components/error-screen';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useNotificationRouter } from '@/hooks/use-notification-router';
import { SessionProvider } from '@/lib/session';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * expo-router renders this instead of a red box when any screen throws, so a
 * failure is readable on the device rather than a bare stack trace.
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => void }) {
  return <ErrorScreen error={error} retry={retry} />;
}

export default function RootLayout() {
  const scheme = useColorScheme();
  useNotificationRouter();
  const isDark = scheme === 'dark';
  const palette = isDark ? Colors.dark : Colors.light;

  const navigationTheme = {
    ...(isDark ? DarkTheme : DefaultTheme),
    colors: {
      ...(isDark ? DarkTheme : DefaultTheme).colors,
      background: palette.background,
      card: palette.card,
      text: palette.text,
      border: palette.border,
      primary: palette.primary,
    },
  };

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        {/* GlueStack overlays (the Jobs filter sheet) portal through this. */}
        <OverlayProvider>
          <ThemeProvider value={navigationTheme}>
            <SessionProvider>
              <Stack
                screenOptions={{
                  headerShown: false,
                  contentStyle: { backgroundColor: palette.background },
                }}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="(auth)" />
                <Stack.Screen name="onboarding" />
                <Stack.Screen name="item/[id]" />
                <Stack.Screen name="job/[id]" />
                <Stack.Screen name="cv-review" />
                <Stack.Screen name="interview" />
                <Stack.Screen name="saved" />
                <Stack.Screen name="sources" />
              </Stack>
              <StatusBar style="auto" />
            </SessionProvider>
          </ThemeProvider>
        </OverlayProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
