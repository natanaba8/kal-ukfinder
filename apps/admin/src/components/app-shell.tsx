import {
  BarChart3,
  Briefcase,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Radio,
  ScrollText,
  Settings,
  Sun,
  Users,
} from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Separator } from '@/components/ui/misc';
import { useAuth } from '@/lib/auth';
import { cn } from '@/lib/utils';

type NavItem = { to: string; label: string; icon: typeof LayoutDashboard; end?: boolean };

const NAV: { section: string | null; items: NavItem[] }[] = [
  { section: null, items: [{ to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    section: 'Content',
    items: [
      { to: '/jobs', label: 'Jobs', icon: Briefcase },
      { to: '/policies', label: 'Policies', icon: FileText },
    ],
  },
  {
    section: 'Sources',
    items: [
      { to: '/sources', label: 'All sources', icon: Radio },
      { to: '/sources/new', label: 'Add source', icon: Radio },
      { to: '/logs', label: 'Scrape logs', icon: ScrollText },
    ],
  },
  {
    section: 'Platform',
    items: [
      { to: '/users', label: 'Users', icon: Users },
      { to: '/analytics', label: 'Analytics', icon: BarChart3 },
      { to: '/settings', label: 'Settings', icon: Settings },
    ],
  },
];

const useTheme = () => {
  const [theme, setTheme] = useState<'light' | 'dark'>(
    () =>
      (localStorage.getItem('kal-admin.theme') as 'light' | 'dark') ??
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem('kal-admin.theme', theme);
  }, [theme]);

  return { theme, toggle: () => setTheme(theme === 'dark' ? 'light' : 'dark') };
};

export function AppShell({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const { theme, toggle } = useTheme();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes.
  useEffect(() => setOpen(false), [location.pathname]);

  return (
    <div className="flex min-h-dvh bg-background">
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-60 flex-col border-r border-sidebar-border bg-sidebar transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-14 items-center gap-2 px-4">
          <div className="grid size-7 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
            K
          </div>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-sidebar-foreground">Kal-UKFinder</p>
            <p className="text-[11px] text-muted-foreground">Admin</p>
          </div>
        </div>

        <Separator className="bg-sidebar-border" />

        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {NAV.map((group) => (
            <div key={group.section ?? 'root'} className="space-y-1">
              {group.section ? (
                <p className="px-2 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.section}
                </p>
              ) : null}
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-sidebar-accent text-sidebar-foreground'
                        : 'text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
                    )
                  }
                >
                  <item.icon className="size-4 shrink-0" />
                  {item.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b bg-background/85 px-4 backdrop-blur">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Open navigation">
            <Menu />
          </Button>

          <div className="ml-auto flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={toggle} aria-label="Toggle theme">
              {theme === 'dark' ? <Sun /> : <Moon />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-primary/12 text-[11px] font-semibold text-primary">
                    {(user?.displayName || user?.email || 'A').slice(0, 1).toUpperCase()}
                  </span>
                  <span className="hidden max-w-40 truncate sm:inline">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>{user?.role.replace('_', ' ')}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <NavLink to="/settings">
                    <Settings />
                    Settings
                  </NavLink>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => void signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6">
          <div className="mx-auto w-full max-w-7xl space-y-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
