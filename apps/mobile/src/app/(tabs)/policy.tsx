import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BriefingCard } from '@/components/briefing-card';
import {
  Button,
  ButtonText,
  Card,
  Chip,
  Heading,
  HStack,
  Input,
  InputField,
  Text,
  VStack,
} from '@/components/ui/gs';
import { GsListItem, GsRoot } from '@/components/ui/gs/screen';
import { TOPICS, topicLabel } from '@/constants/taxonomy';
import { api } from '@/lib/api';
import { forAudience } from '@/lib/audience';

const PAGE_SIZE = 20;

/** Topics that actually appear in government output — the rest would sit empty. */
const POLICY_TOPICS = TOPICS.filter((topic) =>
  [
    'benefits-welfare',
    'immigration-visas',
    'pay-rights',
    'education',
    'apprenticeships',
    'skills-training',
    'economy',
    'public-sector',
    'technology',
    'business',
  ].includes(topic.id),
);

/** The Policy feed (pr.md §24), built with GlueStack UI. */
export default function PolicyScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [topic, setTopic] = useState<string | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');

  const categories = useQuery({
    queryKey: ['policy-categories'],
    queryFn: api.policyCategories,
    staleTime: 600_000,
  });

  const policies = useInfiniteQuery({
    queryKey: ['policies', topic, category, submitted],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.policies({
        topics: topic ?? undefined,
        category: category ?? undefined,
        search: submitted || undefined,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined),
  });

  const items = useMemo(() => policies.data?.pages.flatMap((page) => page.items) ?? [], [policies.data]);
  const total = policies.data?.pages[0]?.total ?? 0;

  const header = (
    <VStack space="lg" className="w-full max-w-[760px] px-4 pt-2">
      <VStack space="xs">
        <Heading>Policy watch</Heading>
        <Text tone="dim">
          Official announcements from GOV.UK departments, the ONS and the Bank of England — summarised into what
          actually changes for you.
        </Text>
      </VStack>

      <Input>
        <InputField
          value={search}
          onChangeText={setSearch}
          placeholder="Search announcements"
          returnKeyType="search"
          onSubmitEditing={() => setSubmitted(search.trim())}
        />
      </Input>

      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View className="flex-row gap-2 pr-4">
          <Chip label="All departments" selected={topic === null} onPress={() => setTopic(null)} />
          {POLICY_TOPICS.map((entry) => (
            <Chip
              key={entry.id}
              label={`${entry.emoji} ${entry.label}`}
              selected={topic === entry.id}
              onPress={() => setTopic(topic === entry.id ? null : entry.id)}
            />
          ))}
        </View>
      </ScrollView>

      {categories.data && categories.data.categories.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View className="flex-row gap-2 pr-4">
            <Chip label="Any category" size="sm" selected={category === null} onPress={() => setCategory(null)} />
            {categories.data.categories.slice(0, 20).map((entry) => (
              <Chip
                key={entry.category}
                label={`${entry.category} (${entry.total})`}
                size="sm"
                selected={category === entry.category}
                onPress={() => setCategory(category === entry.category ? null : entry.category)}
              />
            ))}
          </View>
        </ScrollView>
      ) : null}

      {total > 0 ? (
        <HStack className="items-end justify-between">
          <Text size="xs" bold tone="dim">
            {total.toLocaleString('en-GB')} PUBLICATION{total === 1 ? '' : 'S'}
          </Text>
          <Chip label="Sources" size="sm" onPress={() => router.push('/sources')} />
        </HStack>
      ) : null}
    </VStack>
  );

  return (
    <GsRoot>
      <FlatList
        style={{ paddingTop: insets.top }}
        data={items}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GsListItem>
            <BriefingCard item={item} />
          </GsListItem>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 48 }}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (policies.hasNextPage && !policies.isFetchingNextPage) policies.fetchNextPage();
        }}
        refreshing={policies.isRefetching}
        onRefresh={() => policies.refetch()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <GsListItem>
            {policies.isLoading ? (
              <VStack space="sm" className="items-center py-12">
                <ActivityIndicator color="#1D4E89" />
                <Text tone="dim">Reading the latest announcements…</Text>
              </VStack>
            ) : policies.error ? (
              <Card>
                <Text bold tone="accent">
                  Something went wrong
                </Text>
                <Text tone="dim">{(policies.error as Error).message}</Text>
                <Button variant="outline" onPress={() => policies.refetch()}>
                  <ButtonText>Try again</ButtonText>
                </Button>
              </Card>
            ) : (
              <Card tone="flat">
                <Text bold>Nothing filed under that yet</Text>
                <Text tone="dim">
                  {topic
                    ? `No recent official publications tagged ${topicLabel(topic)}. Try another department or clear the filter.`
                    : forAudience(
                        'No official publications yet. Pull down to refresh in a minute.',
                        'No official publications stored yet. Pull to refresh once the server has collected a round.',
                      )}
                </Text>
              </Card>
            )}
          </GsListItem>
        }
        ListFooterComponent={
          <GsListItem>
            {policies.isFetchingNextPage ? <ActivityIndicator color="#1D4E89" /> : null}
            <Card tone="flat">
              <Text bold>How to read these</Text>
              <Text tone="dim">
                Every card links to the original publication. Summaries are generated and can miss nuance — for
                anything affecting your benefits, visa or legal rights, check the source page on GOV.UK before you act
                on it.
              </Text>
            </Card>
          </GsListItem>
        }
      />
    </GsRoot>
  );
}
