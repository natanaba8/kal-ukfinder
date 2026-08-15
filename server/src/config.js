import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

const bool = (value, fallback) => {
  if (value === undefined || value === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(value).toLowerCase());
};

const int = (value, fallback) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const config = {
  port: int(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  dbPath: process.env.DB_PATH || path.join(here, '..', 'data', 'kal-ukfinder.db'),

  auth: {
    sessionDays: int(process.env.SESSION_DAYS, 30),
    resetTokenMinutes: int(process.env.RESET_TOKEN_MINUTES, 60),
    allowRegistration: bool(process.env.ALLOW_REGISTRATION, true),
    /** Seeds the first ADMIN on boot when the table has none. */
    bootstrapAdminEmail: process.env.ADMIN_EMAIL || '',
    bootstrapAdminPassword: process.env.ADMIN_PASSWORD || '',
    /** Where the admin panel is served from — used in password reset links. */
    adminUrl: process.env.ADMIN_URL || 'http://localhost:5173',
  },

  ai: {
    apiKey: process.env.GEMINI_API_KEY || '',
    fastModel: process.env.GEMINI_FAST_MODEL || 'gemini-2.5-flash',
    smartModel: process.env.GEMINI_SMART_MODEL || 'gemini-2.5-pro',
    /** When false the whole app falls back to the deterministic summariser. */
    get enabled() {
      return Boolean(this.apiKey);
    },
  },

  jobs: {
    adzunaAppId: process.env.ADZUNA_APP_ID || '',
    adzunaAppKey: process.env.ADZUNA_APP_KEY || '',
    reedApiKey: process.env.REED_API_KEY || '',
  },

  ingest: {
    cron: process.env.INGEST_CRON || '*/30 * * * *',
    enabled: bool(process.env.INGEST_ENABLED, true),
    perSource: int(process.env.INGEST_PER_SOURCE, 15),
    retentionDays: int(process.env.RETENTION_DAYS, 45),
    /** Sources fetched at the same time. Kept low to stay a polite client. */
    concurrency: int(process.env.INGEST_CONCURRENCY, 4),
    /** Identifies us to the sites we fetch, per pr.md §40. */
    userAgent:
      process.env.SCRAPER_USER_AGENT ||
      'Kal-UKFinder/1.0 (+https://github.com/kal-ukfinder; UK jobs and policy aggregator)',
    /** Minimum gap between requests to the same host, unless robots.txt asks for more. */
    politenessMs: int(process.env.SCRAPE_POLITENESS_MS, 1500),
    respectRobots: bool(process.env.RESPECT_ROBOTS, true),
  },

  digest: {
    cron: process.env.DIGEST_CRON || '0 * * * *',
    enabled: bool(process.env.DIGEST_ENABLED, true),
    expoAccessToken: process.env.EXPO_ACCESS_TOKEN || '',
  },
};
