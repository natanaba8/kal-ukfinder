import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui/button';
import { Card, Divider, SectionHeader } from '@/components/ui/card';
import { Chip, ChipRow } from '@/components/ui/chip';
import { TextField } from '@/components/ui/field';
import { Screen } from '@/components/ui/screen';
import { ErrorState } from '@/components/ui/states';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

const STAGES = ['Phone screen', 'First interview', 'Assessment centre', 'Final interview'];

export default function InterviewScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const params = useLocalSearchParams<{ role?: string; employer?: string }>();

  const [role, setRole] = useState(params.role ?? '');
  const [employer, setEmployer] = useState(params.employer ?? '');
  const [stage, setStage] = useState(STAGES[1]);

  // Practice panel state.
  const [practiceQuestion, setPracticeQuestion] = useState('');
  const [practiceAnswer, setPracticeAnswer] = useState('');

  const prep = useMutation({
    mutationFn: () =>
      api.interviewPrep({
        userId: userId ?? undefined,
        role: role.trim(),
        employer: employer.trim() || undefined,
        stage,
      }),
  });

  const feedback = useMutation({
    mutationFn: () =>
      api.answerFeedback({ question: practiceQuestion, answer: practiceAnswer, role: role.trim() || undefined }),
  });

  const plan = prep.data;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Chip label="‹ Back" onPress={() => router.back()} />
      </View>

      <View style={styles.header}>
        <ThemedText type="subtitle">Interview prep</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Likely questions, what a strong answer contains, and a practice panel that scores your answers
          against how UK interviewers actually mark them.
        </ThemedText>
      </View>

      <Card>
        <TextField label="Role" placeholder="e.g. Data Analyst" value={role} onChangeText={setRole} />
        <TextField label="Employer (optional)" placeholder="e.g. NHS Trust" value={employer} onChangeText={setEmployer} />
        <ThemedText type="smallBold">Stage</ThemedText>
        <ChipRow>
          {STAGES.map((entry) => (
            <Chip key={entry} label={entry} selected={stage === entry} onPress={() => setStage(entry)} />
          ))}
        </ChipRow>
        <Button
          label={prep.isPending ? 'Preparing…' : 'Prepare me'}
          onPress={() => prep.mutate()}
          loading={prep.isPending}
          disabled={role.trim().length < 2}
        />
        {prep.error ? <ErrorState error={prep.error as Error} /> : null}
      </Card>

      {plan ? (
        <>
          <Card tone="flat">
            <SectionHeader title="What to expect" />
            <ThemedText type="small" style={styles.paragraph}>
              {plan.format}
            </ThemedText>
          </Card>

          <View style={styles.list}>
            <SectionHeader title="Questions to prepare" subtitle={`${plan.questions.length} likely questions`} />
            {plan.questions.map((entry, index) => (
              <Card key={`${entry.question}-${index}`}>
                <ChipRow>
                  <Chip label={entry.type} size="small" tone="primary" />
                </ChipRow>
                <ThemedText type="default" style={styles.question}>
                  {entry.question}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  Why they ask: {entry.whyAsked}
                </ThemedText>
                <Divider />
                <ThemedText type="smallBold" themeColor="primary">
                  A strong answer includes
                </ThemedText>
                {entry.strongAnswerContains.map((point) => (
                  <ThemedText key={point} type="small">
                    • {point}
                  </ThemedText>
                ))}
                <Button
                  label="Practise this one"
                  variant="ghost"
                  onPress={() => {
                    setPracticeQuestion(entry.question);
                    setPracticeAnswer('');
                    feedback.reset();
                  }}
                />
              </Card>
            ))}
          </View>

          <Card>
            <SectionHeader title="Ask them this" subtitle="The last scored moment of the interview" />
            {plan.questionsToAskThem.map((entry) => (
              <ThemedText key={entry} type="small">
                • {entry}
              </ThemedText>
            ))}
          </Card>

          <Card tone="flat">
            <SectionHeader title="Before the day" />
            {plan.preparationChecklist.map((entry) => (
              <ThemedText key={entry} type="small" themeColor="textSecondary">
                ☐ {entry}
              </ThemedText>
            ))}
          </Card>
        </>
      ) : null}

      <Card>
        <SectionHeader title="Practice panel" subtitle="Write an answer and get it scored" />
        <TextField
          label="Question"
          placeholder="Paste or pick a question above"
          value={practiceQuestion}
          onChangeText={setPracticeQuestion}
        />
        <TextField
          label="Your answer"
          placeholder="Answer in STAR order: situation, task, action, result…"
          value={practiceAnswer}
          onChangeText={setPracticeAnswer}
          area
        />
        <Button
          label={feedback.isPending ? 'Scoring…' : 'Score my answer'}
          onPress={() => feedback.mutate()}
          loading={feedback.isPending}
          disabled={practiceQuestion.trim().length < 5 || practiceAnswer.trim().length < 20}
        />
        {feedback.error ? <ErrorState error={feedback.error as Error} /> : null}

        {feedback.data ? (
          <>
            <Divider />
            <ThemedText type="smallBold">{feedback.data.score}/10</ThemedText>
            {feedback.data.whatWorked.map((entry) => (
              <ThemedText key={entry} type="small" themeColor="success">
                ✓ {entry}
              </ThemedText>
            ))}
            {feedback.data.whatToImprove.map((entry) => (
              <ThemedText key={entry} type="small" themeColor="warning">
                → {entry}
              </ThemedText>
            ))}
            {feedback.data.missingFromStar && feedback.data.missingFromStar.length > 0 ? (
              <ThemedText type="small" themeColor="textSecondary">
                Missing from STAR: {feedback.data.missingFromStar.join(', ')}
              </ThemedText>
            ) : null}
            <Divider />
            <ThemedText type="smallBold" themeColor="primary">
              Model answer
            </ThemedText>
            <ThemedText type="small" style={styles.paragraph}>
              {feedback.data.modelAnswer}
            </ThemedText>
          </>
        ) : null}
      </Card>
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
  question: {
    fontWeight: '700',
    lineHeight: 22,
  },
  paragraph: {
    lineHeight: 22,
  },
});
