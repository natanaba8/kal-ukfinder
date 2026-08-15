import { createFormControl } from '@gluestack-ui/form-control';
import { createInput } from '@gluestack-ui/input';
import { withStyleContext } from '@gluestack-ui/nativewind-utils/withStyleContext';
import { forwardRef } from 'react';
import { Pressable, Text as RNText, TextInput, View } from 'react-native';

/**
 * GlueStack UI input and form control (pr.md §21).
 *
 * `createInput` handles focus propagation, disabled and read-only state, and
 * wires the field to its FormControl for accessibility — the label, helper and
 * error text are announced with the field rather than as loose text.
 */

const INPUT_SCOPE = 'INPUT';

const UIInput = createInput({
  Root: withStyleContext(View, INPUT_SCOPE),
  Icon: RNText,
  Slot: Pressable,
  Input: TextInput,
});

const UIFormControl = createFormControl({
  Root: View,
  Error: View,
  ErrorText: RNText,
  ErrorIcon: RNText,
  Label: View,
  LabelText: RNText,
  LabelAstrick: RNText,
  Helper: View,
  HelperText: RNText,
});

const ROOT_BASE =
  'w-full flex-row items-center rounded-control border bg-card px-3 dark:bg-card-d ' +
  'border-line dark:border-line-d ' +
  'data-[focus=true]:border-brand dark:data-[focus=true]:border-brand-d ' +
  'data-[invalid=true]:border-accent dark:data-[invalid=true]:border-accent-d ' +
  'data-[disabled=true]:opacity-50';

type InputProps = React.ComponentProps<typeof UIInput> & { className?: string; area?: boolean };

export const Input = forwardRef<React.ComponentRef<typeof UIInput>, InputProps>(
  ({ className, area, ...props }, ref) => (
    <UIInput
      ref={ref}
      className={[ROOT_BASE, area ? 'min-h-32 items-start py-2' : 'min-h-12', className].filter(Boolean).join(' ')}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export const InputField = forwardRef<
  React.ComponentRef<typeof UIInput.Input>,
  React.ComponentProps<typeof UIInput.Input> & { className?: string }
>(({ className, ...props }, ref) => (
  <UIInput.Input
    ref={ref}
    placeholderTextColor="#8A94A3"
    className={['flex-1 py-2 text-base text-ink dark:text-ink-d', className].filter(Boolean).join(' ')}
    {...props}
  />
));
InputField.displayName = 'InputField';

export const InputSlot = UIInput.Slot;
export const InputIcon = UIInput.Icon;

// --- form control -----------------------------------------------------------

export function FormControl({
  className,
  ...props
}: React.ComponentProps<typeof UIFormControl> & { className?: string }) {
  return <UIFormControl className={['w-full gap-1.5', className].filter(Boolean).join(' ')} {...props} />;
}

export function FormControlLabel(props: React.ComponentProps<typeof UIFormControl.Label>) {
  return <UIFormControl.Label {...props} />;
}

export function FormControlLabelText({
  className,
  ...props
}: React.ComponentProps<typeof UIFormControl.Label.Text> & { className?: string }) {
  return (
    <UIFormControl.Label.Text
      className={['text-sm font-semibold text-ink dark:text-ink-d', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function FormControlHelper(props: React.ComponentProps<typeof UIFormControl.Helper>) {
  return <UIFormControl.Helper {...props} />;
}

export function FormControlHelperText({
  className,
  ...props
}: React.ComponentProps<typeof UIFormControl.Helper.Text> & { className?: string }) {
  return (
    <UIFormControl.Helper.Text
      className={['text-xs text-ink-faint dark:text-ink-faint-d', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

export function FormControlError(props: React.ComponentProps<typeof UIFormControl.Error>) {
  return <UIFormControl.Error {...props} />;
}

export function FormControlErrorText({
  className,
  ...props
}: React.ComponentProps<typeof UIFormControl.Error.Text> & { className?: string }) {
  return (
    <UIFormControl.Error.Text
      className={['text-xs font-medium text-accent dark:text-accent-d', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}

/**
 * The shape every form on the new screens uses: label, field, and either a
 * helper line or an error line — never both, so the field only ever announces
 * one supporting message.
 */
export function Field({
  label,
  helper,
  error,
  area,
  inputProps,
}: {
  label?: string;
  helper?: string;
  error?: string;
  area?: boolean;
  inputProps: React.ComponentProps<typeof InputField>;
}) {
  return (
    <FormControl isInvalid={Boolean(error)}>
      {label ? (
        <FormControlLabel>
          <FormControlLabelText>{label}</FormControlLabelText>
        </FormControlLabel>
      ) : null}

      <Input area={area}>
        <InputField multiline={area} textAlignVertical={area ? 'top' : 'center'} {...inputProps} />
      </Input>

      {error ? (
        <FormControlError>
          <FormControlErrorText>{error}</FormControlErrorText>
        </FormControlError>
      ) : helper ? (
        <FormControlHelper>
          <FormControlHelperText>{helper}</FormControlHelperText>
        </FormControlHelper>
      ) : null}
    </FormControl>
  );
}
