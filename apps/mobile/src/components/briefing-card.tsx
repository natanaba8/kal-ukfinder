import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Badge, Card, HStack, Pressable, Text, VStack } from '@/components/ui/gs';
import { topicEmoji, topicLabel } from '@/constants/taxonomy';
import { relativeTime } from '@/lib/format';
import type { BriefingItem } from '@/lib/types';

/**
 * One briefing in the feed (pr.md §24), built with GlueStack UI: source,
 * headline, the bullet summary, and the "what this means for you" line the
 * whole product is arranged around.
 */
export function BriefingCard({ item, compact = false }: { item: BriefingItem; compact?: boolean }) {
  const router = useRouter();
  const isPolicy = item.kind === 'policy';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={item.headline}
      onPress={() => router.push({ pathname: '/item/[id]', params: { id: item.id } })}
    >
      <Card>
        <HStack className="items-center justify-between gap-2">
          <Badge
            label={isPolicy ? `OFFICIAL · ${item.source.name}` : item.source.name}
            tone={isPolicy ? 'accent' : 'brand'}
          />
          <Text size="xs" tone="faint">
            {relativeTime(item.publishedAt)}
            {item.importance >= 4 ? ' · Major' : ''}
          </Text>
        </HStack>

        <Text size="md" bold className="leading-6">
          {item.headline}
        </Text>

        {!compact && item.summary.length > 0 ? (
          <VStack space="sm">
            {item.summary.slice(0, 3).map((bullet, index) => (
              <HStack key={index} space="sm">
                <Text size="sm" tone="faint">
                  •
                </Text>
                <Text size="sm" tone="dim" className="flex-1">
                  {bullet}
                </Text>
              </HStack>
            ))}
          </VStack>
        ) : null}

        {!compact && item.impact ? (
          <VStack space="xs">
            <Text size="xs" tone="brand" bold>
              What this means for you
            </Text>
            <Text size="sm">{item.impact}</Text>
          </VStack>
        ) : null}

        {item.topics.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {item.topics.slice(0, 3).map((topic) => (
              <Badge
                key={topic}
                label={`${topicEmoji(topic)} ${topicLabel(topic)}`}
                tone={item.matchedTopics?.includes(topic) ? 'good' : 'neutral'}
              />
            ))}
          </View>
        ) : null}
      </Card>
    </Pressable>
  );
}
