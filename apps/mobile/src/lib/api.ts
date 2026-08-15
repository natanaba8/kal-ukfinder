import Constants from 'expo-constants';
import { Platform } from 'react-native';

import { isDevBuild } from './audience';
import type {
  AnswerFeedback,
  ApiStatus,
  AppNotification,
  AuthResponse,
  BriefingItem,
  CoachAnswer,
  CoachMessage,
  CvReview,
  InterviewPrep,
  Job,
  JobMatch,
  Paged,
  Profile,
  SourceSummary,
  Taxonomy,
  User,
} from './types';

/** True when the web build is being served from a real domain, not a dev machine. */
export const isDeployedWeb = (): boolean => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const { hostname } = window.location;
  return hostname !== 'localhost' && hostname !== '127.0.0.1' && hostname !== '';
};

/**
 * Where the API lives.
 *
 * Order of preference:
 *  1. EXPO_PUBLIC_API_URL — set this for a deployed backend. Read at build
 *     time, so changing it means rebuilding.
 *  2. The host serving the Metro bundle, on port 4000. This is what makes a
 *     physical phone work out of the box: it picks up your laptop's LAN IP
 *     instead of localhost, which on a device means the phone itself.
 *  3. On a deployed site, the same origin — so putting the API behind a
 *     reverse proxy at /api on the same domain works with no configuration.
 *     Defaulting to localhost here would point at the *visitor's* machine.
 *  4. http://localhost:4000 for local web and simulators.
 */
const inferBaseUrl = (): string => {
  const explicit = process.env.EXPO_PUBLIC_API_URL;
  if (explicit) return explicit.replace(/\/$/, '');

  const hostUri = Constants.expoConfig?.hostUri ?? Constants.expoGoConfig?.debuggerHost;
  const host = hostUri?.split(':')[0];
  if (host && Platform.OS !== 'web') return `http://${host}:4000`;

  if (isDeployedWeb()) return window.location.origin;

  return 'http://localhost:4000';
};

export const API_BASE_URL = inferBaseUrl();

/**
 * The message shown when the API cannot be reached. A deployed site and a
 * developer's laptop need completely different advice, so say the right thing.
 */
const unreachableMessage = (): string => {
  if (isDevBuild) {
    return `Cannot reach the Kal-UKFinder server at ${API_BASE_URL}. Start it with "npm run dev" from the project root.`;
  }

  if (!process.env.EXPO_PUBLIC_API_URL) {
    return (
      'This app has no backend configured. Deploy the Kal-UKFinder API, set EXPO_PUBLIC_API_URL to its ' +
      'address in your hosting project, and redeploy. See "Deploying" in the README.'
    );
  }

  return (
    `The Kal-UKFinder service is not responding right now. It may be starting up — free hosting plans ` +
    `sleep after a period of inactivity and can take up to a minute to wake. Please try again shortly.`
  );
};

export class ApiError extends Error {
  status: number;
  details?: { path: string; message: string }[];

  constructor(message: string, status: number, details?: { path: string; message: string }[]) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

/**
 * The session token, held in memory and mirrored to secure storage by
 * `lib/session.tsx`. Kept module-level so every request picks it up without
 * threading it through each call site.
 */
let authToken: string | null = null;

export const setAuthToken = (token: string | null) => {
  authToken = token;
};

export const getAuthToken = () => authToken;

/** Called when the server rejects our session, so the app can sign out cleanly. */
export const onSessionExpired = new Set<() => void>();

const send = async (path: string, options: RequestInit) => {
  try {
    return await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(authToken ? { authorization: `Bearer ${authToken}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(unreachableMessage(), 0, undefined);
  }
};

const request = async <T,>(path: string, options: RequestInit = {}, retry = true): Promise<T> => {
  let response = await send(path, options);

  let payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  // One transparent refresh, then give up and let the app sign out.
  if (response.status === 401 && retry && authToken && payload?.code === 'SESSION_EXPIRED') {
    const refreshed = await refreshSession();
    if (refreshed) {
      response = await send(path, options);
      payload = response.headers.get('content-type')?.includes('application/json')
        ? await response.json()
        : null;
    }
  }

  if (response.status === 401 && authToken) {
    authToken = null;
    for (const listener of onSessionExpired) listener();
  }

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status, payload?.details);
  }

  return payload as T;
};

const refreshSession = async (): Promise<boolean> => {
  if (!authToken) return false;

  try {
    const response = await send('/api/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ token: authToken }),
    });
    if (!response.ok) return false;

    const payload = (await response.json()) as { token: string };
    authToken = payload.token;
    for (const listener of onTokenRotated) listener(payload.token);
    return true;
  } catch {
    return false;
  }
};

/** Fires when a refresh issues a new token so it can be persisted. */
export const onTokenRotated = new Set<(token: string) => void>();

const query = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const asString = search.toString();
  return asString ? `?${asString}` : '';
};

export const api = {
  // --- authentication (pr.md §17) -----------------------------------------
  register: (body: { email: string; password: string; displayName?: string; anonymousUserId?: string }) =>
    request<AuthResponse>('/api/auth/register', { method: 'POST', body: JSON.stringify(body) }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  logout: () => request<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),

  me: () => request<{ user: User; sessions: number }>('/api/auth/me'),

  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean; token: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    }),

  forgotPassword: (email: string) =>
    request<{ sent: boolean; message: string; devToken?: string }>('/api/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<AuthResponse>('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) }),

  updateMe: (body: { displayName?: string; profile?: Partial<Profile> }) =>
    request<{ user: User }>('/api/users/me', { method: 'PATCH', body: JSON.stringify(body) }),

  status: () => request<ApiStatus>('/api/status'),
  taxonomy: () => request<Taxonomy>('/api/taxonomy'),
  sources: () => request<{ sources: SourceSummary[] }>('/api/sources'),

  feed: (params: {
    userId?: string;
    kind?: 'news' | 'policy';
    topics?: string;
    search?: string;
    page?: number;
    pageSize?: number;
  }) => request<Paged<BriefingItem> & { personalised: boolean; profileTopics?: string[] }>(`/api/feed${query(params)}`),

  news: (params: { topics?: string; search?: string; page?: number; pageSize?: number }) =>
    request<Paged<BriefingItem>>(`/api/news${query(params)}`),

  policies: (params: {
    topics?: string;
    search?: string;
    category?: string;
    page?: number;
    pageSize?: number;
  }) => request<Paged<BriefingItem>>(`/api/policies${query(params)}`),

  policyCategories: () => request<{ categories: { category: string; total: number }[] }>('/api/policies/categories'),

  search: (q: string) =>
    request<{
      query: string;
      jobs: { data: Job[]; total: number };
      policies: { data: BriefingItem[]; total: number };
      total: number;
    }>(`/api/search${query({ q })}`),

  item: (id: string) => request<{ item: BriefingItem; related: BriefingItem[] }>(`/api/items/${id}`),

  jobs: (params: {
    userId?: string;
    search?: string;
    location?: string;
    organization?: string;
    employmentType?: string;
    category?: string;
    remote?: boolean;
    openOnly?: boolean;
    salaryMin?: number;
    rank?: 'recent' | 'match';
    live?: boolean;
    page?: number;
    pageSize?: number;
  }) => request<Paged<Job> & { jobs: Job[]; personalised: boolean }>(`/api/jobs${query(params)}`),

  jobFilters: () =>
    request<{
      categories: { category: string; total: number }[];
      locations: { location: string; total: number }[];
      organizations: { organization: string; total: number }[];
    }>('/api/jobs/categories'),

  job: (id: string, userId?: string) =>
    request<{ job: Job; match: JobMatch | null; similar: Job[] }>(`/api/jobs/${id}${query({ userId })}`),

  matchJobs: (userId: string, limit = 10) =>
    request<{ matches: (JobMatch & { job: Job })[] }>('/api/jobs/match', {
      method: 'POST',
      body: JSON.stringify({ userId, limit }),
    }),

  createUser: (body: { displayName?: string; profile?: Partial<Profile> }) =>
    request<{ user: User }>('/api/users', { method: 'POST', body: JSON.stringify(body) }),

  getUser: (id: string) => request<{ user: User; devices: number }>(`/api/users/${id}`),

  updateUser: (id: string, body: { displayName?: string; profile?: Partial<Profile> }) =>
    request<{ user: User }>(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  registerDevice: (userId: string, token: string, platform: string) =>
    request<{ registered: boolean; devices: number }>(`/api/users/${userId}/devices`, {
      method: 'POST',
      body: JSON.stringify({ token, platform }),
    }),

  saved: (userId: string) => request<{ items: BriefingItem[]; jobs: Job[] }>(`/api/users/${userId}/saved`),

  save: (userId: string, entity: 'item' | 'job', entityId: string) =>
    request<{ saved: boolean }>(`/api/users/${userId}/saved`, {
      method: 'POST',
      body: JSON.stringify({ entity, entityId }),
    }),

  unsave: (userId: string, entity: 'item' | 'job', entityId: string) =>
    request<{ removed: number }>(`/api/users/${userId}/saved/${entity}/${entityId}`, { method: 'DELETE' }),

  aiStatus: () => request<{ enabled: boolean; mode: string; note: string | null }>('/api/ai/status'),

  ask: (body: { userId?: string; question: string }) =>
    request<CoachAnswer>('/api/ai/ask', { method: 'POST', body: JSON.stringify(body) }),

  thread: (userId: string, thread = 'coach') =>
    request<{ messages: CoachMessage[] }>(`/api/ai/thread/${userId}${query({ thread })}`),

  clearThread: (userId: string, thread = 'coach') =>
    request<{ deleted: number }>(`/api/ai/thread/${userId}${query({ thread })}`, { method: 'DELETE' }),

  reviewCv: (body: { userId?: string; cvText: string; targetRole?: string; jobAdvert?: string }) =>
    request<CvReview>('/api/ai/cv-review', { method: 'POST', body: JSON.stringify(body) }),

  interviewPrep: (body: { userId?: string; role: string; employer?: string; stage?: string }) =>
    request<InterviewPrep>('/api/ai/interview', { method: 'POST', body: JSON.stringify(body) }),

  answerFeedback: (body: { question: string; answer: string; role?: string }) =>
    request<AnswerFeedback>('/api/ai/interview/feedback', { method: 'POST', body: JSON.stringify(body) }),

  notifications: (userId: string) =>
    request<{ notifications: AppNotification[] }>(`/api/notifications/${userId}`),

  notificationPreview: (userId: string) =>
    request<{
      scheduledHour: number;
      currentUkHour: number;
      enabled: boolean;
      devices: number;
      items: BriefingItem[];
      jobs: Job[];
    }>(`/api/notifications/${userId}/preview`),

  sendTestNotification: (userId: string) =>
    request<{ sent: number; failed: number }>(`/api/notifications/${userId}/test`, { method: 'POST' }),
};
