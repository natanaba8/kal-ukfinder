import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ExternalLink } from '@/components/external-link';
import { JobCard } from '@/components/job-card';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, SectionHeader } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { contractLabel, fullDate, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';

export default function JobScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();

  const detail = useQuery({
    queryKey: ['job', id, userId],
    queryFn: () => api.job(id, userId ?? undefined),
  });

  const saved = useQuery({
    queryKey: ['saved', userId],
    queryFn: () => api.saved(userId as string),
    enabled: Boolean(userId),
  });

  const isSaved = Boolean(saved.data?.jobs.some((entry) => entry.id === id));

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (isSaved) await api.unsave(userId as string, 'job', id);
      else await api.save(userId as string, 'job', id);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['saved', userId] }),
  });

  if (detail.isLoading) {
    return (
      <Screen>
        <LoadingState />
      </Screen>
    );
  }

  if (detail.error || !detail.data) {
    return (
      <Screen>
        <Button label="Back" variant="ghost" onPress={() => router.back()} />
        <ErrorState error={detail.error as Error} onRetry={() => detail.refetch()} />
      </Screen>
    );
  }

  const { job, match, similar } = detail.data;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Chip label="‹ Back" onPress={() => router.back()} />
        <Chip
          label={isSaved ? '🔖 Saved' : '🔖 Save'}
          tone={isSaved ? 'success' : 'neutral'}
          onPress={() => toggleSave.mutate()}
        />
      </View>

      <View style={styles.header}>
        <ThemedText type="subtitle" style={styles.title}>
          {job.title}
        </ThemedText>
        <ThemedText type="default" themeColor="textSecondary">
          {job.company} · {job.location}
        </ThemedText>
        <ThemedText type="smallBold" themeColor="primary">
          {job.salaryText}
        </ThemedText>
        <ChipRow>
          {job.remote ? <Chip label="Remote / hybrid" tone="success" size="small" /> : null}
          {job.employmentType || job.contractType ? (
            <Chip label={contractLabel(job.employmentType ?? job.contractType)} size="small" />
          ) : null}
          {job.category ? <Chip label={job.category} size="small" /> : null}
          {job.deadline ? (
            <Chip
              label={`Closes ${relativeTime(job.deadline)}`}
              tone={new Date(job.deadline).getTime() - Date.now() < 7 * 86_400_000 ? 'warning' : 'neutral'}
              size="small"
            />
          ) : null}
          {job.isSample ? <Chip label="Sample listing" tone="warning" size="small" /> : null}
        </ChipRow>
        <ThemedText type="small" themeColor="textMuted">
          Posted {fullDate(job.postedAt)} · {relativeTime(job.postedAt)} · via {job.source}
        </ThemedText>
      </View>

      {job.deadline ? (
        <Card tone="flat">
          <SectionHeader title="Closing date" />
          <ThemedText type="default">{fullDate(job.deadline)}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {new Date(job.deadline).getTime() < Date.now()
              ? 'This vacancy has closed — the advert may still be readable.'
              : `Applications close ${relativeTime(job.deadline)}.`}
          </ThemedText>
        </Card>
      ) : null}

      {match ? (
        <Card tone="flat">
          <SectionHeader title={`${match.score}% match for you`} subtitle="Based on your profile in the You tab." />
          {match.reasons.length > 0 ? (
            <View style={styles.list}>
              {match.reasons.map((reason) => (
                <ThemedText key={reason} type="small">
                  ✓ {reason}
                </ThemedText>
              ))}
            </View>
          ) : null}
          {match.gaps.length > 0 ? (
            <View style={styles.list}>
              {match.gaps.map((gap) => (
                <ThemedText key={gap} type="small" themeColor="warning">
                  ! {gap}
                </ThemedText>
              ))}
            </View>
          ) : null}
        </Card>
      ) : null}

      {job.description ? (
        <Card>
          <SectionHeader title="The role" />
          <ThemedText type="small" style={styles.description}>
            {job.description}
          </ThemedText>
        </Card>
      ) : null}

      {job.requirements ? (
        <Card>
          <SectionHeader title="What they are asking for" />
          <ThemedText type="small" style={styles.description}>
            {job.requirements}
          </ThemedText>
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Apply" />
        {job.isSample ? (
          <ThemedText type="small" themeColor="textSecondary">
            This is an illustrative listing bundled with the app, not a live advert. The link searches
            Find a job on GOV.UK for the same role instead.
          </ThemedText>
        ) : null}
        <ExternalLink href={job.url as `https://${string}`}>
          <ThemedText type="smallBold" themeColor="primary">
            Open the advert ↗
          </ThemedText>
        </ExternalLink>
        <Button
          label="Prep for this interview"
          variant="secondary"
          onPress={() => router.push({ pathname: '/interview', params: { role: job.title, employer: job.company } })}
        />
        <Button
          label="Tailor my CV to this"
          variant="ghost"
          onPress={() =>
            router.push({ pathname: '/cv-review', params: { role: job.title, advert: job.description.slice(0, 4000) } })
          }
        />
      </Card>

      {similar.length > 0 ? (
        <View style={styles.list}>
          <SectionHeader title="Similar vacancies" />
          {similar.map((entry) => (
            <JobCard key={entry.id} job={entry} />
          ))}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: Spacing.two,
  },
  header: {
    gap: Spacing.two,
  },
  title: {
    fontSize: 26,
    lineHeight: 32,
  },
  description: {
    lineHeight: 21,
  },
  list: {
    gap: Spacing.three,
  },
});
