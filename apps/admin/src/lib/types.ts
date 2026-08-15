/** Shapes returned by the Kal-UKFinder admin API. */

export type Role = 'USER' | 'EDITOR' | 'ADMIN' | 'SUPER_ADMIN';
export type ContentType = 'JOB' | 'POLICY' | 'BOTH';
export type Method = 'AUTO' | 'RSS' | 'API' | 'SCRAPER';
export type Moderation = 'AUTO_PUBLISH' | 'REQUIRE_APPROVAL';
export type Trust = 'official' | 'trusted' | 'community';
export type ContentStatus = 'published' | 'pending' | 'hidden';

export type AdminUser = {
  id: string;
  email: string | null;
  displayName: string;
  role: Role;
  status: 'ACTIVE' | 'DISABLED';
  anonymous: boolean;
  lastLoginAt: string | null;
  createdAt: string;
};

export type Selectors = Partial<
  Record<
    'item' | 'title' | 'url' | 'description' | 'image' | 'date' | 'organization' | 'location' | 'deadline' | 'salary' | 'category',
    string
  >
>;

export type ScrapeRun = {
  id: string;
  sourceId: string | null;
  sourceName: string | null;
  startedAt: string;
  finishedAt: string | null;
  status: 'running' | 'success' | 'failed' | 'skipped';
  method: string | null;
  itemsFound: number;
  itemsNew: number;
  itemsUpdated: number;
  itemsDuplicate: number;
  errorCount: number;
  durationMs: number | null;
  triggeredBy: string;
};

export type Source = {
  id: string;
  name: string;
  publisher: string;
  baseUrl: string;
  contentType: ContentType;
  method: Method;
  resolvedMethod: Method | null;
  rssUrl: string | null;
  apiUrl: string | null;
  apiProvider: string | null;
  scrapeUrl: string | null;
  selectors: Selectors;
  requestHeaders: Record<string, string>;
  trust: Trust;
  itemKind: 'news' | 'policy';
  defaultTopics: string[];
  defaultAudience: string[];
  active: boolean;
  moderation: Moderation;
  scrapeIntervalMinutes: number;
  maxItemsPerRun: number;
  lastSyncAt: string | null;
  lastStatus: 'never' | 'success' | 'failed';
  lastError: string | null;
  consecutiveFailures: number;
  createdAt: string;
  updatedAt: string;
  lastRun?: ScrapeRun | null;
};

export type DetectCheck = { label: string; ok: boolean; detail: string };

export type DetectResult = {
  ok: boolean;
  method: Method | null;
  reason?: string;
  code?: string;
  rssUrl?: string;
  apiUrl?: string;
  scrapeUrl?: string;
  selectors?: Selectors;
  availableFields?: string[];
  itemCount?: number;
  warning?: string;
  checks?: DetectCheck[];
};

export type PreviewResult = {
  ok: boolean;
  method: Method | null;
  endpoint?: string;
  reason?: string;
  code?: string;
  itemsFound?: number;
  sampleSize?: number;
  jobs?: number;
  policies?: number;
  fieldCoverage?: Record<string, number>;
  fieldHits?: Record<string, number> | null;
  preview?: PreviewItem[];
  durationMs?: number;
};

export type PreviewItem = {
  type: 'job' | 'policy';
  title: string;
  url: string;
  company?: string;
  location?: string;
  deadline?: string | null;
  postedAt?: string;
  publishedAt?: string;
  rawSummary?: string;
  description?: string;
};

export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  region: string;
  remote: boolean;
  salaryText: string;
  employmentType: string | null;
  category: string | null;
  url: string;
  deadline: string | null;
  postedAt: string;
  status: ContentStatus;
  featured: boolean;
  source: string;
  isSample: boolean;
};

export type Policy = {
  id: string;
  kind: 'news' | 'policy';
  headline: string;
  title: string;
  url: string;
  source: { id: string; name: string; trust: string };
  publishedAt: string;
  category: string | null;
  topics: string[];
  status: ContentStatus;
  featured: boolean;
  importance: number;
  aiModel: string;
};

export type Paged<T> = { data: T[]; total: number; page: number; pageSize: number; pages?: number };

export type Stats = {
  cards: {
    totalJobs: number;
    totalPolicies: number;
    activeSources: number;
    failingSources: number;
    totalUsers: number;
    jobsToday: number;
    policiesToday: number;
    pendingReview: number;
  };
  jobs: { total: number; published: number; pending: number; hidden: number; today: number };
  policies: { total: number; published: number; pending: number; hidden: number; today: number };
  sources: { total: number; active: number; failing: number; neverRun: number };
  users: { total: number; anonymous: number; admins: number; disabled: number; newToday: number };
  scraping: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastFailureSourceId: string | null;
    runsToday: number;
    newItemsToday: number;
    duplicatesToday: number;
    schedulerRunning: boolean;
    schedulerEnabled: boolean;
  };
  ai: { enabled: boolean; mode: string };
  latest: {
    jobs: { id: string; title: string; company: string; postedAt: string; status: string }[];
    policies: { id: string; headline: string; source: string; publishedAt: string; status: string }[];
    runs: ScrapeRun[];
  };
};

export type Analytics = {
  days: number;
  jobsPerDay: { day: string; total: number }[];
  policiesPerDay: { day: string; total: number }[];
  usersPerDay: { day: string; total: number }[];
  perSource: { id: string; name: string; runs: number; successes: number; successRate: number | null; items: number }[];
};

export type Settings = {
  settings: {
    defaultScrapeIntervalMinutes: number;
    defaultModeration: Moderation;
    retentionDays: number;
    allowRegistration: boolean;
  };
  readOnly: {
    aiEnabled: boolean;
    respectRobots: boolean;
    userAgent: string;
    politenessMs: number;
    concurrency: number;
  };
};
