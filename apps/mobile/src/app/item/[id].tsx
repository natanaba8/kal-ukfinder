import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { BriefingCard } from '@/components/briefing-card';
import { ExternalLink } from '@/components/external-link';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { audienceLabel, topicEmoji, topicLabel } from '@/constants/taxonomy';
import { Radius, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { fullDate, relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';

export default function ItemScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();

  const detail = useQuery({ queryKey: ['item', id], queryFn: () => api.item(id) });

  const saved = useQuery({
    queryKey: ['saved', userId],
    queryFn: () => api.saved(userId as string),
    enabled: Boolean(userId),
  });

  const isSaved = Boolean(saved.data?.items.some((entry) => entry.id === id));

  const toggleSave = useMutation({
    mutationFn: async () => {
      if (isSaved) await api.unsave(userId as string, 'item', id);
      else await api.save(userId as string, 'item', id);
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

  const { item, related } = detail.data;
  const isPolicy = item.kind === 'policy';

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
        <ChipRow>
          <Chip
            label={isPolicy ? `OFFICIAL · ${item.source.name}` : item.source.name}
            tone={isPolicy ? 'accent' : 'primary'}
            size="small"
          />
          {item.importance >= 4 ? <Chip label="Major update" tone="warning" size="small" /> : null}
        </ChipRow>

        <ThemedText type="subtitle" style={styles.headline}>
          {item.headline}
        </ThemedText>

        <ThemedText type="small" themeColor="textMuted">
          {fullDate(item.publishedAt)} · {relativeTime(item.publishedAt)}
          {item.author ? ` · ${item.author}` : ''} · {item.readingMinutes} min read
        </ThemedText>
      </View>

      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" transition={200} />
      ) : null}

      {item.summary.length > 0 ? (
        <Card>
          <SectionHeader title="The short version" />
          {item.summary.map((bullet, index) => (
            <View key={index} style={styles.bulletRow}>
              <ThemedText type="small" themeColor="primary">
                {index + 1}
              </ThemedText>
              <ThemedText type="small" style={styles.bulletText}>
                {bullet}
              </ThemedText>
            </View>
          ))}
        </Card>
      ) : null}

      {item.impact ? (
        <Card tone="flat">
          <SectionHeader title="What this means for you" />
          <ThemedText type="default" style={styles.impact}>
            {item.impact}
          </ThemedText>
          {item.action ? (
            <>
              <Divider />
              <ThemedText type="smallBold" themeColor="primary">
                Next step
              </ThemedText>
              <ThemedText type="small">{item.action}</ThemedText>
            </>
          ) : null}
        </Card>
      ) : null}

      <Card>
        <SectionHeader title="Original headline" />
        <ThemedText type="small" themeColor="textSecondary">
          {item.title}
        </ThemedText>
        {item.rawSummary ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.raw}>
            {item.rawSummary}
          </ThemedText>
        ) : null}
        <ExternalLink href={item.url as `https://${string}`}>
          <ThemedText type="smallBold" themeColor="primary">
            Read the full article at {item.source.name} ↗
          </ThemedText>
        </ExternalLink>
      </Card>

      <Card tone="flat">
        <SectionHeader title="Tagged" />
        <ChipRow>
          {item.topics.map((topic) => (
            <Chip key={topic} label={`${topicEmoji(topic)} ${topicLabel(topic)}`} size="small" tone="primary" />
          ))}
          {item.audience.map((audience) => (
            <Chip key={audience} label={audienceLabel(audience)} size="small" />
          ))}
        </ChipRow>
        <ThemedText type="small" themeColor="textMuted">
          Summarised by {item.aiModel === 'rule-based' ? 'the built-in summariser' : item.aiModel}. Always
          check the original before acting on anything that affects your money, visa or legal rights.
        </ThemedText>
      </Card>

      {related.length > 0 ? (
        <View style={styles.related}>
          <SectionHeader title="Related" subtitle="Same topics, recent" />
          {related.map((entry) => (
            <BriefingCard key={entry.id} item={entry} compact />
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
  headline: {
    fontSize: 26,
    lineHeight: 32,
  },
  image: {
    width: '100%',
    height: 180,
    borderRadius: Radius.large,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  bulletText: {
    flex: 1,
    lineHeight: 21,
  },
  impact: {
    lineHeight: 23,
  },
  raw: {
    lineHeight: 20,
  },
  related: {
    gap: Spacing.three,
  },
});
