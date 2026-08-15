import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { api, onUnauthorised, tokenStore } from './api';
import type { AdminUser } from './types';

type AuthValue = {
  user: AdminUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

/**
 * Session state for the panel.
 *
 * The role check here only decides what to render — every admin endpoint is
 * independently guarded on the server, so a tampered client gets 403s rather
 * than data (pr.md §4, §42.12).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const drop = () => {
      setUser(null);
      queryClient.clear();
    };
    onUnauthorised.add(drop);
    return () => {
      onUnauthorised.delete(drop);
    };
  }, [queryClient]);

  useEffect(() => {
    if (!tokenStore.get()) {
      setLoading(false);
      return;
    }

    api
      .me()
      .then((response) => setUser(response.user))
      .catch(() => tokenStore.clear())
      .finally(() => setLoading(false));
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    const response = await api.login(email, password);
    tokenStore.set(response.token);
    setUser(response.user);
  }, []);

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    tokenStore.clear();
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth(): AuthValue {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}

export const isAdmin = (user: AdminUser | null) => user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
