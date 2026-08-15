import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BriefingCard } from '@/components/briefing-card';
import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/states';
import { TOPICS, topicEmoji, topicLabel } from '@/constants/taxonomy';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

const QUICK_ACTIONS = [
  { label: 'Ask the coach', href: '/coach', icon: '💬' },
  { label: 'Review my CV', href: '/cv-review', icon: '📄' },
  { label: 'Interview prep', href: '/interview', icon: '🎤' },
  { label: 'Saved', href: '/saved', icon: '🔖' },
] as const;

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

export default function BriefingScreen() {
  const router = useRouter();
  const { userId, user, profile } = useSession();
  const [topicFilter, setTopicFilter] = useState<string | null>(null);

  const feed = useQuery({
    queryKey: ['feed', userId, topicFilter],
    queryFn: () =>
      api.feed({
        userId: topicFilter ? undefined : (userId ?? undefined),
        topics: topicFilter ?? undefined,
        pageSize: 40,
      }),
    enabled: Boolean(userId),
  });

  const status = useQuery({ queryKey: ['status'], queryFn: api.status, staleTime: 300_000 });

  // Show the user's own topics first, then the rest of the taxonomy.
  const orderedTopics = useMemo(() => {
    const chosen = new Set(profile?.topics ?? []);
    return [...TOPICS].sort((a, b) => Number(chosen.has(b.id)) - Number(chosen.has(a.id)));
  }, [profile?.topics]);

  const items = feed.data?.items ?? [];
  const lead = items[0];
  const rest = items.slice(1);

  return (
    <Screen onRefresh={() => feed.refetch()} refreshing={feed.isRefetching}>
      <View style={styles.header}>
        <ThemedText type="small" themeColor="textSecondary">
          {greeting()}
          {user?.displayName ? `, ${user.displayName}` : ''} · {new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}
        </ThemedText>
        <ThemedText type="subtitle">Your UK briefing</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {feed.data?.personalised
            ? 'Ranked for the topics you follow, newest first.'
            : 'Latest from every trusted source we track.'}
          {status.data ? ` ${status.data.sources} sources · ${status.data.items} stories.` : ''}
        </ThemedText>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        {QUICK_ACTIONS.map((action) => (
          <Chip
            key={action.href}
            label={`${action.icon}  ${action.label}`}
            tone="primary"
            onPress={() => router.push(action.href)}
          />
        ))}
      </ScrollView>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.quickRow}>
        <Chip label="For you" selected={topicFilter === null} onPress={() => setTopicFilter(null)} />
        {orderedTopics.map((topic) => (
          <Chip
            key={topic.id}
            label={`${topic.emoji} ${topic.label}`}
            selected={topicFilter === topic.id}
            onPress={() => setTopicFilter(topicFilter === topic.id ? null : topic.id)}
          />
        ))}
      </ScrollView>

      {feed.isLoading ? <LoadingState label="Gathering today's briefing…" /> : null}
      {feed.error ? <ErrorState error={feed.error as Error} onRetry={() => feed.refetch()} /> : null}

      {!feed.isLoading && items.length === 0 ? (
        <EmptyState
          title="Nothing here yet"
          body={
            topicFilter
              ? `No recent stories tagged ${topicLabel(topicFilter)}. Try another topic or pull to refresh.`
              : 'The server has not ingested any stories yet. Run "npm run ingest" in the server folder, or pull to refresh in a minute.'
          }
        />
      ) : null}

      {lead ? (
        <View style={styles.section}>
          <SectionHeader
            title={feed.data?.personalised ? 'Top for you' : 'Latest'}
            subtitle={
              lead.matchedTopics && lead.matchedTopics.length > 0
                ? `Matches ${lead.matchedTopics.map(topicLabel).join(', ')}`
                : undefined
            }
          />
          <BriefingCard item={lead} />
        </View>
      ) : null}

      {rest.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="More today" subtitle={`${rest.length} more stories`} />
          {rest.map((item) => (
            <BriefingCard key={item.id} item={item} />
          ))}
        </View>
      ) : null}

      {status.data && !status.data.ai.enabled ? (
        <Card tone="flat">
          <ThemedText type="smallBold">Running without Gemini</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Summaries and coaching are coming from the built-in rule-based engine. Add GEMINI_API_KEY to
            server/.env for AI-written briefings, CV rewrites and conversational answers.
          </ThemedText>
        </Card>
      ) : null}

      {profile && profile.topics.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader title="You follow" action={<Chip label="Edit" size="small" onPress={() => router.push('/profile')} />} />
          <ChipRow>
            {profile.topics.map((topic) => (
              <Chip key={topic} label={`${topicEmoji(topic)} ${topicLabel(topic)}`} size="small" tone="primary" />
            ))}
          </ChipRow>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  quickRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.four,
  },
  section: {
    gap: Spacing.three,
  },
});
