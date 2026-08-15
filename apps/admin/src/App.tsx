import { Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from '@/components/app-shell';
import { LoadingBlock } from '@/components/ui/misc';
import { isAdmin, useAuth } from '@/lib/auth';
import { AnalyticsPage } from '@/pages/analytics';
import { ContentPage } from '@/pages/content';
import { DashboardPage } from '@/pages/dashboard';
import { LoginPage } from '@/pages/login';
import { LogsPage } from '@/pages/logs';
import { SettingsPage } from '@/pages/settings';
import { SourceDetailPage } from '@/pages/source-detail';
import { SourceWizardPage } from '@/pages/source-wizard';
import { SourcesPage } from '@/pages/sources';
import { UsersPage } from '@/pages/users';

/**
 * Route guarding here is presentation only — every endpoint behind these pages
 * is independently authorised on the server (pr.md §4, §42.12).
 */
export function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <LoadingBlock label="Checking your session…" />
      </div>
    );
  }

  if (!user) return <LoginPage />;

  if (!isAdmin(user)) {
    return (
      <div className="grid min-h-dvh place-items-center p-6 text-center">
        <div className="max-w-sm space-y-2">
          <h1 className="text-lg font-semibold">You do not have access to the admin panel</h1>
          <p className="text-sm text-muted-foreground">
            This area needs an administrator account. Signed in as {user.email}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/jobs" element={<ContentPage entity="job" />} />
        <Route path="/policies" element={<ContentPage entity="policy" />} />
        <Route path="/sources" element={<SourcesPage />} />
        <Route path="/sources/new" element={<SourceWizardPage />} />
        <Route path="/sources/:id" element={<SourceDetailPage />} />
        <Route path="/logs" element={<LogsPage />} />
        <Route path="/users" element={<UsersPage />} />
        <Route path="/analytics" element={<AnalyticsPage />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
