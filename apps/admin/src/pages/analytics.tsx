import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

import { PageHeader } from '@/components/app-shell';
import { Sparkbars } from '@/components/shared';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';

export function AnalyticsPage() {
  const [days, setDays] = useState(14);
  const analytics = useQuery({ queryKey: ['analytics', days], queryFn: () => api.analytics(days) });

  if (analytics.isLoading) return <LoadingBlock />;
  if (analytics.error) return <ErrorBlock error={analytics.error} onRetry={() => analytics.refetch()} />;
  if (!analytics.data) return null;

  const { jobsPerDay, policiesPerDay, usersPerDay, perSource } = analytics.data;

  return (
    <>
      <PageHeader
        title="Analytics"
        description="Collection volume and per-source reliability."
        actions={
          <Select value={String(days)} onValueChange={(value) => setDays(Number(value))}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jobs collected</CardTitle>
            <CardDescription>{jobsPerDay.reduce((sum, entry) => sum + entry.total, 0)} in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkbars data={jobsPerDay} label="Jobs collected" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Policies collected</CardTitle>
            <CardDescription>
              {policiesPerDay.reduce((sum, entry) => sum + entry.total, 0)} in this period
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkbars data={policiesPerDay} label="Policies collected" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">New accounts</CardTitle>
            <CardDescription>{usersPerDay.reduce((sum, entry) => sum + entry.total, 0)} in this period</CardDescription>
          </CardHeader>
          <CardContent>
            <Sparkbars data={usersPerDay} label="New accounts" />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Per-source reliability</CardTitle>
          <CardDescription>A low success rate usually means the site changed or is blocking us.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead className="text-right">Runs</TableHead>
                <TableHead className="text-right">Success rate</TableHead>
                <TableHead className="text-right">Items collected</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {perSource.length === 0 ? (
                <TableEmpty colSpan={4}>No runs in this period.</TableEmpty>
              ) : (
                perSource.map((source) => (
                  <TableRow key={source.id}>
                    <TableCell className="font-medium">{source.name}</TableCell>
                    <TableCell className="tabular text-right">{source.runs}</TableCell>
                    <TableCell className="text-right">
                      {source.successRate === null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant={
                            source.successRate >= 90 ? 'success' : source.successRate >= 50 ? 'warning' : 'destructive'
                          }
                        >
                          {source.successRate}%
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{source.items}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
