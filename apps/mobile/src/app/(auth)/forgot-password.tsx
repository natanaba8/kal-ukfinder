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
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/** pr.md §17 — forgot and reset password. Built with GlueStack UI. */
export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { signIn } = useSession();

  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<string | null>(null);
  const [devToken, setDevToken] = useState<string | null>(null);
  const [resetToken, setResetToken] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestReset = async () => {
    setBusy(true);
    setError(null);

    try {
      const response = await api.forgotPassword(email.trim());
      setSent(response.message);
      setDevToken(response.devToken ?? null);
      if (response.devToken) setResetToken(response.devToken);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not send the reset link');
    } finally {
      setBusy(false);
    }
  };

  const applyReset = async () => {
    setBusy(true);
    setError(null);

    try {
      await api.resetPassword(resetToken.trim(), password);
      await signIn(email.trim(), password);
      router.replace('/');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reset your password');
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
        <Heading>Reset your password</Heading>
        <Text tone="dim">Enter the email you signed up with and we will send a reset link.</Text>
      </VStack>

      <Card>
        <Field
          label="Email"
          error={!sent && error ? error : undefined}
          inputProps={{
            value: email,
            onChangeText: setEmail,
            placeholder: 'you@example.com',
            autoCapitalize: 'none',
            keyboardType: 'email-address',
            textContentType: 'emailAddress',
          }}
        />

        <Button onPress={requestReset} isDisabled={busy || !email.includes('@')}>
          {busy && !sent ? <ButtonSpinner /> : null}
          <ButtonText>Send reset link</ButtonText>
        </Button>

        {sent ? (
          <Text size="sm" tone="good">
            {sent}
          </Text>
        ) : null}
      </Card>

      {sent ? (
        <Card>
          <Text bold>Enter your reset code</Text>
          <Text tone="dim">
            {devToken
              ? 'No mail service is configured on this server, so the code is shown here for development.'
              : 'Paste the code from the email.'}
          </Text>

          <Field
            label="Reset code"
            inputProps={{ value: resetToken, onChangeText: setResetToken, autoCapitalize: 'none' }}
          />

          <Field
            label="New password"
            helper="At least 10 characters, including a number or symbol."
            error={error ?? undefined}
            inputProps={{
              value: password,
              onChangeText: setPassword,
              secureTextEntry: true,
              textContentType: 'newPassword',
            }}
          />

          <Button onPress={applyReset} isDisabled={busy || resetToken.length < 10 || password.length < 10}>
            {busy ? <ButtonSpinner /> : null}
            <ButtonText>Set new password</ButtonText>
          </Button>
        </Card>
      ) : null}
    </GsScreen>
  );
}
