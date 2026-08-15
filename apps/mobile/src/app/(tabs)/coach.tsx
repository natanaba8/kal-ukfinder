import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Chip } from '@/components/ui/chip';
import { TextField } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ErrorState, LoadingState } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { CoachMessage } from '@/lib/types';

const STARTERS = [
  'How do I explain a two-year gap on my CV?',
  'What should I ask at the end of an interview?',
  'How do I move into tech from retail?',
  'What support can I claim while job hunting?',
  'How do I negotiate a higher starting salary?',
];

/** Group the flat message log into question/answer pairs, newest first. */
const toExchanges = (messages: CoachMessage[]) => {
  const exchanges: { question: CoachMessage | null; answer: CoachMessage }[] = [];
  messages.forEach((message, index) => {
    if (message.role !== 'assistant') return;
    const previous = messages[index - 1];
    exchanges.push({ question: previous?.role === 'user' ? previous : null, answer: message });
  });
  return exchanges.reverse();
};

export default function CoachScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { userId } = useSession();
  const [question, setQuestion] = useState('');

  const aiStatus = useQuery({ queryKey: ['ai-status'], queryFn: api.aiStatus, staleTime: 300_000 });

  const thread = useQuery({
    queryKey: ['thread', userId],
    queryFn: () => api.thread(userId as string),
    enabled: Boolean(userId),
  });

  const ask = useMutation({
    mutationFn: (text: string) => api.ask({ userId: userId ?? undefined, question: text }),
    onSuccess: () => {
      setQuestion('');
      queryClient.invalidateQueries({ queryKey: ['thread', userId] });
    },
  });

  const clear = useMutation({
    mutationFn: () => api.clearThread(userId as string),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['thread', userId] }),
  });

  const exchanges = useMemo(() => toExchanges(thread.data?.messages ?? []), [thread.data?.messages]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (trimmed.length < 3 || ask.isPending) return;
    ask.mutate(trimmed);
  };

  return (
    <Screen>
      <View style={styles.header}>
        <ThemedText type="subtitle">Career coach</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Ask anything about UK jobs, applications, training or your rights at work. Answers use your
          profile and today’s briefings for context.
        </ThemedText>
      </View>

      <View style={styles.toolRow}>
        <Chip label="📄 CV review" tone="primary" onPress={() => router.push('/cv-review')} />
        <Chip label="🎤 Interview prep" tone="primary" onPress={() => router.push('/interview')} />
      </View>

      <Card>
        <TextField
          label="Your question"
          placeholder="e.g. I have been made redundant — what should I do first?"
          value={question}
          onChangeText={setQuestion}
          area
          onSubmitEditing={() => send(question)}
        />
        <Button
          label={ask.isPending ? 'Thinking…' : 'Ask the coach'}
          onPress={() => send(question)}
          loading={ask.isPending}
          disabled={question.trim().length < 3}
        />
        {ask.error ? <ErrorState error={ask.error as Error} /> : null}
      </Card>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {STARTERS.map((starter) => (
          <Chip key={starter} label={starter} onPress={() => send(starter)} />
        ))}
      </ScrollView>

      {thread.isLoading ? <LoadingState label="Loading your conversation…" /> : null}

      {exchanges.length > 0 ? (
        <View style={styles.list}>
          <SectionHeader
            title="Your conversation"
            subtitle="Newest first"
            action={<Chip label="Clear" size="small" onPress={() => clear.mutate()} />}
          />
          {exchanges.map(({ question: asked, answer }) => (
            <Card key={answer.id}>
              {asked ? (
                <ThemedText type="smallBold" themeColor="primary">
                  {asked.content}
                </ThemedText>
              ) : null}
              <Divider />
              <ThemedText type="small" style={styles.answer}>
                {answer.content}
              </ThemedText>

              {answer.meta?.checkWith ? (
                <ThemedText type="small" themeColor="warning">
                  Check with: {answer.meta.checkWith}
                </ThemedText>
              ) : null}

              {answer.meta?.followUps && answer.meta.followUps.length > 0 ? (
                <View style={styles.followUps}>
                  {answer.meta.followUps.map((followUp) => (
                    <Chip key={followUp} label={followUp} size="small" onPress={() => send(followUp)} />
                  ))}
                </View>
              ) : null}

              <ThemedText type="small" themeColor="textMuted">
                {relativeTime(answer.createdAt)} · {answer.meta?.model ?? 'rule-based'}
              </ThemedText>
            </Card>
          ))}
        </View>
      ) : null}

      <Card tone="flat">
        <ThemedText type="smallBold">
          {aiStatus.data?.enabled ? 'How this works' : 'Running without Gemini'}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {aiStatus.data?.note ??
            'Answers are generated and can be wrong. For anything legal, visa or benefits related, confirm with ACAS, Citizens Advice or GOV.UK before acting.'}
        </ThemedText>
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  toolRow: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  chipRow: {
    gap: Spacing.two,
    paddingVertical: Spacing.one,
    paddingRight: Spacing.four,
  },
  list: {
    gap: Spacing.three,
  },
  answer: {
    lineHeight: 22,
  },
  followUps: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
});
