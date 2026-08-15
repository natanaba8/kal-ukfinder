import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { PageHeader } from '@/components/app-shell';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ErrorBlock, LoadingBlock, Spinner, Switch } from '@/components/ui/misc';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { Settings } from '@/lib/types';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const [form, setForm] = useState<Settings['settings'] | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const settings = useQuery({ queryKey: ['settings'], queryFn: api.settings });

  useEffect(() => {
    if (settings.data) setForm(settings.data.settings);
  }, [settings.data]);

  const save = useMutation({
    mutationFn: () => api.saveSettings(form ?? {}),
    onSuccess: () => {
      toast.success('Settings saved');
      queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const changePassword = useMutation({
    mutationFn: () => api.changePassword(currentPassword, newPassword),
    onSuccess: () => {
      toast.success('Password changed — other sessions have been signed out');
      setCurrentPassword('');
      setNewPassword('');
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (settings.isLoading) return <LoadingBlock />;
  if (settings.error) return <ErrorBlock error={settings.error} onRetry={() => settings.refetch()} />;
  if (!settings.data || !form) return null;

  const { readOnly } = settings.data;
  const update = (patch: Partial<Settings['settings']>) => setForm({ ...form, ...patch });

  return (
    <>
      <PageHeader title="Settings" description="Platform defaults and your own account." />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection defaults</CardTitle>
          <CardDescription>Applied to new sources. Each source can override them.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Default interval (minutes)</Label>
              <Input
                type="number"
                min={5}
                value={form.defaultScrapeIntervalMinutes}
                onChange={(event) => update({ defaultScrapeIntervalMinutes: Number(event.target.value) })}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Default publishing</Label>
              <Select
                value={form.defaultModeration}
                onValueChange={(value) => update({ defaultModeration: value as Settings['settings']['defaultModeration'] })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AUTO_PUBLISH">Publish automatically</SelectItem>
                  <SelectItem value="REQUIRE_APPROVAL">Hold for approval</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Keep content for (days)</Label>
              <Input
                type="number"
                min={1}
                value={form.retentionDays}
                onChange={(event) => update({ retentionDays: Number(event.target.value) })}
              />
            </div>
          </div>

          <label className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <span>
              <span className="block text-sm font-medium">Allow new registrations</span>
              <span className="block text-xs text-muted-foreground">
                Turn off to close sign-ups without taking the app down.
              </span>
            </span>
            <Switch
              checked={form.allowRegistration}
              onCheckedChange={(next) => update({ allowRegistration: next })}
            />
          </label>

          <Button onClick={() => save.mutate()} disabled={save.isPending}>
            {save.isPending ? <Spinner /> : <Save />}
            Save settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Collection behaviour</CardTitle>
          <CardDescription>Set in server/.env — shown here so you know how the crawler behaves.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2.5 text-sm">
          <Row label="AI enrichment">
            <Badge variant={readOnly.aiEnabled ? 'success' : 'muted'}>
              {readOnly.aiEnabled ? 'Gemini' : 'Rule-based fallback'}
            </Badge>
          </Row>
          <Row label="robots.txt">
            <Badge variant={readOnly.respectRobots ? 'success' : 'destructive'}>
              {readOnly.respectRobots ? 'Respected' : 'Ignored'}
            </Badge>
          </Row>
          <Row label="Minimum gap between requests">
            <span className="tabular">{readOnly.politenessMs}ms per host</span>
          </Row>
          <Row label="Sources collected at once">
            <span className="tabular">{readOnly.concurrency}</span>
          </Row>
          <Row label="User agent">
            <span className="max-w-96 truncate font-mono text-xs">{readOnly.userAgent}</span>
          </Row>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your account</CardTitle>
          <CardDescription>
            Signed in as {user?.email} ({user?.role.replace('_', ' ').toLowerCase()}).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="current">Current password</Label>
              <Input
                id="current"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="next">New password</Label>
              <Input
                id="next"
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
              />
            </div>
          </div>

          <Button
            variant="outline"
            onClick={() => changePassword.mutate()}
            disabled={changePassword.isPending || currentPassword.length < 1 || newPassword.length < 10}
          >
            {changePassword.isPending ? <Spinner /> : null}
            Change password
          </Button>
        </CardContent>
      </Card>
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}
