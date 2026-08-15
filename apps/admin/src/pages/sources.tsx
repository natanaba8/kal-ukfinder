import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Plus, RefreshCw, Search } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { EmptyState, Pagination, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ErrorBlock, LoadingBlock, Spinner } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Source } from '@/lib/types';
import { relativeTime } from '@/lib/utils';

export function SourcesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [contentType, setContentType] = useState('all');
  const [active, setActive] = useState('all');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<Source | null>(null);

  const params = {
    search: search.trim() || undefined,
    contentType: contentType === 'all' ? undefined : contentType,
    active: active === 'all' ? undefined : active,
    page,
    pageSize: 25,
  };

  const sources = useQuery({ queryKey: ['sources', params], queryFn: () => api.sources(params) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['sources'] });

  const sync = useMutation({
    mutationFn: api.syncSource,
    onSuccess: (result) => {
      if (result.status === 'failed') toast.error(result.error ?? 'Collection failed');
      else
        toast.success(
          `${result.itemsNew} new, ${result.itemsUpdated} updated, ${result.itemsDuplicate} duplicate, ${result.errorCount} error(s)`,
        );
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const toggleActive = useMutation({
    mutationFn: ({ id, next }: { id: string; next: boolean }) => api.setSourceActive(id, next),
    onSuccess: (result) => {
      toast.success(`${result.source.name} ${result.source.active ? 'enabled' : 'disabled'}`);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: api.deleteSource,
    onSuccess: () => {
      toast.success('Source deleted');
      setConfirmDelete(null);
      refresh();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader
        title="Sources"
        description="Every website the platform collects from. Add one here — no code change needed."
        actions={
          <Button asChild>
            <Link to="/sources/new">
              <Plus />
              Add source
            </Link>
          </Button>
        }
      />

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 p-4">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name, publisher or address"
              className="pl-8"
            />
          </div>

          <Select
            value={contentType}
            onValueChange={(value) => {
              setContentType(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All content</SelectItem>
              <SelectItem value="JOB">Jobs</SelectItem>
              <SelectItem value="POLICY">Policies</SelectItem>
              <SelectItem value="BOTH">Both</SelectItem>
            </SelectContent>
          </Select>

          <Select
            value={active}
            onValueChange={(value) => {
              setActive(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any state</SelectItem>
              <SelectItem value="true">Enabled</SelectItem>
              <SelectItem value="false">Disabled</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        {sources.isLoading ? (
          <LoadingBlock label="Loading sources…" />
        ) : sources.error ? (
          <div className="p-4">
            <ErrorBlock error={sources.error} onRetry={() => sources.refetch()} />
          </div>
        ) : sources.data && sources.data.data.length === 0 ? (
          <EmptyState
            title="No sources match"
            body="Clear the filters, or add the first website you want to collect from."
            action={
              <Button asChild size="sm">
                <Link to="/sources/new">Add source</Link>
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Method</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last sync</TableHead>
                  <TableHead className="text-right">Every</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.data?.data.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell>
                      <Link to={`/sources/${source.id}`} className="font-medium hover:underline">
                        {source.name}
                      </Link>
                      <p className="max-w-72 truncate text-xs text-muted-foreground">{source.publisher || source.baseUrl}</p>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{source.contentType}</Badge>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{source.resolvedMethod ?? source.method}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        <StatusBadge status={source.lastStatus} />
                        {!source.active ? <Badge variant="muted">Disabled</Badge> : null}
                      </div>
                      {source.lastError ? (
                        <p className="max-w-60 truncate text-xs text-destructive" title={source.lastError}>
                          {source.lastError}
                        </p>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{relativeTime(source.lastSyncAt)}</TableCell>
                    <TableCell className="tabular text-right text-muted-foreground">
                      {source.scrapeIntervalMinutes}m
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" aria-label={`Actions for ${source.name}`}>
                            {sync.isPending && sync.variables === source.id ? <Spinner /> : <MoreHorizontal />}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild>
                            <Link to={`/sources/${source.id}`}>View and edit</Link>
                          </DropdownMenuItem>
                          <DropdownMenuItem onSelect={() => sync.mutate(source.id)}>
                            <RefreshCw />
                            Sync now
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onSelect={() => toggleActive.mutate({ id: source.id, next: !source.active })}
                          >
                            {source.active ? 'Disable' : 'Enable'}
                          </DropdownMenuItem>
                          <DropdownMenuItem asChild>
                            <Link to={`/logs?sourceId=${source.id}`}>Scrape logs</Link>
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(source)}>
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {sources.data ? (
              <Pagination
                page={sources.data.page}
                pageSize={sources.data.pageSize}
                total={sources.data.total}
                onPage={setPage}
              />
            ) : null}
          </>
        )}
      </Card>

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.name}?</DialogTitle>
            <DialogDescription>
              The source stops being collected. Content already gathered from it stays in the database — delete that
              separately from the Jobs or Policies pages if you want it gone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={remove.isPending}
              onClick={() => confirmDelete && remove.mutate(confirmDelete.id)}
            >
              {remove.isPending ? <Spinner /> : null}
              Delete source
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
