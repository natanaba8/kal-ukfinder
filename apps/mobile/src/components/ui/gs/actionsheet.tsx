import { createActionsheet } from '@gluestack-ui/actionsheet';
import { withStyleContext } from '@gluestack-ui/nativewind-utils/withStyleContext';
import {
  FlatList,
  Pressable,
  ScrollView,
  SectionList,
  Text as RNText,
  View,
  VirtualizedList,
} from 'react-native';

/**
 * GlueStack UI actionsheet — the bottom sheet behind the Jobs filters (pr.md §23).
 *
 * The headless package handles the parts that are easy to get wrong by hand:
 * focus trapping, restoring focus to the trigger on close, the back button and
 * Escape key, and marking the content below as inert for screen readers.
 * `AnimatePresence` is optional and omitted, so no animation library is needed.
 *
 * Requires an `<OverlayProvider>` ancestor — mounted in `app/_layout.tsx`.
 */

const SCOPE = 'ACTIONSHEET';

const UIActionsheet = createActionsheet({
  Root: View,
  Backdrop: Pressable,
  Content: withStyleContext(View, SCOPE),
  Item: Pressable,
  ItemText: RNText,
  DragIndicator: View,
  IndicatorWrapper: View,
  ScrollView,
  VirtualizedList,
  FlatList,
  SectionList,
  SectionHeaderText: RNText,
  Icon: View,
});

export const Actionsheet = UIActionsheet;

export function ActionsheetBackdrop(props: React.ComponentProps<typeof UIActionsheet.Backdrop>) {
  return <UIActionsheet.Backdrop className="absolute inset-0 bg-black/50" {...props} />;
}

export function ActionsheetContent({
  className,
  ...props
}: React.ComponentProps<typeof UIActionsheet.Content> & { className?: string }) {
  return (
    <UIActionsheet.Content
      className={[
        'absolute bottom-0 w-full items-center gap-3 self-center rounded-t-card border border-line bg-white px-4 pb-6 pt-2',
        'max-h-[82%] max-w-[760px] dark:border-line-d dark:bg-[#0B0F14]',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

export function ActionsheetDragIndicatorWrapper(
  props: React.ComponentProps<typeof UIActionsheet.DragIndicatorWrapper>,
) {
  return <UIActionsheet.DragIndicatorWrapper className="w-full items-center py-1" {...props} />;
}

export function ActionsheetDragIndicator(props: React.ComponentProps<typeof UIActionsheet.DragIndicator>) {
  return <UIActionsheet.DragIndicator className="h-1 w-10 rounded-full bg-line dark:bg-line-d" {...props} />;
}

export function ActionsheetScrollView({
  className,
  ...props
}: React.ComponentProps<typeof UIActionsheet.ScrollView> & { className?: string }) {
  return <UIActionsheet.ScrollView className={['w-full', className].filter(Boolean).join(' ')} {...props} />;
}

export function ActionsheetItem({
  className,
  ...props
}: React.ComponentProps<typeof UIActionsheet.Item> & { className?: string }) {
  return (
    <UIActionsheet.Item
      className={['w-full flex-row items-center gap-3 rounded-control px-2 py-3 active:opacity-70', className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}

export function ActionsheetItemText({
  className,
  ...props
}: React.ComponentProps<typeof UIActionsheet.ItemText> & { className?: string }) {
  return (
    <UIActionsheet.ItemText
      className={['text-sm text-ink dark:text-ink-d', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
