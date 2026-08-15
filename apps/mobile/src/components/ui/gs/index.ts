/**
 * The GlueStack UI layer used by the screens added in pr.md Phases 8 and 9
 * (auth, Jobs, Policies).
 *
 * Behavioural components come from the headless `@gluestack-ui/*` packages;
 * layout and typography are React Native primitives with NativeWind classes.
 * Screens written before this keep using `components/ui/*` — pr.md §21 asks for
 * gradual integration, not a rewrite, and both sets read from the same palette.
 */

export { Button, ButtonGroup, ButtonSpinner, ButtonText } from './button';
export type { ButtonSize, ButtonVariant } from './button';

export {
  Field,
  FormControl,
  FormControlError,
  FormControlErrorText,
  FormControlHelper,
  FormControlHelperText,
  FormControlLabel,
  FormControlLabelText,
  Input,
  InputField,
  InputIcon,
  InputSlot,
} from './input';

export {
  Badge,
  Box,
  Card,
  Center,
  Chip,
  Divider,
  Heading,
  HStack,
  Pressable,
  Spinner,
  Text,
  VStack,
} from './primitives';
export type { BoxProps, GsTextProps, TextTone } from './primitives';
