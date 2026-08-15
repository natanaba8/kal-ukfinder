import { forwardRef } from 'react';
import {
  ActivityIndicator,
  Pressable as RNPressable,
  Text as RNText,
  View,
  type PressableProps,
  type TextProps,
  type ViewProps,
} from 'react-native';

/**
 * The styled half of the GlueStack UI layer.
 *
 * GlueStack v2 splits components in two: behavioural ones come from the
 * headless `@gluestack-ui/*` packages (see button.tsx, input.tsx,
 * form-control.tsx), and layout/typography ones are plain React Native
 * primitives with NativeWind classes — which is all these are.
 *
 * Colours come from `tailwind.config.js`, which mirrors the tokens in
 * `constants/theme.ts`, so GlueStack screens and the older StyleSheet screens
 * sit side by side without clashing (pr.md §21, §42.16).
 */

const join = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

// --- layout -----------------------------------------------------------------

export type BoxProps = ViewProps & { className?: string };

export const Box = forwardRef<View, BoxProps>(({ className, ...props }, ref) => (
  <View ref={ref} className={className} {...props} />
));
Box.displayName = 'Box';

export const VStack = forwardRef<View, BoxProps & { space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }>(
  ({ className, space = 'md', ...props }, ref) => (
    <View ref={ref} className={join('flex flex-col', SPACE[space], className)} {...props} />
  ),
);
VStack.displayName = 'VStack';

export const HStack = forwardRef<View, BoxProps & { space?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' }>(
  ({ className, space = 'md', ...props }, ref) => (
    <View ref={ref} className={join('flex flex-row', SPACE[space], className)} {...props} />
  ),
);
HStack.displayName = 'HStack';

const SPACE = {
  xs: 'gap-1',
  sm: 'gap-2',
  md: 'gap-3',
  lg: 'gap-4',
  xl: 'gap-6',
} as const;

export function Center({ className, ...props }: BoxProps) {
  return <View className={join('items-center justify-center', className)} {...props} />;
}

export function Divider({ className }: { className?: string }) {
  return <View className={join('h-px w-full bg-line dark:bg-line-d', className)} />;
}

// --- typography -------------------------------------------------------------

const TEXT_SIZE = {
  xs: 'text-xs leading-4',
  sm: 'text-sm leading-5',
  md: 'text-base leading-6',
  lg: 'text-lg leading-7',
} as const;

const TEXT_TONE = {
  default: 'text-ink dark:text-ink-d',
  dim: 'text-ink-dim dark:text-ink-dim-d',
  faint: 'text-ink-faint dark:text-ink-faint-d',
  brand: 'text-brand dark:text-brand-d',
  accent: 'text-accent dark:text-accent-d',
  good: 'text-good dark:text-good-d',
  warn: 'text-warn dark:text-warn-d',
} as const;

export type TextTone = keyof typeof TEXT_TONE;

export type GsTextProps = TextProps & {
  className?: string;
  size?: keyof typeof TEXT_SIZE;
  tone?: TextTone;
  bold?: boolean;
};

export function Text({ className, size = 'sm', tone = 'default', bold, ...props }: GsTextProps) {
  return (
    <RNText
      className={join(TEXT_SIZE[size], TEXT_TONE[tone], bold && 'font-semibold', className)}
      {...props}
    />
  );
}

const HEADING_SIZE = {
  sm: 'text-base leading-6',
  md: 'text-xl leading-7',
  lg: 'text-2xl leading-8',
  xl: 'text-3xl leading-9',
} as const;

export function Heading({
  className,
  size = 'lg',
  ...props
}: TextProps & { className?: string; size?: keyof typeof HEADING_SIZE }) {
  return (
    <RNText
      accessibilityRole="header"
      className={join(HEADING_SIZE[size], 'font-bold text-ink dark:text-ink-d', className)}
      {...props}
    />
  );
}

// --- surfaces ---------------------------------------------------------------

export function Card({ className, tone = 'raised', ...props }: BoxProps & { tone?: 'raised' | 'flat' }) {
  return (
    <View
      className={join(
        'gap-3 rounded-card border p-4',
        tone === 'flat'
          ? 'border-transparent bg-surface dark:bg-surface-d'
          : 'border-line bg-card dark:border-line-d dark:bg-card-d',
        className,
      )}
      {...props}
    />
  );
}

const BADGE_TONE = {
  neutral: 'bg-surface dark:bg-surface-d',
  brand: 'bg-brand-soft dark:bg-brand-soft-d',
  accent: 'bg-accent-soft dark:bg-accent-soft',
  good: 'bg-good-soft dark:bg-good-soft',
  warn: 'bg-warn-soft dark:bg-warn-soft',
} as const;

const BADGE_TEXT: Record<keyof typeof BADGE_TONE, TextTone> = {
  neutral: 'dim',
  brand: 'brand',
  accent: 'accent',
  good: 'good',
  warn: 'warn',
};

export function Badge({
  label,
  tone = 'neutral',
  className,
}: {
  label: string;
  tone?: keyof typeof BADGE_TONE;
  className?: string;
}) {
  return (
    <View className={join('self-start rounded-full px-2.5 py-1', BADGE_TONE[tone], className)}>
      <Text size="xs" bold tone={BADGE_TEXT[tone]}>
        {label}
      </Text>
    </View>
  );
}

/** Selectable pill — the filter and topic chips across the new screens. */
export function Chip({
  label,
  selected,
  onPress,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  tone?: keyof typeof BADGE_TONE;
  size?: 'sm' | 'md';
}) {
  const body = (
    <View
      className={join(
        'self-start rounded-full border',
        size === 'sm' ? 'px-2.5 py-1' : 'px-3 py-2',
        selected ? 'border-brand bg-brand dark:border-brand-d dark:bg-brand-d' : join('border-transparent', BADGE_TONE[tone]),
      )}
    >
      <Text size={size === 'sm' ? 'xs' : 'sm'} bold className={selected ? 'text-white dark:text-ink' : undefined} tone={selected ? undefined : BADGE_TEXT[tone]}>
        {label}
      </Text>
    </View>
  );

  if (!onPress) return body;

  return (
    <RNPressable onPress={onPress} accessibilityRole="button" className="active:opacity-70">
      {body}
    </RNPressable>
  );
}

export function Pressable({ className, ...props }: PressableProps & { className?: string }) {
  return <RNPressable className={join('active:opacity-75', className)} {...props} />;
}

export function Spinner({ tone = 'brand' }: { tone?: 'brand' | 'light' }) {
  return <ActivityIndicator color={tone === 'brand' ? '#1D4E89' : '#FFFFFF'} />;
}
