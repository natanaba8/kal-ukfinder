import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { BriefingCard } from '@/components/briefing-card';
import { JobCard } from '@/components/job-card';
import { ThemedText } from '@/components/themed-text';
import { SectionHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

export default function SavedScreen() {
  const router = useRouter();
  const { userId, isSignedIn } = useSession();
  const [tab, setTab] = useState<'all' | 'jobs' | 'briefings'>('all');

  const saved = useQuery({
    queryKey: ['saved', userId],
    queryFn: () => api.saved(userId as string),
    enabled: Boolean(userId),
  });

  const items = tab === 'jobs' ? [] : (saved.data?.items ?? []);
  const jobs = tab === 'briefings' ? [] : (saved.data?.jobs ?? []);
  const totalSaved = (saved.data?.items.length ?? 0) + (saved.data?.jobs.length ?? 0);

  return (
    <Screen onRefresh={() => saved.refetch()} refreshing={saved.isRefetching}>
      <View style={styles.topBar}>
        <Chip label="‹ Back" onPress={() => router.back()} />
      </View>

      <View style={styles.header}>
        <ThemedText type="subtitle">Saved</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {isSignedIn
            ? 'Briefings and vacancies you bookmarked, synced to your account.'
            : 'Briefings and vacancies you bookmarked on this device. Sign in from the You tab to keep them.'}
        </ThemedText>
      </View>

      {totalSaved > 0 ? (
        <View style={styles.tabs}>
          <Chip label={`All (${totalSaved})`} selected={tab === 'all'} onPress={() => setTab('all')} />
          <Chip
            label={`Vacancies (${saved.data?.jobs.length ?? 0})`}
            selected={tab === 'jobs'}
            onPress={() => setTab('jobs')}
          />
          <Chip
            label={`Briefings (${saved.data?.items.length ?? 0})`}
            selected={tab === 'briefings'}
            onPress={() => setTab('briefings')}
          />
        </View>
      ) : null}

      {saved.isLoading ? <LoadingState /> : null}
      {saved.error ? <ErrorState error={saved.error as Error} onRetry={() => saved.refetch()} /> : null}

      {!saved.isLoading && items.length === 0 && jobs.length === 0 ? (
        <EmptyState
          title="Nothing saved yet"
          body="Tap the bookmark on any briefing or vacancy and it will show up here."
        />
      ) : null}

      {items.length > 0 ? (
        <View style={styles.list}>
          <SectionHeader title="Briefings" subtitle={`${items.length} saved`} />
          {items.map((item) => (
            <BriefingCard key={item.id} item={item} compact />
          ))}
        </View>
      ) : null}

      {jobs.length > 0 ? (
        <View style={styles.list}>
          <SectionHeader title="Vacancies" subtitle={`${jobs.length} saved`} />
          {jobs.map((job) => (
            <JobCard key={job.id} job={job} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    paddingTop: Spacing.two,
  },
  header: {
    gap: Spacing.one,
  },
  tabs: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  list: {
    gap: Spacing.three,
  },
});
