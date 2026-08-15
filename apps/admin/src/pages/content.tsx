import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ExternalLink, Eye, EyeOff, Search, Star, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { EmptyState, Pagination, StatusBadge } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Checkbox, ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { ContentStatus, Job, Paged, Policy } from '@/lib/types';
import { relativeTime } from '@/lib/utils';

type Entity = 'job' | 'policy';

/** The fields both content types share, which is all this table needs. */
type Row = (Job | Policy) & { id: string; url: string; status: ContentStatus; featured: boolean };

/**
 * Jobs and policies share the same moderation surface — search, filter, select,
 * publish/hide/feature/delete (pr.md §26, §34). One component, two configs.
 */
export function ContentPage({ entity }: { entity: Entity }) {
  const isJob = entity === 'job';
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') ?? 'all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const params = { search: search.trim() || undefined, status, page, pageSize: 25 };

  const list = useQuery({
    queryKey: [isJob ? 'admin-jobs' : 'admin-policies', params],
    queryFn: (): Promise<Paged<Row>> =>
      (isJob ? api.jobs(params) : api.policies(params)) as Promise<Paged<Row>>,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: [isJob ? 'admin-jobs' : 'admin-policies'] });
    queryClient.invalidateQueries({ queryKey: ['stats'] });
    setSelected(new Set());
  };

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Record<string, unknown> }) => {
      if (isJob) await api.updateJob(id, body);
      else await api.updatePolicy(id, body);
    },
    onSuccess: () => invalidate(),
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      if (isJob) await api.deleteJob(id);
      else await api.deletePolicy(id);
    },
    onSuccess: () => {
      toast.success('Deleted');
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const bulk = useMutation({
    mutationFn: (action: 'publish' | 'hide' | 'feature' | 'unfeature' | 'delete') =>
      api.bulk(entity, [...selected], action),
    onSuccess: (result) => {
      toast.success(`${result.affected} item(s) updated`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = list.data?.data ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row.id));

  const toggleAll = () =>
    setSelected(allSelected ? new Set() : new Set(rows.map((row) => row.id)));

  const toggleOne = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setStatusFilter = (value: string) => {
    setStatus(value);
    setPage(1);
    setSearchParams(value === 'all' ? {} : { status: value });
  };

  return (
    <>
      <PageHeader
        title={isJob ? 'Jobs' : 'Policies'}
        description={
          isJob
            ? 'Every vacancy collected across all sources.'
            : 'Every policy announcement and article collected across all sources.'
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
              placeholder={isJob ? 'Search title, employer or description' : 'Search headline or summary'}
              className="pl-8"
            />
          </div>

          <Select value={status} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-48">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="published">Published</SelectItem>
              <SelectItem value="pending">Awaiting review</SelectItem>
              <SelectItem value="hidden">Hidden</SelectItem>
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      {selected.size > 0 ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <p className="mr-auto text-sm font-medium">{selected.size} selected</p>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate('publish')}>
              Publish
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate('hide')}>
              Hide
            </Button>
            <Button size="sm" variant="outline" onClick={() => bulk.mutate('feature')}>
              Feature
            </Button>
            <Button size="sm" variant="destructive" onClick={() => bulk.mutate('delete')}>
              Delete
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        {list.isLoading ? (
          <LoadingBlock />
        ) : list.error ? (
          <div className="p-4">
            <ErrorBlock error={list.error} onRetry={() => list.refetch()} />
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            title="Nothing here"
            body="No content matches these filters. Try clearing the search or changing the status."
          />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">
                    <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Select all" />
                  </TableHead>
                  <TableHead>{isJob ? 'Role' : 'Headline'}</TableHead>
                  <TableHead>{isJob ? 'Employer' : 'Source'}</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Published</TableHead>
                  <TableHead className="w-32 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const job = row as Job;
                  const policy = row as Policy;
                  const title = isJob ? job.title : policy.headline;
                  const subtitle = isJob ? `${job.company} · ${job.location}` : policy.source.name;
                  const date = isJob ? job.postedAt : policy.publishedAt;

                  return (
                    <TableRow key={row.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(row.id)}
                          onCheckedChange={() => toggleOne(row.id)}
                          aria-label={`Select ${title}`}
                        />
                      </TableCell>
                      <TableCell className="max-w-96">
                        <div className="flex items-center gap-1.5">
                          {row.featured ? <Star className="size-3.5 shrink-0 fill-warning text-warning" /> : null}
                          <span className="truncate font-medium">{title}</span>
                        </div>
                        {isJob && job.isSample ? (
                          <Badge variant="warning" className="mt-1">
                            Sample listing
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="max-w-56 truncate text-muted-foreground">{subtitle}</TableCell>
                      <TableCell>
                        <StatusBadge status={row.status} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-muted-foreground">
                        {relativeTime(date)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-0.5">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={row.status === 'published' ? 'Hide' : 'Publish'}
                            onClick={() =>
                              patch.mutate({
                                id: row.id,
                                body: { status: row.status === 'published' ? 'hidden' : 'published' },
                              })
                            }
                          >
                            {row.status === 'published' ? <EyeOff /> : <Eye />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={row.featured ? 'Unfeature' : 'Feature'}
                            onClick={() => patch.mutate({ id: row.id, body: { featured: !row.featured } })}
                          >
                            <Star className={row.featured ? 'fill-warning text-warning' : undefined} />
                          </Button>
                          <Button variant="ghost" size="icon" asChild aria-label="Open original">
                            <a href={row.url} target="_blank" rel="noreferrer noopener">
                              <ExternalLink />
                            </a>
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label="Delete"
                            onClick={() => remove.mutate(row.id)}
                          >
                            <Trash2 className="text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {list.data ? (
              <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
            ) : null}
          </>
        )}
      </Card>
    </>
  );
}
