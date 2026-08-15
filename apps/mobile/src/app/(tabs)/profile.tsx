import { useMutation, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { SwitchRow, TextField } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { AUDIENCES, EXPERIENCE_LEVELS, TOPICS, UK_REGIONS } from '@/constants/taxonomy';
import { Spacing } from '@/constants/theme';
import { API_BASE_URL, api } from '@/lib/api';
import { forAudience, isDevBuild } from '@/lib/audience';
import { hourLabel } from '@/lib/format';
import {
  notificationsSupported,
  notificationsUnavailableReason,
  scheduleDailyDigest,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';

const DIGEST_HOURS = [6, 7, 8, 9, 12, 17, 19];

const notify = (title: string, message: string) => {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert -- Alert.alert is a no-op on react-native-web.
    window.alert(`${title}\n\n${message}`);
    return;
  }
  Alert.alert(title, message);
};

export default function ProfileScreen() {
  const router = useRouter();
  const {
    user,
    userId,
    profile,
    updateProfile,
    updateName,
    isSaving,
    isLoading,
    error,
    resetOnboarding,
    isSignedIn,
    signOut,
    changePassword,
  } = useSession();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [sector, setSector] = useState('');
  const [skills, setSkills] = useState('');

  // Hydrate the form once the profile arrives.
  useEffect(() => {
    if (!user) return;
    setName(user.displayName);
    setHeadline(user.profile.headline);
    setLocation(user.profile.location);
    setSector(user.profile.sector);
    setSkills(user.profile.skills.join(', '));
  }, [user]);

  const status = useQuery({ queryKey: ['status'], queryFn: api.status, staleTime: 300_000 });

  const preview = useQuery({
    queryKey: ['digest-preview', userId],
    queryFn: () => api.notificationPreview(userId as string),
    enabled: Boolean(userId),
  });

  const testPush = useMutation({
    mutationFn: () => api.sendTestNotification(userId as string),
    onSuccess: (result) =>
      notify('Test sent', `${result.sent} notification(s) delivered, ${result.failed} failed.`),
    onError: (mutationError: Error) => notify('Could not send', mutationError.message),
  });

  if (isLoading) return <Screen><LoadingState /></Screen>;
  if (error || !profile) {
    return (
      <Screen>
        <ErrorState error={error} />
      </Screen>
    );
  }

  const toggle = (list: string[], value: string) =>
    list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];

  const saveDetails = async () => {
    await updateName(name.trim());
    await updateProfile({
      headline: headline.trim(),
      location: location.trim(),
      sector: sector.trim(),
      skills: skills
        .split(',')
        .map((skill) => skill.trim())
        .filter(Boolean),
    });
    notify('Saved', 'Your profile has been updated — the briefing and job matches will use it right away.');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">You</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Everything here shapes what you see: the briefing ranking, job matches and the coach’s answers.
        </ThemedText>
      </View>

      <Card>
        <SectionHeader
          title="Account"
          subtitle={
            isSignedIn
              ? `Signed in as ${user?.email}`
              : 'Browsing without an account. Sign in to keep your saved items and coach history across devices.'
          }
        />

        {isSignedIn ? (
          <>
            <TextField
              label="Current password"
              value={currentPassword}
              onChangeText={setCurrentPassword}
              secureTextEntry
              textContentType="password"
            />
            <TextField
              label="New password"
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry
              textContentType="newPassword"
              hint="At least 10 characters, including a number or symbol."
            />
            <Button
              label="Change password"
              variant="secondary"
              disabled={currentPassword.length < 1 || newPassword.length < 10}
              onPress={async () => {
                try {
                  await changePassword(currentPassword, newPassword);
                  setCurrentPassword('');
                  setNewPassword('');
                  notify('Password changed', 'Your other sessions have been signed out.');
                } catch (caught) {
                  notify('Could not change it', caught instanceof Error ? caught.message : 'Unknown error');
                }
              }}
            />
            <Button
              label="Sign out"
              variant="ghost"
              onPress={async () => {
                await signOut();
                notify('Signed out', 'You can keep browsing — sign in again any time.');
              }}
            />
          </>
        ) : (
          <View style={styles.buttonRow}>
            <View style={styles.buttonHalf}>
              <Button label="Sign in" onPress={() => router.push('/sign-in')} />
            </View>
            <View style={styles.buttonHalf}>
              <Button label="Create account" variant="secondary" onPress={() => router.push('/sign-up')} />
            </View>
          </View>
        )}
      </Card>

      <Card>
        <SectionHeader title="About you" />
        <TextField label="Name" placeholder="What should we call you?" value={name} onChangeText={setName} />
        <TextField
          label="Current role or goal"
          placeholder="e.g. Care assistant moving into nursing"
          value={headline}
          onChangeText={setHeadline}
        />
        <TextField label="Sector" placeholder="e.g. Healthcare, Technology, Retail" value={sector} onChangeText={setSector} />
        <TextField label="Location" placeholder="e.g. Manchester" value={location} onChangeText={setLocation} />
        <TextField
          label="Skills"
          placeholder="Comma separated — e.g. Excel, safeguarding, React"
          hint="Used to score job matches and tailor CV feedback."
          value={skills}
          onChangeText={setSkills}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {UK_REGIONS.map((region) => (
            <Chip key={region} label={region} selected={location === region} onPress={() => setLocation(region)} />
          ))}
        </ScrollView>

        <Button label="Save details" onPress={saveDetails} loading={isSaving} />
      </Card>

      <Card>
        <SectionHeader title="Experience level" />
        <View style={styles.wrap}>
          {EXPERIENCE_LEVELS.map((level) => (
            <Chip
              key={level.id}
              label={level.label}
              selected={profile.experienceLevel === level.id}
              onPress={() => updateProfile({ experienceLevel: level.id })}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Topics you follow" subtitle="Drives what gets to the top of your briefing." />
        <View style={styles.wrap}>
          {TOPICS.map((topic) => (
            <Chip
              key={topic.id}
              label={`${topic.emoji} ${topic.label}`}
              selected={profile.topics.includes(topic.id)}
              onPress={() => updateProfile({ topics: toggle(profile.topics, topic.id) })}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Which describes you" subtitle="Used to pick the angle a story is summarised from." />
        <View style={styles.wrap}>
          {AUDIENCES.map((audience) => (
            <Chip
              key={audience.id}
              label={audience.label}
              selected={profile.audience.includes(audience.id)}
              onPress={() => updateProfile({ audience: toggle(profile.audience, audience.id) })}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader title="Job preferences" />
        <SwitchRow
          label="Remote or hybrid only"
          value={profile.remoteOnly}
          onValueChange={(value) => updateProfile({ remoteOnly: value })}
        />
        <ThemedText type="smallBold">Minimum salary</ThemedText>
        <View style={styles.wrap}>
          {[0, 25000, 30000, 40000, 50000, 65000].map((amount) => (
            <Chip
              key={amount}
              label={amount === 0 ? 'No minimum' : `£${amount / 1000}k`}
              selected={(profile.salaryMin ?? 0) === amount}
              onPress={() => updateProfile({ salaryMin: amount === 0 ? null : amount })}
            />
          ))}
        </View>
      </Card>

      <Card>
        <SectionHeader
          title="Notifications"
          subtitle={notificationsUnavailableReason() ?? 'A personalised briefing, pushed once a day.'}
        />
        <SwitchRow
          label="Daily briefing"
          description="Your top stories and any policy change that affects you."
          value={profile.notifications.enabled}
          onValueChange={(value) => updateProfile({ notifications: { ...profile.notifications, enabled: value } })}
        />
        <SwitchRow
          label="Job alerts"
          description="Include new vacancies that match your profile."
          value={profile.notifications.jobAlerts}
          onValueChange={(value) => updateProfile({ notifications: { ...profile.notifications, jobAlerts: value } })}
        />
        <SwitchRow
          label="Policy alerts"
          description="Government announcements in the areas you follow."
          value={profile.notifications.policyAlerts}
          onValueChange={(value) =>
            updateProfile({ notifications: { ...profile.notifications, policyAlerts: value } })
          }
        />

        <ThemedText type="smallBold">Delivery time</ThemedText>
        <View style={styles.wrap}>
          {DIGEST_HOURS.map((hour) => (
            <Chip
              key={hour}
              label={hourLabel(hour)}
              selected={profile.notifications.digestHour === hour}
              onPress={() => updateProfile({ notifications: { ...profile.notifications, digestHour: hour } })}
            />
          ))}
        </View>

        {preview.data ? (
          <ThemedText type="small" themeColor="textSecondary">
            Next briefing at {hourLabel(preview.data.scheduledHour)} UK time ·{' '}
            {preview.data.devices > 0 ? `${preview.data.devices} device registered` : 'no device registered yet'} ·{' '}
            {preview.data.items.length} stories and {preview.data.jobs.length} job matches waiting.
          </ThemedText>
        ) : null}

        <View style={styles.buttonRow}>
          <View style={styles.buttonHalf}>
            <Button
              label="Send me a test"
              variant="secondary"
              onPress={() => testPush.mutate()}
              loading={testPush.isPending}
            />
          </View>
          <View style={styles.buttonHalf}>
            <Button
              label="Re-schedule reminder"
              variant="ghost"
              onPress={async () => {
                await scheduleDailyDigest(profile.notifications);
                const reason = notificationsUnavailableReason();
                notify(
                  reason ? 'Reminders unavailable' : 'Reminder set',
                  reason ?? `A local reminder will fire daily at ${hourLabel(profile.notifications.digestHour)}.`,
                );
              }}
            />
          </View>
        </View>
      </Card>

      <Card>
        <SectionHeader title="More" />
        <View style={styles.wrap}>
          <Chip label="🔖 Saved items" onPress={() => router.push('/saved')} />
          <Chip label="📰 Our sources" onPress={() => router.push('/sources')} />
          <Chip label="🔁 Redo onboarding" onPress={() => resetOnboarding().then(() => router.replace('/onboarding'))} />
        </View>
      </Card>

      <Card tone="flat">
        <SectionHeader title="Server" />
        <ThemedText type="small" themeColor="textSecondary">
          {isDevBuild ? `API: ${API_BASE_URL}` : 'Connected'}
        </ThemedText>
        {status.data ? (
          <ThemedText type="small" themeColor="textSecondary">
            {status.data.items} stories · {status.data.jobs} vacancies · {status.data.sources} sources · AI:{' '}
            {status.data.ai.mode}
            {status.data.ai.enabled ? ` (${status.data.ai.smartModel})` : ''} · job boards:{' '}
            {status.data.jobProviders.join(', ')}
          </ThemedText>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            {forAudience(
              'Not connected. The service may be starting up — try again shortly.',
              'Not connected. Start the API with “npm run dev” from the project root.',
            )}
          </ThemedText>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chipRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.four,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  buttonHalf: {
    flex: 1,
  },
});
