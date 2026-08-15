import { type ReactNode } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useColorScheme } from '@/hooks/use-color-scheme';

/**
 * Page shell for the GlueStack screens.
 *
 * Same contract as `components/ui/screen.tsx` — safe-area aware, centred and
 * width-capped so the web build does not stretch one column across a wide
 * monitor — but styled with NativeWind so it composes with the rest of this
 * layer. NativeWind's `dark:` variant needs the class on a root element, which
 * is what `GsRoot` provides.
 */
export function GsRoot({ children, className }: { children: ReactNode; className?: string }) {
  const scheme = useColorScheme();

  return (
    <View
      className={['flex-1 bg-white dark:bg-[#0B0F14]', scheme === 'dark' ? 'dark' : '', className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </View>
  );
}

export function GsScreen({
  children,
  onRefresh,
  refreshing = false,
  className,
}: {
  children: ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  className?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <GsRoot>
      <ScrollView
        contentContainerStyle={{ alignItems: 'center', paddingTop: insets.top + 8 }}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#1D4E89" /> : undefined
        }
      >
        <View className={['w-full max-w-[760px] gap-4 px-4 pb-16', className].filter(Boolean).join(' ')}>
          {children}
        </View>
      </ScrollView>
    </GsRoot>
  );
}

/** Row wrapper for list items, matching GsScreen's width cap. */
export function GsListItem({ children }: { children: ReactNode }) {
  return <View className="w-full max-w-[760px] px-4 pt-3">{children}</View>;
}
