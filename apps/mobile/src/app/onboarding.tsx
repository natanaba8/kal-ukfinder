import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TextField } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { LoadingState } from '@/components/ui/states';
import { AUDIENCES, EXPERIENCE_LEVELS, TOPICS, UK_REGIONS } from '@/constants/taxonomy';
import { Spacing } from '@/constants/theme';
import { hourLabel } from '@/lib/format';
import {
  notificationsSupported,
  notificationsUnavailableReason,
  requestPermission,
  scheduleDailyDigest,
} from '@/lib/notifications';
import { useSession } from '@/lib/session';

const STEPS = ['You', 'Interests', 'Alerts'] as const;
const DIGEST_HOURS = [6, 7, 8, 9, 12, 17, 19];

export default function OnboardingScreen() {
  const router = useRouter();
  const { updateProfile, updateName, completeOnboarding, isLoading, isSaving } = useSession();

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [headline, setHeadline] = useState('');
  const [location, setLocation] = useState('');
  const [experienceLevel, setExperienceLevel] = useState('');
  const [audience, setAudience] = useState<string[]>(['jobseekers']);
  const [topics, setTopics] = useState<string[]>(['jobs-market', 'skills-training']);
  const [digestHour, setDigestHour] = useState(8);
  const [wantsNotifications, setWantsNotifications] = useState(true);

  const toggle = (list: string[], value: string, setter: (next: string[]) => void) =>
    setter(list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value]);

  if (isLoading) {
    return (
      <Screen>
        <LoadingState label="Setting up your account…" />
      </Screen>
    );
  }

  const finish = async () => {
    if (name.trim()) await updateName(name.trim());
    await updateProfile({
      headline: headline.trim(),
      location: location.trim(),
      experienceLevel,
      audience,
      topics,
      notifications: {
        enabled: wantsNotifications,
        digestHour,
        jobAlerts: true,
        policyAlerts: true,
        weeklyReview: true,
      },
    });

    if (wantsNotifications && notificationsSupported) {
      await requestPermission();
      await scheduleDailyDigest({
        enabled: true,
        digestHour,
        jobAlerts: true,
        policyAlerts: true,
        weeklyReview: true,
      });
    }

    await completeOnboarding();
    router.replace('/');
  };

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="primary">
          KAL-UKFINDER
        </ThemedText>
        <ThemedText type="subtitle">UK jobs, policy and career news — in plain English</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Three quick questions so your briefing is about your situation, not everyone’s.
        </ThemedText>
      </View>

      <View style={styles.steps}>
        {STEPS.map((label, index) => (
          <Chip key={label} label={`${index + 1}. ${label}`} selected={step === index} onPress={() => setStep(index)} />
        ))}
      </View>

      {step === 0 ? (
        <Card>
          <SectionHeader title="About you" subtitle="All optional — you can change it later." />
          <TextField label="Your name" placeholder="First name is fine" value={name} onChangeText={setName} />
          <TextField
            label="What are you doing right now?"
            placeholder="e.g. Looking for my first job after college"
            value={headline}
            onChangeText={setHeadline}
          />
          <TextField label="Where are you?" placeholder="e.g. Leeds" value={location} onChangeText={setLocation} />
          <View style={styles.wrap}>
            {UK_REGIONS.slice(0, 8).map((region) => (
              <Chip key={region} label={region} selected={location === region} onPress={() => setLocation(region)} />
            ))}
          </View>

          <ThemedText type="smallBold">Where are you in your career?</ThemedText>
          <View style={styles.wrap}>
            {EXPERIENCE_LEVELS.map((level) => (
              <Chip
                key={level.id}
                label={level.label}
                selected={experienceLevel === level.id}
                onPress={() => setExperienceLevel(level.id)}
              />
            ))}
          </View>

          <Button label="Next" onPress={() => setStep(1)} />
        </Card>
      ) : null}

      {step === 1 ? (
        <Card>
          <SectionHeader title="What should we watch for you?" subtitle="Pick as many as you like." />
          <ThemedText type="smallBold">Which describes you?</ThemedText>
          <View style={styles.wrap}>
            {AUDIENCES.map((entry) => (
              <Chip
                key={entry.id}
                label={entry.label}
                selected={audience.includes(entry.id)}
                onPress={() => toggle(audience, entry.id, setAudience)}
              />
            ))}
          </View>

          <ThemedText type="smallBold">Topics</ThemedText>
          <View style={styles.wrap}>
            {TOPICS.map((topic) => (
              <Chip
                key={topic.id}
                label={`${topic.emoji} ${topic.label}`}
                selected={topics.includes(topic.id)}
                onPress={() => toggle(topics, topic.id, setTopics)}
              />
            ))}
          </View>

          <Button label="Next" onPress={() => setStep(2)} disabled={topics.length === 0} />
        </Card>
      ) : null}

      {step === 2 ? (
        <Card>
          <SectionHeader
            title="Your daily briefing"
            subtitle={
              notificationsUnavailableReason() ??
              'One notification a day with what changed and what it means for you.'
            }
          />
          <View style={styles.wrap}>
            <Chip label="Yes, notify me" selected={wantsNotifications} onPress={() => setWantsNotifications(true)} />
            <Chip label="No thanks" selected={!wantsNotifications} onPress={() => setWantsNotifications(false)} />
          </View>

          {wantsNotifications ? (
            <>
              <ThemedText type="smallBold">What time?</ThemedText>
              <View style={styles.wrap}>
                {DIGEST_HOURS.map((hour) => (
                  <Chip
                    key={hour}
                    label={hourLabel(hour)}
                    selected={digestHour === hour}
                    onPress={() => setDigestHour(hour)}
                  />
                ))}
              </View>
            </>
          ) : null}

          <Button label="Start reading" onPress={finish} loading={isSaving} />
          <Button label="Skip for now" variant="ghost" onPress={finish} />
        </Card>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.two,
    paddingTop: Spacing.five,
  },
  steps: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
