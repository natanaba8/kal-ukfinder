import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { cn, compactNumber } from '@/lib/utils';
import type { ContentStatus } from '@/lib/types';

export function StatCard({
  label,
  value,
  hint,
  tone = 'default',
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  tone?: 'default' | 'success' | 'warning' | 'destructive';
  icon?: ReactNode;
}) {
  const toneClass = {
    default: 'text-foreground',
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
  }[tone];

  return (
    <Card>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div className="space-y-1">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
          <p className={cn('tabular text-2xl font-semibold', toneClass)}>
            {typeof value === 'number' ? compactNumber(value) : value}
          </p>
          {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        {icon ? <div className="text-muted-foreground/60">{icon}</div> : null}
      </CardContent>
    </Card>
  );
}

const STATUS_LABEL: Record<string, { label: string; variant: 'success' | 'warning' | 'muted' | 'destructive' }> = {
  published: { label: 'Published', variant: 'success' },
  pending: { label: 'Awaiting review', variant: 'warning' },
  hidden: { label: 'Hidden', variant: 'muted' },
  success: { label: 'Success', variant: 'success' },
  failed: { label: 'Failed', variant: 'destructive' },
  running: { label: 'Running', variant: 'warning' },
  skipped: { label: 'Skipped', variant: 'muted' },
  never: { label: 'Never run', variant: 'muted' },
  ACTIVE: { label: 'Active', variant: 'success' },
  DISABLED: { label: 'Disabled', variant: 'destructive' },
};

export function StatusBadge({ status }: { status: ContentStatus | string }) {
  const entry = STATUS_LABEL[status] ?? { label: status, variant: 'muted' as const };
  return <Badge variant={entry.variant}>{entry.label}</Badge>;
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t px-3 py-2.5 text-sm">
      <p className="tabular text-muted-foreground">
        {from}–{to} of {total.toLocaleString('en-GB')}
      </p>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft />
          Previous
        </Button>
        <span className="tabular text-xs text-muted-foreground">
          Page {page} of {pages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next
          <ChevronRight />
        </Button>
      </div>
    </div>
  );
}

export function EmptyState({ title, body, action }: { title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-14 text-center">
      <p className="font-medium">{title}</p>
      <p className="max-w-md text-sm text-muted-foreground">{body}</p>
      {action ? <div className="pt-2">{action}</div> : null}
    </div>
  );
}

/** A compact bar chart — enough to see a trend without pulling in a chart library. */
export function Sparkbars({ data, label }: { data: { day: string; total: number }[]; label: string }) {
  const max = Math.max(1, ...data.map((entry) => entry.total));

  return (
    <div className="space-y-2">
      <div className="flex h-24 items-end gap-1" role="img" aria-label={`${label} over time`}>
        {data.length === 0 ? (
          <p className="text-sm text-muted-foreground">No activity yet</p>
        ) : (
          data.map((entry, index) => (
            <div
              key={entry.day}
              className={cn(
                'flex-1 rounded-t transition-colors',
                index === data.length - 1 ? 'bg-primary' : 'bg-primary/35',
              )}
              style={{ height: `${Math.max(4, (entry.total / max) * 100)}%` }}
              title={`${entry.day}: ${entry.total}`}
            />
          ))
        )}
      </div>
      {data.length > 0 ? (
        <div className="flex justify-between text-[11px] text-muted-foreground">
          <span>{data[0]?.day.slice(5)}</span>
          <span>{data.at(-1)?.day.slice(5)}</span>
        </div>
      ) : null}
    </div>
  );
}
