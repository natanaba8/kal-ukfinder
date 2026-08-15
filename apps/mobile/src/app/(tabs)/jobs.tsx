import { useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EMPTY_JOB_FILTERS, FilterSheet, type JobFilters } from '@/components/filter-sheet';
import { JobCard } from '@/components/job-card';
import {
  Button,
  ButtonSpinner,
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
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import type { Job, JobMatch } from '@/lib/types';

const PAGE_SIZE = 20;

/** The Jobs feed (pr.md §23), built with GlueStack UI. */
export default function JobsScreen() {
  const insets = useSafeAreaInsets();
  const { userId, profile, isSignedIn } = useSession();

  const [search, setSearch] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [filters, setFilters] = useState<JobFilters>(EMPTY_JOB_FILTERS);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [rank, setRank] = useState<'recent' | 'match'>('match');
  const [aiMatches, setAiMatches] = useState<(JobMatch & { job: Job })[] | null>(null);

  const filterOptions = useQuery({ queryKey: ['job-filters'], queryFn: api.jobFilters, staleTime: 600_000 });

  /** Infinite scroll rather than a fixed page — pr.md §36 "don't load thousands". */
  const jobs = useInfiniteQuery({
    queryKey: ['jobs', userId, submitted, filters, rank],
    initialPageParam: 1,
    queryFn: ({ pageParam }) =>
      api.jobs({
        userId: userId ?? undefined,
        search: submitted || undefined,
        category: filters.category,
        location: filters.location,
        organization: filters.organization,
        employmentType: filters.employmentType,
        remote: filters.remote || undefined,
        openOnly: filters.openOnly || undefined,
        salaryMin: filters.salaryMin || undefined,
        rank,
        page: pageParam,
        pageSize: PAGE_SIZE,
      }),
    getNextPageParam: (lastPage) => (lastPage.page < lastPage.pages ? lastPage.page + 1 : undefined),
  });

  const match = useMutation({
    mutationFn: () => api.matchJobs(userId as string, 10),
    onSuccess: (response) => setAiMatches(response.matches),
  });

  const rows = useMemo(() => jobs.data?.pages.flatMap((page) => page.jobs) ?? [], [jobs.data]);
  const total = jobs.data?.pages[0]?.total ?? 0;

  const activeFilters = [
    filters.category,
    filters.location,
    filters.organization,
    filters.employmentType,
    filters.remote ? 'Remote' : undefined,
    filters.salaryMin ? `£${filters.salaryMin / 1000}k+` : undefined,
  ].filter(Boolean) as string[];

  const header = (
    <VStack space="lg" className="w-full max-w-[760px] px-4 pt-2">
      <VStack space="xs">
        <Heading>Jobs</Heading>
        <Text tone="dim">
          {profile?.location
            ? `UK vacancies, weighted towards ${profile.location}.`
            : 'UK vacancies from every source configured on your server.'}
        </Text>
      </VStack>

      <Card tone="flat">
        <Input>
          <InputField
            value={search}
            onChangeText={setSearch}
            placeholder="Job title, skill or employer"
            returnKeyType="search"
            onSubmitEditing={() => setSubmitted(search.trim())}
          />
        </Input>

        <View className="flex-row flex-wrap gap-2">
          <Chip
            label={activeFilters.length > 0 ? `Filters (${activeFilters.length})` : 'Filters'}
            tone={activeFilters.length > 0 ? 'brand' : 'neutral'}
            onPress={() => setSheetOpen(true)}
          />
          <Chip label="Best match" selected={rank === 'match'} onPress={() => setRank('match')} />
          <Chip label="Most recent" selected={rank === 'recent'} onPress={() => setRank('recent')} />
        </View>

        {activeFilters.length > 0 ? (
          <View className="flex-row flex-wrap gap-2">
            {activeFilters.map((label) => (
              <Chip key={label} label={label} size="sm" tone="brand" />
            ))}
            <Chip label="Clear" size="sm" onPress={() => setFilters(EMPTY_JOB_FILTERS)} />
          </View>
        ) : null}

        <Button onPress={() => setSubmitted(search.trim())} isDisabled={jobs.isFetching && !jobs.isFetchingNextPage}>
          {jobs.isFetching && !jobs.isFetchingNextPage ? <ButtonSpinner /> : null}
          <ButtonText>Search</ButtonText>
        </Button>
      </Card>

      <Card>
        <VStack space="xs">
          <Text size="xs" bold tone="dim">
            AI SHORTLIST
          </Text>
          <Text size="xs" tone="dim">
            Scores the current vacancies against your profile and names the gaps.
          </Text>
        </VStack>

        <Button variant="outline" onPress={() => match.mutate()} isDisabled={match.isPending || !userId}>
          {match.isPending ? <ButtonSpinner /> : null}
          <ButtonText>{aiMatches ? 'Re-run the shortlist' : 'Match me to these jobs'}</ButtonText>
        </Button>

        {match.error ? (
          <Text size="sm" tone="accent">
            {(match.error as Error).message}
          </Text>
        ) : null}

        {aiMatches?.slice(0, 5).map((entry) => (
          <VStack key={entry.id} space="xs">
            <Text size="sm" bold>
              {entry.score}% · {entry.job.title}
            </Text>
            {entry.reasons.length > 0 ? (
              <Text size="xs" tone="dim">
                Why: {entry.reasons.join('; ')}
              </Text>
            ) : null}
            {entry.gaps.length > 0 ? (
              <Text size="xs" tone="warn">
                Gaps: {entry.gaps.join('; ')}
              </Text>
            ) : null}
          </VStack>
        ))}

        {!isSignedIn ? (
          <Text size="xs" tone="faint">
            Sign in from the You tab to keep your shortlist and saved jobs across devices.
          </Text>
        ) : null}
      </Card>

      {total > 0 ? (
        <HStack className="items-end justify-between">
          <Text size="xs" bold tone="dim">
            {total.toLocaleString('en-GB')} VACANCIES
          </Text>
          {jobs.data?.pages[0]?.personalised ? (
            <Text size="xs" tone="faint">
              Match scores use your profile
            </Text>
          ) : null}
        </HStack>
      ) : null}
    </VStack>
  );

  return (
    <GsRoot>
      <FlatList
        style={{ paddingTop: insets.top }}
        data={rows}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <GsListItem>
            <JobCard job={item} />
          </GsListItem>
        )}
        ListHeaderComponent={header}
        contentContainerStyle={{ alignItems: 'center', paddingBottom: 48 }}
        onEndReachedThreshold={0.6}
        onEndReached={() => {
          if (jobs.hasNextPage && !jobs.isFetchingNextPage) jobs.fetchNextPage();
        }}
        refreshing={jobs.isRefetching}
        onRefresh={() => jobs.refetch()}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <GsListItem>
            {jobs.isLoading ? (
              <VStack space="sm" className="items-center py-12">
                <ActivityIndicator color="#1D4E89" />
                <Text tone="dim">Searching vacancies…</Text>
              </VStack>
            ) : jobs.error ? (
              <Card>
                <Text bold tone="accent">
                  Something went wrong
                </Text>
                <Text tone="dim">{(jobs.error as Error).message}</Text>
                <Button variant="outline" onPress={() => jobs.refetch()}>
                  <ButtonText>Try again</ButtonText>
                </Button>
              </Card>
            ) : (
              <Card tone="flat">
                <Text bold>No vacancies match</Text>
                <Text tone="dim">
                  Widen the search — clear a filter, drop the salary floor, or search a different job title.
                </Text>
              </Card>
            )}
          </GsListItem>
        }
        ListFooterComponent={
          jobs.isFetchingNextPage ? (
            <ActivityIndicator className="py-6" color="#1D4E89" />
          ) : rows.length > 0 && !jobs.hasNextPage ? (
            <Text size="xs" tone="faint" className="py-6 text-center">
              That is every vacancy matching this search.
            </Text>
          ) : null
        }
      />

      <FilterSheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        filters={filters}
        onChange={setFilters}
        options={{
          categories: filterOptions.data?.categories ?? [],
          locations: filterOptions.data?.locations ?? [],
          organizations: filterOptions.data?.organizations ?? [],
        }}
      />
    </GsRoot>
  );
}
