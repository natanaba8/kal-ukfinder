import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Badge, Card, HStack, Pressable, Text, VStack } from '@/components/ui/gs';
import { contractLabel, relativeTime } from '@/lib/format';
import type { Job } from '@/lib/types';

/**
 * A vacancy in the Jobs list (pr.md §23), built with GlueStack UI.
 * Shared with the Saved screen, which is why it stays a standalone component.
 */
export function JobCard({ job }: { job: Job }) {
  const router = useRouter();
  const match = job.match;

  const closingSoon =
    job.deadline && new Date(job.deadline).getTime() - Date.now() < 7 * 86_400_000;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${job.title} at ${job.company}, ${job.location}`}
      onPress={() => router.push({ pathname: '/job/[id]', params: { id: job.id } })}
    >
      <Card>
        <HStack className="items-start justify-between gap-3">
          <VStack space="xs" className="flex-1">
            <Text size="md" bold>
              {job.title}
            </Text>
            <Text tone="dim">
              {job.company} · {job.location}
            </Text>
          </VStack>

          {match ? (
            <Badge
              label={`${match.score}%`}
              tone={match.score >= 60 ? 'good' : match.score >= 35 ? 'brand' : 'neutral'}
            />
          ) : null}
        </HStack>

        <Text bold tone="brand">
          {job.salaryText}
        </Text>

        <View className="flex-row flex-wrap gap-2">
          {job.remote ? <Badge label="Remote / hybrid" tone="good" /> : null}
          {job.employmentType || job.contractType ? (
            <Badge label={contractLabel(job.employmentType ?? job.contractType)} />
          ) : null}
          {job.category ? <Badge label={job.category} /> : null}
          {job.deadline ? (
            <Badge label={`Closes ${relativeTime(job.deadline)}`} tone={closingSoon ? 'warn' : 'neutral'} />
          ) : null}
          {job.isSample ? <Badge label="Sample listing" tone="warn" /> : null}
        </View>

        {match && match.reasons.length > 0 ? (
          <Text size="xs" tone="dim">
            {match.reasons.slice(0, 2).join(' · ')}
          </Text>
        ) : null}

        <Text size="xs" tone="faint">
          Posted {relativeTime(job.postedAt)}
        </Text>
      </Card>
    </Pressable>
  );
}
