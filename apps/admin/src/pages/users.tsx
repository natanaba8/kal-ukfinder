import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { MoreHorizontal, Search } from 'lucide-react';
import { useState } from 'react';
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
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { ErrorBlock, LoadingBlock } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { AdminUser, Role } from '@/lib/types';
import { relativeTime } from '@/lib/utils';

const ROLES: Role[] = ['USER', 'EDITOR', 'ADMIN', 'SUPER_ADMIN'];

export function UsersPage() {
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [role, setRole] = useState('all');
  const [page, setPage] = useState(1);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);

  const params = {
    search: search.trim() || undefined,
    role: role === 'all' ? undefined : role,
    page,
    pageSize: 25,
  };

  const users = useQuery({ queryKey: ['admin-users', params], queryFn: () => api.users(params) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin-users'] });

  const changeRole = useMutation({
    mutationFn: ({ id, next }: { id: string; next: Role }) => api.setUserRole(id, next),
    onSuccess: (result) => {
      toast.success(`${result.user.email} is now ${result.user.role.replace('_', ' ').toLowerCase()}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changeStatus = useMutation({
    mutationFn: ({ id, next }: { id: string; next: 'ACTIVE' | 'DISABLED' }) => api.setUserStatus(id, next),
    onSuccess: (result) => {
      toast.success(`${result.user.email} ${result.user.status === 'ACTIVE' ? 'enabled' : 'disabled'}`);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: api.deleteUser,
    onSuccess: () => {
      toast.success('Account deleted');
      setConfirmDelete(null);
      invalidate();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <>
      <PageHeader title="Users" description="Registered accounts. Anonymous app installs are hidden by default." />

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
              placeholder="Search by email or name"
              className="pl-8"
            />
          </div>

          <Select
            value={role}
            onValueChange={(value) => {
              setRole(value);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All roles</SelectItem>
              {ROLES.map((entry) => (
                <SelectItem key={entry} value={entry}>
                  {entry.replace('_', ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Card>
        {users.isLoading ? (
          <LoadingBlock />
        ) : users.error ? (
          <div className="p-4">
            <ErrorBlock error={users.error} onRetry={() => users.refetch()} />
          </div>
        ) : users.data?.data.length === 0 ? (
          <EmptyState title="No accounts match" body="Nobody has registered with those details yet." />
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Joined</TableHead>
                  <TableHead className="text-right">Last login</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.data?.data.map((user) => {
                  const isSelf = user.id === currentUser?.id;

                  return (
                    <TableRow key={user.id}>
                      <TableCell>
                        <p className="font-medium">{user.email ?? 'Anonymous'}</p>
                        {user.displayName ? (
                          <p className="text-xs text-muted-foreground">{user.displayName}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={user.role === 'USER' ? 'secondary' : 'default'}>
                          {user.role.replace('_', ' ')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={user.status} />
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">{relativeTime(user.createdAt)}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {relativeTime(user.lastLoginAt)}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" disabled={isSelf} aria-label="Account actions">
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Change role</DropdownMenuLabel>
                            {ROLES.map((entry) => (
                              <DropdownMenuItem
                                key={entry}
                                disabled={user.role === entry}
                                onSelect={() => changeRole.mutate({ id: user.id, next: entry })}
                              >
                                {entry.replace('_', ' ')}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onSelect={() =>
                                changeStatus.mutate({
                                  id: user.id,
                                  next: user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE',
                                })
                              }
                            >
                              {user.status === 'ACTIVE' ? 'Disable account' : 'Enable account'}
                            </DropdownMenuItem>
                            <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(user)}>
                              Delete account
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            {users.data ? (
              <Pagination
                page={users.data.page}
                pageSize={users.data.pageSize}
                total={users.data.total}
                onPage={setPage}
              />
            ) : null}
          </>
        )}
      </Card>

      <Dialog open={Boolean(confirmDelete)} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {confirmDelete?.email}?</DialogTitle>
            <DialogDescription>
              Their saved items, coach history and notification settings are deleted with the account. This cannot be
              undone — disabling the account instead keeps the data and blocks access immediately.
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
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
