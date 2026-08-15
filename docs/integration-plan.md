# Kal-UKFinder → Jobs & Policy Aggregator Platform

**Integration plan for `pr.md`.** Written before any code, as §43 requires.

Short version: roughly **40% of what pr.md asks for already exists** in this project — the aggregation
engine, normalised job/policy models, duplicate detection, background sync, favourites, search, filtering
and notifications are all working today. The real work is **authentication and roles, a database-driven
source system with a scraper engine, an admin panel, and the two UI libraries**. Nothing existing needs to
be rewritten to get there.

---

## A. Existing project analysis

```text
Framework:      Expo SDK 57 · React Native 0.86 · React 19.2 · expo-router v57 (file-based)
                react-native-web for the web build — one codebase, three targets
Language:       TypeScript (app, strict) · JavaScript ESM (server, no build step)
Backend:        Node 24 · Express 5 · node-cron · zod validation
Database:       SQLite through the built-in node:sqlite (DatabaseSync), WAL mode
                Raw SQL, no ORM. Schema created by CREATE TABLE IF NOT EXISTS at boot.
                *** No migration system. ***
Authentication: *** None. *** A row in `users` is created on first launch; its UUID lives in
                AsyncStorage and is passed as a plain `userId` parameter. No passwords, no
                tokens, no roles, no authorization checks anywhere.
UI:             Custom StyleSheet component kit (Screen, Card, Chip, Button, TextField,
                states) over a token file. No UI library.
State:          TanStack Query v5 (server state) · React context `SessionProvider` (session)
                · AsyncStorage (user id, onboarding flag)
API:            REST under /api, one router per domain, zod-validated. CORS open by default.
Deployment:     Not configured. Web = expo export → static dist. Mobile = EAS, not initialised.
                Server = plain `node src/index.js`.
```

### Current architecture

```text
  Expo app (iOS · Android · Web)
        │  fetch + TanStack Query, userId as a query param
        ▼
  Express API  ──────────────────────────────┐
        │                                     │
        ├── ingest.js (node-cron, every 30m)  │  ai/ (Gemini + rule-based fallback)
        │      │                              │   ├── enrich    summarise + classify
        │      ├── sources/feeds.js            │   ├── coach     Q&A, CV, interview
        │      │   26 HARDCODED RSS/Atom feeds │   └── fallback  deterministic engine
        │      └── sources/jobs.js             │
        │          Adzuna · Reed · sample      │
        ▼                                      │
  node:sqlite ── items · jobs · users · devices · saved_items · messages
                 notifications · ingest_runs
```

### What already satisfies pr.md

| pr.md | Status | Where |
| --- | --- | --- |
| §9 RSS/Atom collection | **Done** — tolerant parser, per-source isolation, 26 live feeds | `sources/rss.js` |
| §13 Automatic background sync | **Done** — node-cron every 30 min, configurable | `ingest.js`, `index.js` |
| §14 Job data model | **Mostly** — missing `requirements`, `deadline` | `store/jobs.js` |
| §15 Policy data model | **Mostly** — excerpt-only by design, links to original | `store/items.js` |
| §16 Duplicate detection | **Partial** — unique on URL hash; no title/content similarity | `store/items.js` |
| §20 Favourites, search, filter | **Done** | `routes/feed.js`, `routes/jobs.js`, `saved_items` |
| §25 Search & filtering | **Done**; pagination has `limit`/`offset` but no totals | `routes/*` |
| §35 Notifications | **Done** — Expo push, per-user digest hour, local schedule, tap routing | `notifications/` |
| §36 Performance | **Partial** — indexes and query caching yes; no pagination metadata | — |
| §38 Error handling | **Done** — one dead source never stops a run | `ingest.js`, `sources/rss.js` |
| §40 Legal posture | **Done by design** — RSS-first, excerpt only, always links to source | throughout |

### What is missing

Authentication · roles and authorization · admin panel · database-driven sources · HTML scraper engine ·
source testing and preview · per-source scheduling · scrape logs · content moderation · user management ·
pagination metadata · rate limiting · security headers · migrations · robots.txt compliance.

### Files that must remain untouched

The AI layer (`server/src/ai/*`), the notification pipeline (`server/src/notifications/*`), the RSS parser,
and the five existing mobile screens are all working and tested. They get *extended*, never replaced.

---

## B. Proposed architecture

```text
                    ┌──────────────────────────┐
                    │  apps/admin  (NEW)       │
                    │  Vite · React · shadcn   │
                    └────────────┬─────────────┘
                                 │  Bearer session token
                                 ▼
   ┌──────────────────── Express API (extended) ─────────────────────┐
   │                                                                  │
   │  auth/         sessions, scrypt hashing, roles, guards           │
   │  routes/admin/ sources · jobs · policies · users · logs · stats  │
   │  content/      ContentEngine  ─┬─ RssAdapter      (existing)     │
   │                                ├─ ApiAdapter      (Adzuna/Reed)  │
   │                                ├─ ScraperAdapter  (NEW, cheerio) │
   │                                └─ AutoDetect      (NEW)          │
   │  scheduler/    per-source intervals, robots.txt, rate limiting   │
   │  ai/           unchanged — enrichment still runs on every item   │
   └────────────────────────────────┬─────────────────────────────────┘
                                    ▼
        node:sqlite + migrations — sources · jobs · items · users
        sessions · scrape_runs · scrape_errors · favourites · settings
                                    │
                                    ▼
                    ┌──────────────────────────┐
                    │  apps/mobile (extended)  │
                    │  GlueStack UI on new     │
                    │  screens, existing kit   │
                    │  kept where it works     │
                    └──────────────────────────┘
```

**Key inversion:** `sources/feeds.js` stops being the runtime registry and becomes *seed data* for a
`sources` table. After that migration an admin adds a source in the panel and the scheduler picks it up on
the next tick — no code change, which is pr.md's central requirement (§6, §42.7).

### Stack decisions and why

| Decision | Choice | Reasoning |
| --- | --- | --- |
| Admin panel host | **Vite + React SPA** in `apps/admin` | shadcn/ui supports Vite officially. Next.js would add a second server for SSR we don't need — the API already exists. Ships as static files. |
| Database | **Stay on node:sqlite**, add a migration runner | §42.17 "use the existing project's technologies", §42.18 "no unnecessary dependencies". Postgres is a later swap behind the same store layer. |
| ORM | **None** — keep raw SQL | Adding Prisma/Drizzle now would mean rewriting all 5 store modules, which §42.1 forbids. Migrations give us the versioning §29 actually asks for. |
| Auth tokens | **Opaque DB-backed sessions**, SHA-256 hashed at rest | Revocable instantly (needed for §27 "disable account"), no JWT-signing footguns, no crypto dependency. |
| Password hashing | **scrypt** from `node:crypto` | Memory-hard, in the standard library, no native build step on Windows. |
| New dependencies | `cheerio`, `helmet`, `express-rate-limit` (server) | Each maps to a hard requirement: §8 selectors, §28 headers, §28 rate limiting. robots.txt parsing is ~40 lines, written in-house. |

---

## C. Files to change

Additive edits only. No file below loses functionality.

| File | Change |
| --- | --- |
| `server/src/db.js` | Replace boot-time `CREATE TABLE` block with a migration runner; keep the same exports |
| `server/src/index.js` | Mount auth + admin routers, helmet, rate limiters, cookie parsing; swap the ingest cron for the per-source scheduler |
| `server/src/ingest.js` | Read sources from the database; delegate to the ContentEngine; write `scrape_runs`/`scrape_errors` per source |
| `server/src/sources/feeds.js` | Becomes seed data consumed by a migration (kept, not deleted) |
| `server/src/sources/jobs.js` | Adzuna/Reed become registered API adapters rather than a hardcoded call |
| `server/src/store/items.js` | Add `status`, `featured`, `content_hash`, `source_url`, `category`; add `countItems(filters)` for pagination |
| `server/src/store/jobs.js` | Add `requirements`, `deadline`, `employment_type`, `status`, `featured`, `content_hash`; add filtered count |
| `server/src/store/users.js` | Add `email`, `password_hash`, `role`, `status`, `last_login_at`; keep anonymous users working |
| `server/src/routes/feed.js`, `jobs.js` | Return `{ data, page, pageSize, total }`; apply `status = 'published'` filter |
| `server/src/routes/users.js` | Route through the auth guard; `/users/me` replaces `userId`-in-URL |
| `server/src/routes/notifications.js`, `ai.js` | Take the user from the session instead of the request body |
| `apps/mobile/src/lib/session.tsx` | Real auth state: tokens in SecureStore, login/register/logout, anonymous fallback |
| `apps/mobile/src/lib/api.ts` | Attach `Authorization`, refresh on 401, paginated response types |
| `apps/mobile/src/app/(tabs)/jobs.tsx`, `policy.tsx` | Rebuild in GlueStack UI with the new filters and infinite scroll |
| `apps/mobile/src/app/(tabs)/profile.tsx` | Account section: sign in/out, change password, preferences |
| `apps/mobile/app.json`, `package.json` | GlueStack + NativeWind config |
| `README.md`, `.env.example` | Auth secrets, admin bootstrap, new commands |

## D. Files to create

```text
server/src/
├── migrations/            001_initial · 002_auth · 003_sources · 004_content_fields
│                          005_scrape_logs · 006_seed_sources · runner.js
├── auth/                  passwords.js · sessions.js · guard.js (requireAuth, requireRole)
├── content/
│   ├── engine.js          orchestrates adapter → normalise → dedupe → enrich → store
│   ├── adapters/          rss.js · api.js · scraper.js · index.js (registry)
│   ├── detect.js          §9 auto-detection: RSS link tags, /feed, /rss.xml, JSON API probes
│   ├── normalise.js       adapter output → Job | Policy
│   ├── dedupe.js          URL · content hash · normalised-title similarity
│   └── robots.js          robots.txt fetch, cache, allow/deny, crawl-delay
├── scheduler/index.js     per-source intervals, concurrency cap, backoff on failure
├── store/                 sources.js · sessions.js · scrapeLogs.js · settings.js
├── routes/
│   ├── auth.js            register · login · logout · refresh · forgot · reset · change
│   └── admin/             sources.js · content.js · users.js · logs.js · stats.js
└── middleware/            rateLimit.js · security.js · errors.js

apps/admin/                Vite · React 19 · TS · Tailwind v4 · shadcn/ui · react-router
├── src/pages/             Dashboard · Sources · SourceWizard · SourceDetail · Jobs
│                          Policies · Users · ScrapeLogs · Analytics · Settings · Login
├── src/components/ui/     shadcn primitives (generated)
├── src/components/        AppSidebar · DataTable · StatCard · SelectorTester · SourceForm
└── src/lib/               api.ts · auth.tsx · query.ts

apps/mobile/src/
├── app/(auth)/            sign-in · sign-up · forgot-password · reset-password
├── components/ui/         GlueStack provider + wrapped primitives
└── lib/auth.ts            token storage (expo-secure-store), refresh queue
```

---

## E. Database schema

Additive migrations. Existing tables keep their names and columns so nothing in flight breaks.

```text
users            id · email(unique,null) · password_hash · display_name · role · status
 │                profile(JSON) · email_verified_at · last_login_at · created_at · updated_at
 │                role ∈ USER | EDITOR | ADMIN | SUPER_ADMIN
 │                status ∈ ACTIVE | DISABLED
 ├──< sessions           id · user_id · token_hash · user_agent · ip · expires_at · revoked_at
 ├──< password_resets    id · user_id · token_hash · expires_at · used_at
 ├──< favourites         (existing saved_items) user_id · entity · entity_id
 ├──< devices            (existing) push tokens
 └──< messages           (existing) coach history

sources          id · name · base_url · content_type(JOB|POLICY|BOTH) · method(AUTO|RSS|API|SCRAPER)
 │                rss_url · api_url · scrape_url · selectors(JSON) · headers(JSON)
 │                active · moderation(AUTO_PUBLISH|REQUIRE_APPROVAL) · scrape_interval_minutes
 │                publisher · trust · default_topics(JSON) · last_sync_at · last_status
 │                consecutive_failures · created_by · created_at · updated_at
 ├──< jobs        + source_id · organization · location · employment_type · category
 │                  salary_text/min/max · description · requirements · deadline
 │                  published_at · original_url · content_hash · status · featured
 └──< items       + source_id · category · source_url · content_hash · status · featured
                    (policies/articles — existing table, extended)

scrape_runs      id · source_id · started_at · finished_at · status · items_found
 │                items_new · items_updated · items_duplicate · error_count · triggered_by
 └──< scrape_errors  id · run_id · source_id · stage · message · detail · created_at

settings         key · value(JSON) · updated_at
notifications    (existing) delivery log
```

**Indexes** (§29): `jobs(category, published_at)`, `jobs(location)`, `jobs(organization)`,
`jobs(deadline)`, `jobs(source_id)`, `jobs(content_hash)`, `items(category, published_at)`,
`items(source_id)`, `items(content_hash)`, `users(email)`, `sessions(token_hash)`,
`scrape_runs(source_id, started_at)`.

**Migration safety:** `001_initial` re-declares today's schema with `IF NOT EXISTS`, so an existing
`kal-ukfinder.db` is marked applied and untouched. `006_seed_sources` copies the 26 feeds from
`feeds.js` into `sources`, keyed by URL, so nothing is lost and re-running is a no-op.

---

## F. API design

New endpoints only where equivalent functionality doesn't exist (§30 last line).

```text
PUBLIC
  POST   /api/auth/register            email + password → user + tokens
  POST   /api/auth/login               rate limited, 5/15min per IP+email
  POST   /api/auth/refresh             rotates the session token
  POST   /api/auth/logout              revokes it
  POST   /api/auth/forgot-password     always 200, never leaks whether the email exists
  POST   /api/auth/reset-password
  GET    /api/jobs         ?search &category &location &organization &employmentType
                           &page &pageSize      → { data, page, pageSize, total }
  GET    /api/jobs/:id
  GET    /api/policies     ?search &category &page &pageSize
  GET    /api/policies/:id
  GET    /api/search       ?q  → { jobs, policies }
  GET    /api/taxonomy · /api/sources (public register) · /api/status

AUTHENTICATED  (Bearer session token)
  GET    /api/auth/me · PATCH /api/users/me · POST /api/auth/change-password
  GET    POST DELETE  /api/favourites
  POST   /api/ai/ask · /api/ai/cv-review · /api/ai/interview        (existing, now guarded)
  GET    POST         /api/notifications/*                          (existing, now guarded)

ADMIN  (requireRole ADMIN — enforced in middleware, never in the client)
  GET    /api/admin/stats                 dashboard counters (§5)
  CRUD   /api/admin/sources
  POST   /api/admin/sources/detect        §9 auto-detect from a bare URL
  POST   /api/admin/sources/test          §7 dry run, returns a preview, writes nothing
  POST   /api/admin/sources/:id/sync      §12 manual "Sync Now"
  PATCH  /api/admin/sources/:id/active
  GET    /api/admin/scrape-runs · /api/admin/scrape-runs/:id/errors
  GET    PATCH DELETE /api/admin/jobs · /api/admin/policies   (hide · feature · approve)
  GET    PATCH DELETE /api/admin/users                        (role · disable · enable)
  GET    PUT   /api/admin/settings
```

Existing routes keep working: `/api/feed` (the personalised briefing) is untouched, and `/api/jobs`
gains filters and pagination without breaking its current shape.

## G. Admin panel structure

```text
Login  →  role check  →  Dashboard

Dashboard      stat cards (jobs · policies · active sources · failed sources · users ·
               collected today) · latest activity · last successful and failed sync
Content
  ├ Jobs       DataTable · search · filters · hide/feature/delete · bulk actions
  └ Policies   same
Sources
  ├ All        table: Name · Type · Method · Status · Last sync · row actions
  │            (View · Edit · Test · Sync Now · Enable · Disable · Delete)
  ├ Add        7-step wizard (§32): basics → type → method → configure →
  │            test → preview → save & activate
  └ Logs       run history per source; a failed row opens its error detail
Users          table · change role · disable · enable · delete
Analytics      collection volume over time, per-source success rate, top categories
Settings       global scrape interval, default moderation mode, retention, AI toggle
Profile        admin's own account and password
```

shadcn primitives used: sidebar, table, card, dialog, sheet, form, input, select, tabs, badge,
dropdown-menu, pagination, toast (sonner), skeleton, alert, switch, tooltip.

## H. Mobile structure

Existing navigation is kept (§22: *adapt, don't replace*). The current five tabs already map onto
pr.md's suggestion — `Briefing` is Home, `You` is Profile, and Saved is reachable from both.

```text
(auth)     sign-in · sign-up · forgot-password · reset-password     NEW, GlueStack
(tabs)
  Briefing   unchanged — personalised feed, existing kit
  Jobs       REBUILT in GlueStack: search, filter sheet (category · location ·
             organization · employment type), infinite scroll, richer job card
  Policy     REBUILT in GlueStack: search, category chips, infinite scroll
  Coach      unchanged — Q&A, CV review, interview prep
  You        + account section (sign in/out, change password, preferences)
job/[id]     + requirements, deadline, "Apply / View original posting"
item/[id]    unchanged
saved        + tab split between jobs and policies
```

Browsing stays open to signed-out users; saving, the coach and notifications require an account. When a
signed-out user with local history signs up, their anonymous record is claimed rather than discarded.

## I. Scraping architecture — end to end

```text
1  ADMIN ADDS A WEBSITE
   Pastes https://example.com/jobs, picks JOB, leaves method on AUTO.

2  AUTO-DETECT                                    POST /api/admin/sources/detect
   robots.txt fetched and cached first — if the path is disallowed, stop here and say so.
   Then, in order (§9, §40 "prefer API → RSS → permitted scraping"):
     a. <link rel="alternate" type="application/rss+xml|atom+xml"> in the page head
     b. Common paths: /feed · /rss · /rss.xml · /atom.xml · /index.xml
     c. JSON endpoints: /api/jobs · /wp-json/wp/v2/posts · ?format=json
     d. None found → fall through to SCRAPER, and suggest selectors by finding the
        largest set of repeating sibling elements that contain a link and a date
   Returns the resolved method plus what it found, so the form fills itself in.

3  CONFIGURE                                      selectors only when method = SCRAPER
   item · title · url · description · image · date · organization · location · deadline

4  TEST                                           POST /api/admin/sources/test
   Dry run against the live site. Writes nothing. Returns per-field hit counts —
   "20 items · title 20/20 · organization 18/20 · deadline 15/20" — and the first
   five normalised records so the admin sees real output before activating.
   Failures are specific: unreachable · blocked by robots.txt · selector matched
   nothing · items found but no title · date unparseable.

5  SAVE & ACTIVATE                                row in `sources`, active = true

6  SCHEDULER                                      every minute, picks due sources
   due = last_sync_at + scrape_interval_minutes < now, respecting crawl-delay,
   a global concurrency cap, and exponential backoff after consecutive failures.

7  ADAPTER                                        RSS | API | SCRAPER by source.method
   One adapter failing is logged and isolated — the run continues (§38).

8  NORMALISE                                      → Job or Policy
   Excerpt only for third-party articles, never the full body (§15, §40).

9  DEDUPE                                         original URL → content hash →
   normalised-title-plus-organization match within a 14-day window.

10 ENRICH                                         existing ai/enrich.js, unchanged —
   summary bullets, "what this means for you", topics, audience, importance.

11 STORE + LOG                                    rows written; scrape_runs updated with
   found / new / updated / duplicate / errors; failures detailed in scrape_errors.

12 SERVE                                          status = 'published' (or 'pending' when
   the source requires approval) → paginated API → mobile app.
```

---

## Phasing

| Phase | Work | Verification |
| --- | --- | --- |
| 1 | Migration runner + auth schema + scrypt + sessions + guards | tests: register, login, bad credentials, role denial |
| 2 | Auth routes, rate limiting, helmet, CORS lockdown; existing routes moved onto the guard | tests: 401/403 paths, existing routes still work |
| 3 | `sources` table, seed from `feeds.js`, source store + admin CRUD | tests: seed is idempotent, CRUD, active toggle |
| 4 | ContentEngine: adapter registry, auto-detect, scraper, robots, normalise, dedupe | tests: fixture HTML/RSS, dedupe cases, robots deny |
| 5 | Scheduler, scrape logs, manual sync, test-source endpoint | tests: due calculation, backoff, run/error logging |
| 6 | Jobs/policies APIs: filters, pagination totals, moderation status | tests: filter matrix, pagination, hidden items excluded |
| 7 | Admin panel — Vite + shadcn, all pages, guarded routes | manual: full click-through, build passes |
| 8 | Mobile auth screens in GlueStack; session rework | manual + typecheck |
| 9 | Jobs and Policy screens rebuilt in GlueStack, infinite scroll | manual + typecheck |
| 10 | Favourites, profile preferences, search polish | manual |
| 11 | Analytics, settings, moderation queue | manual |
| 12 | Full pass against pr.md §39 | test suite green, web build green |

## Risks I want on the record

1. **GlueStack UI — adopted, after picking the wrong package first.** *(Resolved during Phase 8.)*

   The first attempt used `@gluestack-ui/core@5.0.15` and failed hard. That package reaches Adobe's
   entire design system transitively: `@react-types/dialog` — a *types-only* package — declares
   `@react-spectrum/dialog` as a **runtime dependency**, and `@react-types/overlays` does the same with
   `@react-spectrum/overlays`. The resulting tree nests past the Windows path limit, and npm could
   neither finish the install nor clean up after itself:

   ```
   npm error ENOTEMPTY: directory not empty, rmdir
     ...node_modules\@gluestack-ui\core\node_modules\@react-aria\overlays\node_modules\react-aria\dist
   ```

   **The fix was the package choice, not the environment.** GlueStack UI v2 — the generation the docs
   describe and what "GlueStack UI" normally means — ships each component as its own small package:
   `@gluestack-ui/button@1.0.14` has three dependencies, none of them Adobe's. That set installs in
   **two minutes with 466 packages**, versus a v5 tree that never completed.

   **What is on GlueStack now** (pr.md §21, §42.15):

   ```
   Phase 8   (auth)      sign-in · sign-up · forgot-password
   Phase 9   (content)   Jobs screen · Policy screen · filter sheet · job card · briefing card
   ```

   The layer lives in `apps/mobile/src/components/ui/gs/`: behavioural components come from the headless
   packages (`createButton`, `createInput`, `createFormControl`, `createActionsheet`), and layout and
   typography are React Native primitives with NativeWind classes. `tailwind.config.js` mirrors the
   tokens in `constants/theme.ts` and the admin panel's palette, so the GlueStack screens and the older
   StyleSheet screens sit side by side without clashing — which is what §21's "gradually integrate,
   don't replace the whole UI" asks for.

   Verified: typecheck clean, `expo export` produces 25 routes, and NativeWind emits a real 14KB
   stylesheet containing the custom tokens (`rounded-card`, `bg-brand`, `text-ink`) rather than silently
   compiling to nothing.

2. **The app's `node_modules` is damaged and needs one clean reinstall.** *(Environment, not code.)*

   The aborted v5 installs left several directories in a Windows *delete-pending* state — writes into
   them silently vanish. VS Code's file watchers hold the handles, so nothing short of closing the editor
   releases them. Two packages are affected: an empty `@gluestack-ui/core` husk, and `sucrase/dist`,
   which NativeWind needs at metro-config time.

   To get a verified build I copied a good `sucrase/dist` to `sucrase/dist-fix` and repointed that
   package's `main`. **That edit is inside `node_modules` only — no repo file is affected** — but it
   means the tree here is not what a fresh clone produces. Fix it properly with:

   ```
   # close VS Code first, then:
   rmdir /s /q apps\mobile\node_modules
   npm --prefix apps/mobile install
   ```

   A fresh clone on any machine skips all of this: `package.json` is correct, and the v2 packages
   install cleanly.
2. **Install time.** This machine's npm throughput is slow — the Expo install took ~50 minutes. shadcn
   pulls a large Radix tree and GlueStack pulls NativeWind. I will start those installs early and work on
   server code while they run.
3. **Scraping legality.** robots.txt is enforced before any fetch, per-source crawl-delay is respected, and
   the test step refuses to preview a disallowed path. Admins can still add a source they have their own
   permission for, but the default is conservative.
4. **Auth is a behaviour change for existing users.** Anonymous accounts keep working and are claimed on
   sign-up, so nobody loses saved items or coach history.
