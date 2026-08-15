import { createButton } from '@gluestack-ui/button';
import { withStyleContext, useStyleContext } from '@gluestack-ui/nativewind-utils/withStyleContext';
import { forwardRef } from 'react';
import { ActivityIndicator, Pressable, Text as RNText, View } from 'react-native';

/**
 * GlueStack UI button (pr.md §21, §42.15).
 *
 * `createButton` is the headless behaviour — focus, press state, disabled
 * handling, accessibility roles — and everything visual is NativeWind classes
 * over the tokens in tailwind.config.js. The style context lets `ButtonText`
 * pick its colour from the parent's variant without prop drilling.
 */

const SCOPE = 'BUTTON';

const UIButton = createButton({
  Root: withStyleContext(Pressable, SCOPE),
  Text: RNText,
  Group: View,
  Spinner: ActivityIndicator,
  Icon: RNText,
});

export type ButtonVariant = 'solid' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const ROOT_BASE =
  'flex-row items-center justify-center gap-2 rounded-control border data-[disabled=true]:opacity-50';

const ROOT_VARIANT: Record<ButtonVariant, string> = {
  solid: 'bg-brand border-brand dark:bg-brand-d dark:border-brand-d',
  outline: 'bg-transparent border-line dark:border-line-d',
  ghost: 'bg-transparent border-transparent',
  danger: 'bg-accent border-accent dark:bg-accent-d dark:border-accent-d',
};

const ROOT_SIZE: Record<ButtonSize, string> = {
  sm: 'px-3 py-2',
  md: 'px-5 py-3',
  lg: 'px-6 py-4',
};

const TEXT_VARIANT: Record<ButtonVariant, string> = {
  solid: 'text-white dark:text-ink',
  outline: 'text-brand dark:text-brand-d',
  ghost: 'text-brand dark:text-brand-d',
  danger: 'text-white dark:text-ink',
};

const TEXT_SIZE: Record<ButtonSize, string> = {
  sm: 'text-sm',
  md: 'text-sm',
  lg: 'text-base',
};

type ButtonProps = React.ComponentProps<typeof UIButton> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
};

export const Button = forwardRef<React.ComponentRef<typeof UIButton>, ButtonProps>(
  ({ variant = 'solid', size = 'md', className, ...props }, ref) => (
    <UIButton
      ref={ref}
      // The context is what ButtonText and ButtonSpinner read.
      context={{ variant, size }}
      className={[ROOT_BASE, ROOT_VARIANT[variant], ROOT_SIZE[size], className].filter(Boolean).join(' ')}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export function ButtonText({ className, ...props }: React.ComponentProps<typeof UIButton.Text>) {
  const { variant, size } = useStyleContext(SCOPE) as { variant: ButtonVariant; size: ButtonSize };

  return (
    <UIButton.Text
      className={['font-semibold', TEXT_VARIANT[variant], TEXT_SIZE[size], className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function ButtonSpinner(props: React.ComponentProps<typeof UIButton.Spinner>) {
  const { variant } = useStyleContext(SCOPE) as { variant: ButtonVariant };
  return <UIButton.Spinner color={variant === 'solid' || variant === 'danger' ? '#FFFFFF' : '#1D4E89'} {...props} />;
}

export const ButtonGroup = UIButton.Group;
