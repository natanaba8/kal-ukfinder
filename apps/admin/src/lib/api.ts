import type {
  AdminUser,
  Analytics,
  DetectResult,
  Job,
  Paged,
  Policy,
  PreviewResult,
  Role,
  ScrapeRun,
  Settings,
  Source,
  Stats,
} from './types';

/**
 * In development Vite proxies /api to the server, so the panel is same-origin.
 * Set VITE_API_URL to point a built panel at a deployed API.
 */
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

const TOKEN_KEY = 'kal-admin.token';

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (token: string) => localStorage.setItem(TOKEN_KEY, token),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** Fires when the server rejects our session so the app can bounce to /login. */
export const onUnauthorised = new Set<() => void>();

const request = async <T,>(path: string, options: RequestInit = {}): Promise<T> => {
  const token = tokenStore.get();

  let response: Response;
  try {
    response = await fetch(`${BASE}${path}`, {
      ...options,
      headers: {
        'content-type': 'application/json',
        'x-requested-with': 'kal-admin',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch {
    throw new ApiError(
      'Cannot reach the API. Start it with "npm run server" from the project root.',
      0,
      'OFFLINE',
    );
  }

  const payload = response.headers.get('content-type')?.includes('application/json')
    ? await response.json()
    : null;

  if (response.status === 401) {
    tokenStore.clear();
    for (const listener of onUnauthorised) listener();
  }

  if (!response.ok) {
    throw new ApiError(payload?.error ?? `Request failed (${response.status})`, response.status, payload?.code);
  }

  return payload as T;
};

const query = (params: Record<string, string | number | boolean | undefined | null>) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const asString = search.toString();
  return asString ? `?${asString}` : '';
};

const body = (value: unknown) => JSON.stringify(value);

export type SourceDraft = Partial<
  Pick<
    Source,
    | 'name'
    | 'publisher'
    | 'baseUrl'
    | 'contentType'
    | 'method'
    | 'rssUrl'
    | 'apiUrl'
    | 'apiProvider'
    | 'scrapeUrl'
    | 'selectors'
    | 'trust'
    | 'active'
    | 'moderation'
    | 'scrapeIntervalMinutes'
    | 'maxItemsPerRun'
    | 'defaultTopics'
    | 'defaultAudience'
  >
>;

export const api = {
  // --- auth ---------------------------------------------------------------
  login: (email: string, password: string) =>
    request<{ user: AdminUser; token: string }>('/api/auth/login', { method: 'POST', body: body({ email, password }) }),
  me: () => request<{ user: AdminUser }>('/api/auth/me'),
  logout: () => request<{ loggedOut: boolean }>('/api/auth/logout', { method: 'POST' }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ changed: boolean; token: string }>('/api/auth/change-password', {
      method: 'POST',
      body: body({ currentPassword, newPassword }),
    }),

  // --- dashboard ----------------------------------------------------------
  stats: () => request<Stats>('/api/admin/stats'),
  analytics: (days = 14) => request<Analytics>(`/api/admin/analytics${query({ days })}`),

  // --- sources ------------------------------------------------------------
  sources: (params: { search?: string; contentType?: string; method?: string; active?: string; page?: number; pageSize?: number }) =>
    request<Paged<Source>>(`/api/admin/sources${query(params)}`),
  source: (id: string) => request<{ source: Source; lastRun: ScrapeRun | null }>(`/api/admin/sources/${id}`),
  createSource: (draft: SourceDraft) => request<{ source: Source }>('/api/admin/sources', { method: 'POST', body: body(draft) }),
  updateSource: (id: string, patch: SourceDraft) =>
    request<{ source: Source }>(`/api/admin/sources/${id}`, { method: 'PATCH', body: body(patch) }),
  deleteSource: (id: string) => request<{ deleted: boolean }>(`/api/admin/sources/${id}`, { method: 'DELETE' }),
  setSourceActive: (id: string, active: boolean) =>
    request<{ source: Source }>(`/api/admin/sources/${id}/active`, { method: 'POST', body: body({ active }) }),
  detectSource: (url: string) => request<DetectResult>('/api/admin/sources/detect', { method: 'POST', body: body({ url }) }),
  testSource: (input: { id?: string; draft?: SourceDraft; limit?: number }) =>
    request<PreviewResult>('/api/admin/sources/test', { method: 'POST', body: body(input) }),
  syncSource: (id: string) =>
    request<{ status: string; itemsNew: number; itemsUpdated: number; itemsDuplicate: number; errorCount: number; error?: string }>(
      `/api/admin/sources/${id}/sync`,
      { method: 'POST' },
    ),
  syncAll: () => request<{ due: number }>('/api/admin/sync', { method: 'POST' }),

  // --- content ------------------------------------------------------------
  jobs: (params: { search?: string; status?: string; category?: string; location?: string; sourceId?: string; page?: number; pageSize?: number }) =>
    request<Paged<Job>>(`/api/admin/jobs${query(params)}`),
  jobFilters: () =>
    request<{ categories: { category: string; total: number }[]; locations: { location: string; total: number }[]; organizations: { organization: string; total: number }[] }>(
      '/api/admin/jobs/filters',
    ),
  updateJob: (id: string, patch: Record<string, unknown>) =>
    request<{ job: Job }>(`/api/admin/jobs/${id}`, { method: 'PATCH', body: body(patch) }),
  deleteJob: (id: string) => request<{ deleted: boolean }>(`/api/admin/jobs/${id}`, { method: 'DELETE' }),

  policies: (params: { search?: string; status?: string; category?: string; sourceId?: string; page?: number; pageSize?: number }) =>
    request<Paged<Policy>>(`/api/admin/policies${query(params)}`),
  updatePolicy: (id: string, patch: Record<string, unknown>) =>
    request<{ item: Policy }>(`/api/admin/policies/${id}`, { method: 'PATCH', body: body(patch) }),
  deletePolicy: (id: string) => request<{ deleted: boolean }>(`/api/admin/policies/${id}`, { method: 'DELETE' }),

  bulk: (entity: 'job' | 'policy', ids: string[], action: 'publish' | 'hide' | 'feature' | 'unfeature' | 'delete') =>
    request<{ affected: number }>('/api/admin/bulk', { method: 'POST', body: body({ entity, ids, action }) }),

  // --- users --------------------------------------------------------------
  users: (params: { search?: string; role?: string; status?: string; includeAnonymous?: string; page?: number; pageSize?: number }) =>
    request<Paged<AdminUser>>(`/api/admin/users${query(params)}`),
  setUserRole: (id: string, role: Role) =>
    request<{ user: AdminUser }>(`/api/admin/users/${id}/role`, { method: 'PATCH', body: body({ role }) }),
  setUserStatus: (id: string, status: 'ACTIVE' | 'DISABLED') =>
    request<{ user: AdminUser }>(`/api/admin/users/${id}/status`, { method: 'PATCH', body: body({ status }) }),
  deleteUser: (id: string) => request<{ deleted: boolean }>(`/api/admin/users/${id}`, { method: 'DELETE' }),

  // --- logs & settings -----------------------------------------------------
  runs: (params: { sourceId?: string; status?: string; page?: number; pageSize?: number }) =>
    request<Paged<ScrapeRun>>(`/api/admin/scrape-runs${query(params)}`),
  runErrors: (id: string) =>
    request<{ errors: { id: string; stage: string; message: string; detail: string | null; createdAt: string }[] }>(
      `/api/admin/scrape-runs/${id}/errors`,
    ),

  settings: () => request<Settings>('/api/admin/settings'),
  saveSettings: (patch: Partial<Settings['settings']>) =>
    request<{ saved: boolean }>('/api/admin/settings', { method: 'PUT', body: body(patch) }),
};
