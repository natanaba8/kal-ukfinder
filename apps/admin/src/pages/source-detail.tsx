import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, FlaskConical, RefreshCw, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorBlock, LoadingBlock, Spinner, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, type SourceDraft } from '@/lib/api';
import type { Selectors } from '@/lib/types';
import { fullDateTime, relativeTime } from '@/lib/utils';

const SELECTOR_KEYS: (keyof Selectors)[] = [
  'item',
  'title',
  'url',
  'organization',
  'location',
  'deadline',
  'date',
  'description',
  'image',
  'salary',
];

export function SourceDetailPage() {
  const { id = '' } = useParams();
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<SourceDraft>({});

  const detail = useQuery({ queryKey: ['source', id], queryFn: () => api.source(id) });
  const runs = useQuery({ queryKey: ['runs', id], queryFn: () => api.runs({ sourceId: id, pageSize: 15 }) });

  useEffect(() => {
    if (detail.data?.source) setDraft(detail.data.source);
  }, [detail.data?.source]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['source', id] });
    queryClient.invalidateQueries({ queryKey: ['runs', id] });
    queryClient.invalidateQueries({ queryKey: ['sources'] });
  };

  const save = useMutation({
    mutationFn: () => api.updateSource(id, draft),
    onSuccess: () => {
      toast.success('Source updated');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const sync = useMutation({
    mutationFn: () => api.syncSource(id),
    onSuccess: (result) => {
      if (result.status === 'failed') toast.error(result.error ?? 'Collection failed');
      else toast.success(`${result.itemsNew} new, ${result.itemsDuplicate} duplicate`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const test = useMutation({
    mutationFn: () => api.testSource({ id, limit: 10 }),
    onSuccess: (result) => {
      if (result.ok) toast.success(`Reachable — ${result.itemsFound} item(s) found`);
      else toast.error(result.reason ?? 'Test failed');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (detail.isLoading) return <LoadingBlock />;
  if (detail.error) return <ErrorBlock error={detail.error} onRetry={() => detail.refetch()} />;
  if (!detail.data) return null;

  const { source } = detail.data;
  const update = (patch: SourceDraft) => setDraft((current) => ({ ...current, ...patch }));

  return (
    <>
      <PageHeader
        title={source.name}
        description={source.publisher || source.baseUrl}
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/sources">
                <ChevronLeft />
                All sources
              </Link>
            </Button>
            <Button variant="outline" onClick={() => test.mutate()} disabled={test.isPending}>
              {test.isPending ? <Spinner /> : <FlaskConical />}
              Test
            </Button>
            <Button onClick={() => sync.mutate()} disabled={sync.isPending}>
              {sync.isPending ? <Spinner /> : <RefreshCw />}
              Sync now
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge status={source.lastStatus} />
        <Badge variant={source.active ? 'success' : 'muted'}>{source.active ? 'Enabled' : 'Disabled'}</Badge>
        <Badge variant="secondary">{source.contentType}</Badge>
        <Badge variant="outline">{source.resolvedMethod ?? source.method}</Badge>
        <span className="text-sm text-muted-foreground">Last sync {relativeTime(source.lastSyncAt)}</span>
        {source.consecutiveFailures > 0 ? (
          <Badge variant="destructive">{source.consecutiveFailures} consecutive failure(s)</Badge>
        ) : null}
      </div>

      {source.lastError ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {source.lastError}
        </div>
      ) : null}

      <Tabs defaultValue="settings">
        <TabsList>
          <TabsTrigger value="settings">Settings</TabsTrigger>
          <TabsTrigger value="selectors">Field mapping</TabsTrigger>
          <TabsTrigger value="runs">Run history</TabsTrigger>
        </TabsList>

        <TabsContent value="settings">
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <Labelled label="Name">
                  <Input value={draft.name ?? ''} onChange={(event) => update({ name: event.target.value })} />
                </Labelled>
                <Labelled label="Publisher">
                  <Input value={draft.publisher ?? ''} onChange={(event) => update({ publisher: event.target.value })} />
                </Labelled>
                <Labelled label="Website address" className="sm:col-span-2">
                  <Input value={draft.baseUrl ?? ''} onChange={(event) => update({ baseUrl: event.target.value })} />
                </Labelled>
                <Labelled label="Feed address">
                  <Input value={draft.rssUrl ?? ''} onChange={(event) => update({ rssUrl: event.target.value })} />
                </Labelled>
                <Labelled label="API address">
                  <Input value={draft.apiUrl ?? ''} onChange={(event) => update({ apiUrl: event.target.value })} />
                </Labelled>
                <Labelled label="Page to read">
                  <Input value={draft.scrapeUrl ?? ''} onChange={(event) => update({ scrapeUrl: event.target.value })} />
                </Labelled>
                <Labelled label="Content type">
                  <Select
                    value={draft.contentType}
                    onValueChange={(value) => update({ contentType: value as SourceDraft['contentType'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="JOB">Jobs</SelectItem>
                      <SelectItem value="POLICY">Policies</SelectItem>
                      <SelectItem value="BOTH">Both</SelectItem>
                    </SelectContent>
                  </Select>
                </Labelled>
                <Labelled label="Method">
                  <Select value={draft.method} onValueChange={(value) => update({ method: value as SourceDraft['method'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO">Auto detect</SelectItem>
                      <SelectItem value="RSS">RSS</SelectItem>
                      <SelectItem value="API">API</SelectItem>
                      <SelectItem value="SCRAPER">Scraper</SelectItem>
                    </SelectContent>
                  </Select>
                </Labelled>
                <Labelled label="Source type">
                  <Select value={draft.trust} onValueChange={(value) => update({ trust: value as SourceDraft['trust'] })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="official">Official</SelectItem>
                      <SelectItem value="trusted">Trusted press</SelectItem>
                      <SelectItem value="community">Community</SelectItem>
                    </SelectContent>
                  </Select>
                </Labelled>
                <Labelled label="Check every (minutes)">
                  <Input
                    type="number"
                    min={5}
                    value={draft.scrapeIntervalMinutes ?? 30}
                    onChange={(event) => update({ scrapeIntervalMinutes: Number(event.target.value) })}
                  />
                </Labelled>
                <Labelled label="Items per run">
                  <Input
                    type="number"
                    min={1}
                    value={draft.maxItemsPerRun ?? 15}
                    onChange={(event) => update({ maxItemsPerRun: Number(event.target.value) })}
                  />
                </Labelled>
                <Labelled label="Publishing">
                  <Select
                    value={draft.moderation}
                    onValueChange={(value) => update({ moderation: value as SourceDraft['moderation'] })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AUTO_PUBLISH">Publish automatically</SelectItem>
                      <SelectItem value="REQUIRE_APPROVAL">Hold for approval</SelectItem>
                    </SelectContent>
                  </Select>
                </Labelled>
              </div>

              <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
                <span className="text-sm font-medium">Enabled</span>
                <Switch checked={draft.active ?? false} onCheckedChange={(next) => update({ active: next })} />
              </label>

              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Spinner /> : <Save />}
                Save changes
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="selectors">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Field mapping</CardTitle>
              <CardDescription>
                CSS selectors for a scraped page, or dot paths for a JSON API. Add <code>@attribute</code> to read an
                attribute rather than the text.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {SELECTOR_KEYS.map((key) => (
                  <Labelled key={key} label={key}>
                    <Input
                      value={draft.selectors?.[key] ?? ''}
                      onChange={(event) =>
                        update({ selectors: { ...draft.selectors, [key]: event.target.value || undefined } })
                      }
                    />
                  </Labelled>
                ))}
              </div>
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                {save.isPending ? <Spinner /> : <Save />}
                Save mapping
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="runs">
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Started</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Duplicate</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Took</TableHead>
                  <TableHead>By</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data?.data.length === 0 ? (
                  <TableEmpty colSpan={8}>This source has not run yet.</TableEmpty>
                ) : (
                  runs.data?.data.map((run) => (
                    <TableRow key={run.id}>
                      <TableCell className="whitespace-nowrap">{fullDateTime(run.startedAt)}</TableCell>
                      <TableCell>
                        <StatusBadge status={run.status} />
                      </TableCell>
                      <TableCell className="tabular text-right">{run.itemsFound}</TableCell>
                      <TableCell className="tabular text-right font-medium">{run.itemsNew}</TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">{run.itemsDuplicate}</TableCell>
                      <TableCell className="tabular text-right">
                        {run.errorCount > 0 ? (
                          <Link to={`/logs?runId=${run.id}`} className="text-destructive underline underline-offset-2">
                            {run.errorCount}
                          </Link>
                        ) : (
                          0
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right text-muted-foreground">
                        {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">{run.triggeredBy}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}

function Labelled({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <Label className="mb-1.5 block capitalize">{label}</Label>
      {children}
    </div>
  );
}
