import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Briefcase, FileText, Radio, RefreshCw, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { StatCard, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { relativeTime } from '@/lib/utils';

export function DashboardPage() {
  const queryClient = useQueryClient();
  const stats = useQuery({ queryKey: ['stats'], queryFn: api.stats, refetchInterval: 60_000 });

  const syncAll = useMutation({
    mutationFn: api.syncAll,
    onSuccess: (result) => {
      toast.success(
        result.due > 0 ? `Collecting ${result.due} source(s)` : 'Nothing is due yet — every source is up to date',
      );
      setTimeout(() => queryClient.invalidateQueries({ queryKey: ['stats'] }), 2500);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (stats.isLoading) return <LoadingBlock label="Loading dashboard…" />;
  if (stats.error) return <ErrorBlock error={stats.error} onRetry={() => stats.refetch()} />;
  if (!stats.data) return null;

  const { cards, scraping, sources, users, ai, latest } = stats.data;

  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Collection health and what came in today."
        actions={
          <Button onClick={() => syncAll.mutate()} disabled={syncAll.isPending}>
            <RefreshCw className={syncAll.isPending ? 'animate-spin' : undefined} />
            Sync due sources
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total jobs" value={cards.totalJobs} hint={`${cards.jobsToday} added today`} icon={<Briefcase />} />
        <StatCard
          label="Total policies"
          value={cards.totalPolicies}
          hint={`${cards.policiesToday} added today`}
          icon={<FileText />}
        />
        <StatCard
          label="Active sources"
          value={cards.activeSources}
          hint={`${sources.total} configured, ${sources.neverRun} never run`}
          icon={<Radio />}
        />
        <StatCard
          label="Registered users"
          value={cards.totalUsers}
          hint={`${users.newToday} new today, ${users.anonymous} anonymous`}
          icon={<Users />}
        />
      </div>

      {cards.failingSources > 0 || cards.pendingReview > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {cards.failingSources > 0 ? (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="size-5 shrink-0 text-destructive" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">
                    {cards.failingSources} source{cards.failingSources === 1 ? '' : 's'} failing
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Last failure {relativeTime(scraping.lastFailureAt)}. Open the logs to see why.
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/logs?status=failed">View</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {cards.pendingReview > 0 ? (
            <Card className="border-warning/30 bg-warning/5">
              <CardContent className="flex items-center gap-3 p-4">
                <AlertTriangle className="size-5 shrink-0 text-warning" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{cards.pendingReview} item(s) awaiting review</p>
                  <p className="text-xs text-muted-foreground">
                    These sources are set to require approval before publishing.
                  </p>
                </div>
                <Button variant="outline" size="sm" asChild>
                  <Link to="/policies?status=pending">Review</Link>
                </Button>
              </CardContent>
            </Card>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Recent collection runs</CardTitle>
            <CardDescription>Every source keeps its own history.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Duplicate</TableHead>
                  <TableHead className="text-right">When</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {latest.runs.length === 0 ? (
                  <TableEmpty colSpan={5}>No collection runs yet.</TableEmpty>
                ) : (
                  latest.runs.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="font-medium">{run.sourceName ?? 'Unknown'}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">{run.itemsNew}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{run.itemsDuplicate}</TableCell>
                      <TableCell className="text-right text-muted-foreground">{relativeTime(run.startedAt)}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">System</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <Row label="Scheduler" value={<StatusBadge status={scraping.schedulerEnabled ? 'success' : 'skipped'} />} />
            <Row label="Currently collecting" value={scraping.schedulerRunning ? 'Yes' : 'No'} />
            <Row label="Last successful run" value={relativeTime(scraping.lastSuccessAt)} />
            <Row label="Last failure" value={relativeTime(scraping.lastFailureAt)} />
            <Row label="Runs today" value={String(scraping.runsToday)} />
            <Row label="Duplicates skipped today" value={String(scraping.duplicatesToday)} />
            <Row
              label="AI enrichment"
              value={<Badge variant={ai.enabled ? 'success' : 'muted'}>{ai.mode}</Badge>}
            />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Newest jobs</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {latest.jobs.length === 0 ? (
                  <TableEmpty colSpan={2}>Nothing collected yet.</TableEmpty>
                ) : (
                  latest.jobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell>
                        <p className="font-medium">{job.title}</p>
                        <p className="text-xs text-muted-foreground">{job.company}</p>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {relativeTime(job.postedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Newest policies</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableBody>
                {latest.policies.length === 0 ? (
                  <TableEmpty colSpan={2}>Nothing collected yet.</TableEmpty>
                ) : (
                  latest.policies.map((policy) => (
                    <TableRow key={policy.id}>
                      <TableCell>
                        <p className="font-medium">{policy.headline}</p>
                        <p className="text-xs text-muted-foreground">{policy.source}</p>
                      </TableCell>
                      <TableCell className="text-right text-xs text-muted-foreground">
                        {relativeTime(policy.publishedAt)}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
