import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { api, onSessionExpired, onTokenRotated, setAuthToken } from './api';
import { authStorage } from './auth-storage';
import { registerForPush, scheduleDailyDigest } from './notifications';
import type { Profile, User } from './types';

type SessionValue = {
  /** The acting account — anonymous or signed in. */
  userId: string | null;
  user: User | null;
  profile: Profile | null;
  /** True once an email/password account is in use. */
  isSignedIn: boolean;
  isLoading: boolean;
  isOnboarded: boolean;
  error: Error | null;
  isSaving: boolean;

  signIn: (email: string, password: string) => Promise<void>;
  signUp: (input: { email: string; password: string; displayName?: string }) => Promise<void>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  updateProfile: (patch: Partial<Profile>) => Promise<void>;
  updateName: (displayName: string) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  resetOnboarding: () => Promise<void>;
};

const SessionContext = createContext<SessionValue | null>(null);

/**
 * Browsing is open to everyone (the product decision in
 * docs/integration-plan.md §H), so the app still creates an anonymous record on
 * first launch. Registering upgrades that same record, which is why saved items
 * and coach history survive signing up.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [userId, setUserId] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isOnboarded, setIsOnboarded] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<Error | null>(null);

  // Keep rotated tokens in secure storage, and sign out when the server says no.
  useEffect(() => {
    const persist = (next: string) => {
      setToken(next);
      authStorage.setToken(next).catch(() => undefined);
    };

    const expire = () => {
      setToken(null);
      authStorage.clearToken().catch(() => undefined);
      queryClient.invalidateQueries();
    };

    onTokenRotated.add(persist);
    onSessionExpired.add(expire);
    return () => {
      onTokenRotated.delete(persist);
      onSessionExpired.delete(expire);
    };
  }, [queryClient]);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        const [storedToken, storedId, onboarded] = await Promise.all([
          authStorage.getToken(),
          authStorage.getUserId(),
          authStorage.getOnboarded(),
        ]);

        if (!cancelled) setIsOnboarded(onboarded);

        // A stored session wins — confirm it still works.
        if (storedToken) {
          setAuthToken(storedToken);
          try {
            const { user } = await api.me();
            if (!cancelled) {
              setToken(storedToken);
              setUserId(user.id);
            }
            return;
          } catch {
            setAuthToken(null);
            await authStorage.clearToken();
          }
        }

        // Otherwise fall back to the anonymous record, creating one if needed.
        if (storedId) {
          try {
            await api.getUser(storedId);
            if (!cancelled) setUserId(storedId);
            return;
          } catch {
            await authStorage.clearUserId();
          }
        }

        const { user } = await api.createUser({});
        await authStorage.setUserId(user.id);
        if (!cancelled) setUserId(user.id);
      } catch (error) {
        if (!cancelled) setBootstrapError(error as Error);
      } finally {
        if (!cancelled) setBootstrapping(false);
      }
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const userQuery = useQuery({
    queryKey: ['user', userId, token],
    queryFn: () => (token ? api.me().then((response) => response.user) : api.getUser(userId as string).then((r) => r.user)),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!userId) return;
    registerForPush(userId).catch(() => undefined);
  }, [userId]);

  const adopt = useCallback(
    async (user: User, nextToken: string) => {
      setAuthToken(nextToken);
      setToken(nextToken);
      setUserId(user.id);
      await Promise.all([authStorage.setToken(nextToken), authStorage.setUserId(user.id)]);
      queryClient.setQueryData(['user', user.id, nextToken], user);
      queryClient.invalidateQueries();
    },
    [queryClient],
  );

  const signUp = useCallback(
    async (input: { email: string; password: string; displayName?: string }) => {
      // Pass the anonymous id so the server upgrades that record rather than
      // creating a second one and orphaning their saved items.
      const response = await api.register({ ...input, anonymousUserId: userId ?? undefined });
      await adopt(response.user, response.token);
    },
    [adopt, userId],
  );

  const signIn = useCallback(
    async (email: string, password: string) => {
      const response = await api.login(email, password);
      await adopt(response.user, response.token);
    },
    [adopt],
  );

  const signOut = useCallback(async () => {
    await api.logout().catch(() => undefined);
    setAuthToken(null);
    setToken(null);
    await authStorage.clearToken();

    // Drop back to a fresh anonymous record so browsing keeps working.
    await authStorage.clearUserId();
    const { user } = await api.createUser({});
    await authStorage.setUserId(user.id);
    setUserId(user.id);
    queryClient.clear();
  }, [queryClient]);

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const response = await api.changePassword(currentPassword, newPassword);
      setAuthToken(response.token);
      setToken(response.token);
      await authStorage.setToken(response.token);
    },
    [],
  );

  const mutation = useMutation({
    mutationFn: (body: { displayName?: string; profile?: Partial<Profile> }) =>
      token ? api.updateMe(body) : api.updateUser(userId as string, body),
    onSuccess: (response) => {
      queryClient.setQueryData(['user', userId, token], response.user);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      queryClient.invalidateQueries({ queryKey: ['jobs'] });
    },
  });

  const updateProfile = useCallback(
    async (patch: Partial<Profile>) => {
      if (!userId) return;
      const response = await mutation.mutateAsync({ profile: patch });
      if (patch.notifications) {
        await scheduleDailyDigest(response.user.profile.notifications).catch(() => undefined);
      }
    },
    [mutation, userId],
  );

  const updateName = useCallback(
    async (displayName: string) => {
      if (!userId) return;
      await mutation.mutateAsync({ displayName });
    },
    [mutation, userId],
  );

  const completeOnboarding = useCallback(async () => {
    await authStorage.setOnboarded(true);
    setIsOnboarded(true);
  }, []);

  const resetOnboarding = useCallback(async () => {
    await authStorage.setOnboarded(false);
    setIsOnboarded(false);
  }, []);

  const user = userQuery.data ?? null;

  const value: SessionValue = {
    userId,
    user,
    profile: user?.profile ?? null,
    isSignedIn: Boolean(token) && Boolean(user?.email),
    isLoading: bootstrapping || userQuery.isLoading,
    isOnboarded,
    error: bootstrapError ?? (userQuery.error as Error | null),
    isSaving: mutation.isPending,
    signIn,
    signUp,
    signOut,
    changePassword,
    updateProfile,
    updateName,
    completeOnboarding,
    resetOnboarding,
  };

  return <SessionContext value={value}>{children}</SessionContext>;
}

export function useSession(): SessionValue {
  const value = use(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}
