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
  Text,
  VStack,
} from '@/components/ui/gs';
import { GsScreen } from '@/components/ui/gs/screen';
import { useSession } from '@/lib/session';

/** Mirrors the server's policy in `auth/passwords.js` so the hint matches the rule. */
const passwordProblems = (password: string) => {
  const problems: string[] = [];
  if (password.length < 10) problems.push('at least 10 characters');
  if (!/[a-zA-Z]/.test(password)) problems.push('a letter');
  if (!/[0-9\p{P}\p{S}]/u.test(password)) problems.push('a number or symbol');
  return problems;
};

/** pr.md §17 — register. Built with GlueStack UI (§21, §42.15). */
export default function SignUpScreen() {
  const router = useRouter();
  const { signUp } = useSession();

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const problems = passwordProblems(password);
  const ready = email.includes('@') && problems.length === 0;

  const submit = async () => {
    setBusy(true);
    setError(null);

    try {
      await signUp({ email: email.trim(), password, displayName: displayName.trim() || undefined });
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create your account');
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
        <Heading>Create your account</Heading>
        <Text tone="dim">Everything you have already saved on this device stays with you.</Text>
      </VStack>

      <Card>
        <Field
          label="Your name"
          inputProps={{ value: displayName, onChangeText: setDisplayName, placeholder: 'First name is fine' }}
        />

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
          helper={
            password.length === 0
              ? 'Needs at least 10 characters, including a number or symbol.'
              : problems.length > 0
                ? `Still needs ${problems.join(', ')}.`
                : 'That works.'
          }
          inputProps={{
            value: password,
            onChangeText: setPassword,
            placeholder: 'Pick something long',
            secureTextEntry: true,
            autoComplete: 'new-password',
            textContentType: 'newPassword',
          }}
        />

        <Button onPress={submit} isDisabled={busy || !ready}>
          {busy ? <ButtonSpinner /> : null}
          <ButtonText>Create account</ButtonText>
        </Button>
      </Card>

      <Card tone="flat">
        <Text tone="dim">Already have an account?</Text>
        <Button variant="outline" onPress={() => router.replace('/sign-in')}>
          <ButtonText>Sign in instead</ButtonText>
        </Button>
      </Card>

      <Text size="xs" tone="faint">
        Your password is stored only as a scrypt hash. Your CV text is never saved — it is sent for review and
        discarded.
      </Text>
    </GsScreen>
  );
}
