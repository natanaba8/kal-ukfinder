import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, SectionHeader } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { topicLabel } from '@/constants/taxonomy';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

export default function SourcesScreen() {
  const router = useRouter();
  const sources = useQuery({ queryKey: ['sources'], queryFn: api.sources, staleTime: 600_000 });

  const official = sources.data?.sources.filter((source) => source.kind === 'policy') ?? [];
  const news = sources.data?.sources.filter((source) => source.kind === 'news') ?? [];

  const renderGroup = (title: string, subtitle: string, group: typeof official) => (
    <View style={styles.list}>
      <SectionHeader title={title} subtitle={subtitle} />
      {group.map((source) => (
        <Card key={source.id} tone="flat">
          <ThemedText type="smallBold">{source.name}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {source.publisher}
          </ThemedText>
          {source.topics.length > 0 ? (
            <ChipRow>
              {source.topics.map((topic) => (
                <Chip key={topic} label={topicLabel(topic)} size="small" />
              ))}
            </ChipRow>
          ) : null}
        </Card>
      ))}
    </View>
  );

  return (
    <Screen>
      <View style={styles.topBar}>
        <Chip label="‹ Back" onPress={() => router.back()} />
      </View>

      <View style={styles.header}>
        <ThemedText type="subtitle">Where this comes from</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Kal-UKFinder only aggregates public feeds from named UK publishers and official bodies. Nothing is
          scraped, and every card links back to the original page.
        </ThemedText>
      </View>

      {sources.isLoading ? <LoadingState /> : null}
      {sources.error ? <ErrorState error={sources.error as Error} onRetry={() => sources.refetch()} /> : null}

      {official.length > 0
        ? renderGroup('Official', `${official.length} government and regulator feeds`, official)
        : null}
      {news.length > 0 ? renderGroup('Journalism', `${news.length} news and sector titles`, news) : null}
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
  list: {
    gap: Spacing.three,
  },
});
