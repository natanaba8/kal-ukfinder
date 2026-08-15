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
import type { CvImprovement } from '@/lib/types';

const SEVERITY_TONE = {
  high: 'accent',
  medium: 'warning',
  low: 'neutral',
} as const;

const severityLabel = (severity: CvImprovement['severity']) =>
  severity === 'high' ? 'Fix first' : severity === 'medium' ? 'Worth fixing' : 'Polish';

export default function CvReviewScreen() {
  const router = useRouter();
  const { userId } = useSession();
  const params = useLocalSearchParams<{ role?: string; advert?: string }>();

  const [cvText, setCvText] = useState('');
  const [targetRole, setTargetRole] = useState(params.role ?? '');
  const [jobAdvert, setJobAdvert] = useState(params.advert ?? '');

  const review = useMutation({
    mutationFn: () =>
      api.reviewCv({
        userId: userId ?? undefined,
        cvText,
        targetRole: targetRole.trim() || undefined,
        jobAdvert: jobAdvert.trim() || undefined,
      }),
  });

  const result = review.data;

  return (
    <Screen>
      <View style={styles.topBar}>
        <Chip label="‹ Back" onPress={() => router.back()} />
      </View>

      <View style={styles.header}>
        <ThemedText type="subtitle">CV review</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Paste your CV as plain text. It is checked against UK conventions and, if you add the advert, the
          exact keywords a screening system will look for.
        </ThemedText>
      </View>

      <Card>
        <TextField
          label="Target role"
          placeholder="e.g. Band 5 Staff Nurse"
          value={targetRole}
          onChangeText={setTargetRole}
        />
        <TextField
          label="Your CV"
          placeholder="Paste the full text of your CV here…"
          value={cvText}
          onChangeText={setCvText}
          area
          hint={`${cvText.trim().split(/\s+/).filter(Boolean).length} words`}
        />
        <TextField
          label="Job advert (optional)"
          placeholder="Paste the advert to get a keyword gap analysis"
          value={jobAdvert}
          onChangeText={setJobAdvert}
          area
        />
        <Button
          label={review.isPending ? 'Reviewing…' : 'Review my CV'}
          onPress={() => review.mutate()}
          loading={review.isPending}
          disabled={cvText.trim().length < 80}
        />
        {cvText.trim().length > 0 && cvText.trim().length < 80 ? (
          <ThemedText type="small" themeColor="textMuted">
            Paste a bit more — at least a paragraph is needed for a useful review.
          </ThemedText>
        ) : null}
        {review.error ? <ErrorState error={review.error as Error} /> : null}
      </Card>

      {result ? (
        <>
          <Card>
            <SectionHeader title={`Score: ${result.score}/100`} subtitle={result.verdict} />
            {result.stats ? (
              <ChipRow>
                <Chip label={`${result.stats.words} words`} size="small" />
                <Chip label={`~${result.stats.estimatedPages} page(s)`} size="small" />
                <Chip
                  label={`${result.stats.bulletsWithNumbers} quantified bullets`}
                  size="small"
                  tone={result.stats.bulletsWithNumbers >= 3 ? 'success' : 'warning'}
                />
                <Chip
                  label={result.stats.hasEmail && result.stats.hasPhone ? 'Contact details ✓' : 'Contact details missing'}
                  size="small"
                  tone={result.stats.hasEmail && result.stats.hasPhone ? 'success' : 'accent'}
                />
              </ChipRow>
            ) : null}
          </Card>

          {result.strengths.length > 0 ? (
            <Card tone="flat">
              <SectionHeader title="What works" />
              {result.strengths.map((strength) => (
                <ThemedText key={strength} type="small">
                  ✓ {strength}
                </ThemedText>
              ))}
            </Card>
          ) : null}

          {result.improvements.length > 0 ? (
            <View style={styles.list}>
              <SectionHeader title="Fix these" subtitle="Ordered by impact on your chances" />
              {result.improvements.map((improvement) => (
                <Card key={improvement.issue}>
                  <ChipRow>
                    <Chip
                      label={severityLabel(improvement.severity)}
                      tone={SEVERITY_TONE[improvement.severity] ?? 'neutral'}
                      size="small"
                    />
                  </ChipRow>
                  <ThemedText type="smallBold">{improvement.issue}</ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {improvement.why}
                  </ThemedText>
                  <Divider />
                  <ThemedText type="small" themeColor="primary">
                    Do this: {improvement.fix}
                  </ThemedText>
                </Card>
              ))}
            </View>
          ) : null}

          {result.rewrittenSummary ? (
            <Card>
              <SectionHeader title="Rewritten personal statement" />
              <ThemedText type="small" style={styles.paragraph}>
                {result.rewrittenSummary}
              </ThemedText>
            </Card>
          ) : null}

          {result.missingKeywords.length > 0 ? (
            <Card tone="flat">
              <SectionHeader title="Keywords the advert uses that your CV does not" />
              <ChipRow>
                {result.missingKeywords.map((keyword) => (
                  <Chip key={keyword} label={keyword} size="small" tone="warning" />
                ))}
              </ChipRow>
              <ThemedText type="small" themeColor="textMuted">
                Only add the ones you can genuinely evidence.
              </ThemedText>
            </Card>
          ) : null}

          {result.atsNotes.length > 0 ? (
            <Card tone="flat">
              <SectionHeader title="Getting past the screening software" />
              {result.atsNotes.map((note) => (
                <ThemedText key={note} type="small" themeColor="textSecondary">
                  • {note}
                </ThemedText>
              ))}
            </Card>
          ) : null}

          <ThemedText type="small" themeColor="textMuted">
            Reviewed by {result.model === 'rule-based' ? 'the built-in checker' : result.model}. Your CV text is
            sent to your own Kal-UKFinder server and, if configured, on to Gemini — it is not stored.
          </ThemedText>
        </>
      ) : null}
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
  paragraph: {
    lineHeight: 22,
  },
});
