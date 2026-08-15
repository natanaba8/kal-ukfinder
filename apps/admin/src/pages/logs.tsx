import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { PageHeader } from '@/components/app-shell';
import { EmptyState, Pagination, StatusBadge } from '@/components/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { fullDateTime } from '@/lib/utils';

export function LogsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const sourceId = searchParams.get('sourceId') ?? undefined;

  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(1);
  const [openRun, setOpenRun] = useState<string | null>(searchParams.get('runId'));

  const params = { sourceId, status: status === 'all' ? undefined : status, page, pageSize: 25 };
  const runs = useQuery({ queryKey: ['runs', params], queryFn: () => api.runs(params) });

  const errors = useQuery({
    queryKey: ['run-errors', openRun],
    queryFn: () => api.runErrors(openRun as string),
    enabled: Boolean(openRun),
  });

  return (
    <>
      <PageHeader
        title="Scrape logs"
        description="Every collection run, with the error detail behind any failure."
        actions={
          sourceId ? (
            <Button variant="outline" onClick={() => setSearchParams({})}>
              Clear source filter
            </Button>
          ) : null
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <Select
            value={status}
            onValueChange={(value) => {
              setStatus(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All runs</SelectItem>
              <SelectItem value="success">Successful</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
              <SelectItem value="running">Running</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        {runs.isLoading ? (
          <LoadingBlock />
        ) : runs.error ? (
          <div className="p-4">
            <ErrorBlock error={runs.error} onRetry={() => runs.refetch()} />
          </div>
        ) : runs.data?.data.length === 0 ? (
          <EmptyState title="No runs yet" body="Collection history appears here once the scheduler has run." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Found</TableHead>
                  <TableHead className="text-right">New</TableHead>
                  <TableHead className="text-right">Updated</TableHead>
                  <TableHead className="text-right">Duplicate</TableHead>
                  <TableHead className="text-right">Errors</TableHead>
                  <TableHead className="text-right">Took</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {runs.data?.data.map((run) => (
                  <TableRow
                    key={run.id}
                    className={run.errorCount > 0 || run.status === 'failed' ? 'cursor-pointer' : undefined}
                    onClick={() => (run.errorCount > 0 || run.status === 'failed') && setOpenRun(run.id)}
                  >
                    <TableCell className="whitespace-nowrap">{fullDateTime(run.startedAt)}</TableCell>
                    <TableCell className="font-medium">{run.sourceName ?? '—'}</TableCell>
                    <TableCell>
                      <StatusBadge status={run.status} />
                    </TableCell>
                    <TableCell className="tabular text-right">{run.itemsFound}</TableCell>
                    <TableCell className="tabular text-right font-medium">{run.itemsNew}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">{run.itemsUpdated}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">{run.itemsDuplicate}</TableCell>
                    <TableCell className="tabular text-right">
                      {run.errorCount > 0 ? <span className="text-destructive">{run.errorCount}</span> : 0}
                    </TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {run.durationMs ? `${(run.durationMs / 1000).toFixed(1)}s` : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {runs.data ? (
              <Pagination page={runs.data.page} pageSize={runs.data.pageSize} total={runs.data.total} onPage={setPage} />
            ) : null}
          </>
        )}
      </Card>

      <Dialog open={Boolean(openRun)} onOpenChange={(open) => !open && setOpenRun(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Run errors</DialogTitle>
            <DialogDescription>What went wrong, and at which stage.</DialogDescription>
          </DialogHeader>

          {errors.isLoading ? (
            <LoadingBlock />
          ) : errors.data?.errors.length === 0 ? (
            <p className="text-sm text-muted-foreground">No error detail was recorded for this run.</p>
          ) : (
            <ul className="space-y-2">
              {errors.data?.errors.map((entry) => (
                <li key={entry.id} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium capitalize text-destructive">{entry.stage}</p>
                  <p>{entry.message}</p>
                  {entry.detail ? (
                    <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{entry.detail}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
