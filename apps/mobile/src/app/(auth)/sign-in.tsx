import { useRouter } from 'expo-router';
import { useState } from 'react';

import {
  Button,
  ButtonSpinner,
  ButtonText,
  Card,
  Chip,
  Field,
  Heading,
  HStack,
  Pressable,
  Text,
  VStack,
} from '@/components/ui/gs';
import { GsScreen } from '@/components/ui/gs/screen';
import { useSession } from '@/lib/session';

/** pr.md §17 — sign in. Built with GlueStack UI (§21, §42.15). */
export default function SignInScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  return (
    <GsScreen>
      <HStack className="pt-2">
        <Chip label="‹ Back" onPress={() => router.back()} />
      </HStack>

      <VStack space="xs">
        <Heading>Welcome back</Heading>
        <Text tone="dim">
          Sign in to keep your saved jobs, coach history and notifications across devices.
        </Text>
      </VStack>

      <Card>
        <Field
          label="Email"
          error={error ?? undefined}
          inputProps={{
            value: email,
            onChangeText: setEmail,
            placeholder: 'you@example.com',
            autoCapitalize: 'none',
            autoComplete: 'email',
            keyboardType: 'email-address',
            textContentType: 'emailAddress',
          }}
        />

        <Field
          label="Password"
          inputProps={{
            value: password,
            onChangeText: setPassword,
            placeholder: 'Your password',
            secureTextEntry: true,
            autoComplete: 'current-password',
            textContentType: 'password',
            onSubmitEditing: submit,
          }}
        />

        <Button onPress={submit} isDisabled={busy || !email.trim() || password.length < 1}>
          {busy ? <ButtonSpinner /> : null}
          <ButtonText>Sign in</ButtonText>
        </Button>

        <Pressable onPress={() => router.push('/forgot-password')} accessibilityRole="link">
          <Text size="sm" tone="brand" className="pt-1 text-center">
            Forgotten your password?
          </Text>
        </Pressable>
      </Card>

      <Card tone="flat">
        <Text bold>New here?</Text>
        <Text tone="dim">Creating an account keeps everything you have already saved on this device.</Text>
        <Button variant="outline" onPress={() => router.replace('/sign-up')}>
          <ButtonText>Create an account</ButtonText>
        </Button>
      </Card>
    </GsScreen>
  );
}
