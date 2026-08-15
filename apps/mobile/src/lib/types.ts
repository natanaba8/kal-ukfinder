/** Shapes returned by the Kal-UKFinder API (`server/src/routes`). */

export type ItemKind = 'news' | 'policy';

export type BriefingItem = {
  id: string;
  kind: ItemKind;
  source: { id: string; name: string; trust: 'official' | 'trusted' };
  title: string;
  headline: string;
  url: string;
  author: string | null;
  publishedAt: string;
  imageUrl: string | null;
  /** AI (or rule-based) bullet summary. */
  summary: string[];
  rawSummary: string;
  /** "What this means for you". */
  impact: string;
  /** Suggested next step. */
  action: string;
  topics: string[];
  audience: string[];
  region: string;
  importance: number;
  readingMinutes: number;
  aiModel: string;
  /** Present only on personalised responses. */
  score?: number;
  matchedTopics?: string[];
};

export type JobMatch = {
  id: string;
  score: number;
  reasons: string[];
  gaps: string[];
  model?: string;
};

export type Job = {
  id: string;
  source: string;
  title: string;
  company: string;
  location: string;
  region: string;
  remote: boolean;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryText: string;
  contractType: string | null;
  category: string | null;
  url: string;
  description: string;
  postedAt: string;
  summary: string;
  skills: string[];
  isSample: boolean;
  /** Normalised employment type; `contractType` is the older field name. */
  employmentType: string | null;
  requirements: string | null;
  /** Closing date, when the source publishes one. */
  deadline: string | null;
  sourceUrl: string | null;
  sourceId: string | null;
  status: 'published' | 'pending' | 'hidden';
  featured: boolean;
  match?: JobMatch;
};

export type NotificationPreferences = {
  enabled: boolean;
  digestHour: number;
  jobAlerts: boolean;
  policyAlerts: boolean;
  weeklyReview: boolean;
};

export type Profile = {
  headline: string;
  sector: string;
  location: string;
  experienceLevel: string;
  skills: string[];
  jobTitles: string[];
  topics: string[];
  audience: string[];
  salaryMin: number | null;
  remoteOnly: boolean;
  rightToWork: string;
  notifications: NotificationPreferences;
};

export type User = {
  id: string;
  displayName: string;
  email: string | null;
  role: 'USER' | 'EDITOR' | 'ADMIN' | 'SUPER_ADMIN';
  status: 'ACTIVE' | 'DISABLED';
  anonymous: boolean;
  profile: Profile;
  createdAt: string;
  updatedAt: string;
};

export type AuthResponse = { user: User; token: string; expiresAt?: string };

/** Every list endpoint returns this envelope (pr.md §25). */
export type Paged<T> = {
  /** Kept alongside `data` so existing screens did not have to change. */
  items: T[];
  data: T[];
  page: number;
  pageSize: number;
  total: number;
  pages: number;
};

export type Taxonomy = {
  topics: { id: string; label: string; emoji: string }[];
  audiences: { id: string; label: string }[];
  regions: string[];
  experienceLevels: { id: string; label: string }[];
};

export type CoachAnswer = {
  answer: string;
  followUps: string[];
  checkWith: string | null;
  model: string;
};

export type CoachMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  meta: { followUps?: string[]; checkWith?: string | null; model?: string };
  createdAt: string;
};

export type CvImprovement = {
  issue: string;
  why: string;
  fix: string;
  severity: 'high' | 'medium' | 'low';
};

export type CvReview = {
  score: number;
  verdict: string;
  strengths: string[];
  improvements: CvImprovement[];
  rewrittenSummary: string;
  missingKeywords: string[];
  atsNotes: string[];
  stats?: {
    words: number;
    estimatedPages: number;
    bulletsWithNumbers: number;
    hasEmail: boolean;
    hasPhone: boolean;
    missingSections: string[];
  };
  model: string;
};

export type InterviewQuestion = {
  question: string;
  type: string;
  whyAsked: string;
  strongAnswerContains: string[];
};

export type InterviewPrep = {
  format: string;
  questions: InterviewQuestion[];
  questionsToAskThem: string[];
  preparationChecklist: string[];
  model: string;
};

export type AnswerFeedback = {
  score: number;
  whatWorked: string[];
  whatToImprove: string[];
  missingFromStar?: string[];
  modelAnswer: string;
  model: string;
};

export type AppNotification = {
  id: string;
  title: string;
  body: string;
  data: Record<string, unknown>;
  status: string;
  createdAt: string;
};

export type ApiStatus = {
  items: number;
  jobs: number;
  latestItemPublishedAt: string | null;
  ai: { enabled: boolean; fastModel: string | null; smartModel: string | null; mode: string };
  jobProviders: string[];
  sources: number;
  ingest: {
    running: boolean;
    scheduled: boolean;
    cron: string;
    last: { startedAt: string; finishedAt: string | null; stats: Record<string, unknown> } | null;
  };
};

export type SourceSummary = {
  id: string;
  name: string;
  publisher: string;
  kind: ItemKind;
  trust: string;
  topics: string[];
};
