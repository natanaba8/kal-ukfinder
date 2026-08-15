# Kal-UKFinder

**UK jobs, careers news and government policy — aggregated, summarised into plain English, and delivered
to your phone.**

Three parts, one product:

- a **mobile and web app** (one Expo codebase → iOS, Android, browser) with a personalised briefing, job
  search, policy watch and an AI career coach;
- an **admin panel** where a non-technical administrator can add a new website, test it, and switch it on —
  no code change, no deploy;
- a **backend** that collects from RSS, official APIs or HTML, normalises and deduplicates everything, and
  serves it through one API.

```
   Admin panel (shadcn/ui)                Mobile + web app (GlueStack UI)
            │                                    │
            └──────────────┬─────────────────────┘
                           ▼
                    Backend API
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  Authentication       Database         Content engine
   roles · sessions   SQLite + migrations   RSS · API · Scraper
                                              │
                              normalise → dedupe → AI enrich → store
```

---

## Contents

- [What it does](#what-it-does) · [Quick start](#quick-start) · [Adding a website](#adding-a-website-from-the-admin-panel)
- [Stack](#stack) · [Layout](#layout) · [Commands](#commands) · [API](#api)
- [Security](#security) · [Testing](#testing) · [Deploying](#deploying) · [Troubleshooting](#troubleshooting)

---

## What it does

| Area | |
| --- | --- |
| **Briefing** | A personalised feed ranked against the topics you follow. Every story is cut to three bullets, a "what this means for you" line and one suggested next step. |
| **Jobs** | UK vacancy search with filters (category, location, employer, employment type, salary, remote), infinite scroll and match scoring — plus an AI shortlist that names the gaps: visa sponsorship, professional registration, salary floor. |
| **Policy** | Official GOV.UK, ONS and Bank of England output, kept separate from journalism and labelled `OFFICIAL`. |
| **Coach** | Career Q&A using your profile and today's briefings as context; a CV reviewer scored against UK conventions and ATS parsing; interview prep with a practice panel that marks your answers. |
| **Accounts** | Register, sign in, forgot/reset password, change password. Browsing stays open — saving, the coach and notifications need an account. |
| **Notifications** | One personalised digest a day at the hour you choose (UK time), plus a local reminder that works offline. |
| **Admin panel** | Dashboard, source management with a guided add-a-website wizard, content moderation, user management, scrape logs, analytics and settings. |
| **Collection** | Per-source scheduling with exponential backoff, robots.txt compliance, per-host rate limiting, three-pass duplicate detection and a full run history. |

### Where the content comes from

**26 public RSS/Atom feeds, no API key required**, seeded into the database on first boot and editable from
the admin panel afterwards:

- **Official** — DWP, Dept for Education, Dept for Business & Trade, HM Treasury, Home Office, HMRC, DSIT,
  DHSC, Skills England, UK Visas & Immigration, Office for Students, Education & Skills Funding Agency,
  ONS, Bank of England
- **Journalism** — BBC (business, education, technology), The Guardian (careers, work, education, students,
  economics), Sky News (business, politics), The Independent, Personnel Today

Nothing is scraped by default and every card links back to the original page.

---

## Quick start

**Prerequisites:** Node 22.5 or newer (the API uses the built-in `node:sqlite`). No database server, no
Docker, no build step for the backend.

```bash
git clone <this repo>
cd kal-ukfinder
npm run install:all              # server, mobile app, admin panel

cp .env.example server/.env
# set ADMIN_EMAIL and ADMIN_PASSWORD — without them nobody can sign into the admin panel

npm run dev                      # ← API + admin panel + Expo, all in one terminal
```

That one command starts everything. The API and admin logs are prefixed and colour-coded; Expo gets the
terminal to itself so its **QR code and keyboard menu work normally**:

```
Kal-UKFinder — starting api, admin, app
  API    http://localhost:4000        (phone: http://10.0.0.5:4000)
  Admin  http://localhost:5173
  App    Expo
         QR code below · or open exp://10.0.0.5:8081 in Expo Go
         press a = Android · i = iOS · w = web · r = reload
  Ctrl+C stops everything

api   │ listening on http://localhost:4000
admin │ ➜  Local:   http://localhost:5173/

› Metro waiting on exp://10.0.0.5:8081
› Scan the QR code above with Expo Go

  ▄▄▄▄▄▄▄  ▄▀ ▄▄ ▄  ▄▄▄▄▄▄▄
  █ ▄▄▄ █ ▀▄▀█▄▀▄▀▄ █ ▄▄▄ █
  █ ███ █ ▄█▀▄ ▄ ▀█ █ ███ █
  …
```

Scan the QR with Expo Go, or open the `exp://` address shown. The LAN address is printed for you, so a
phone can reach both Metro and the API without any configuration.

Ctrl+C stops all three cleanly and restores the terminal.

| Variant | Starts |
| --- | --- |
| `npm run dev` | API + admin + Expo, pick the target from Expo's menu |
| `npm run dev:web` | …with the app opened in a browser |
| `npm run dev:android` / `dev:ios` | …opened on a connected device or emulator |
| `npm run dev:clean` | …with the Metro cache cleared first |
| `node scripts/dev.mjs api` | API + admin only |

The individual commands (`npm run server`, `npm run web`, `npm run app`, `npm run admin`) still work if you
prefer separate terminals.

That is a complete working system. With no API keys it runs on the 26 public feeds, a rule-based
summariser and a bundled sample vacancy set.

### Optional keys

| Key | What it unlocks | Where to get it |
| --- | --- | --- |
| `GEMINI_API_KEY` | AI-written briefings, conversational coaching, CV rewrites, interview plans, AI job matching | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) |
| `ADZUNA_APP_ID` + `ADZUNA_APP_KEY` | Live UK vacancies | [developer.adzuna.com](https://developer.adzuna.com/) |
| `REED_API_KEY` | Live UK vacancies | [reed.co.uk/developers](https://www.reed.co.uk/developers) |

**Nothing breaks without them.** The summariser falls back to sentence ranking, the coach to a built-in UK
careers knowledge base (redundancy, visas, Universal Credit, Success Profiles, NHS values interviews), and
the CV reviewer to mechanical checks — length, contact details, duty-based phrasing, quantified bullets, UK
spellings, ATS parsing and the keyword gap against the advert. The UI labels which engine answered.

Check `GET /api/status`: `ai.mode` flips from `rule-based` to `gemini`, and `jobProviders` from
`["sample"]` to the boards you configured.

---

## Adding a website from the admin panel

The feature the whole backend is arranged around. An administrator pastes a URL and the platform works out
how to collect it.

```
Admin pastes https://example.gov.uk/jobs
        ↓
robots.txt checked first — a disallowed path stops here with a plain-English reason
        ↓
Detect, in this order:   declared <link rel="alternate"> feed
                       → conventional feed paths (/feed, /rss.xml, …)
                       → JSON API (/wp-json/…, /api/jobs, …)
                       → HTML scraping, with selectors suggested from the page
        ↓
Test — fetches the live site once, writes nothing, and reports per-field hit counts
       ("20 items · title 20/20 · organisation 18/20 · deadline 15/20") plus the
       first five normalised records
        ↓
Save & activate  →  scheduler picks it up on its own interval
        ↓
Adapter → normalise → deduplicate → AI enrich → store → API → app
```

Verified end to end against a live GOV.UK department: detected the Atom feed, tested 20 items, collected
15 new, and a second run classified all 15 as duplicates.

**Collection manners.** An official API or feed is always preferred over scraping. robots.txt is enforced
before any fetch and `Crawl-delay` is honoured. Requests to one host are spaced out. For third-party
articles only a title, short excerpt, source and link are stored — never the full text.

**Duplicate detection** runs three passes, cheapest first: the original URL, then a content hash of the
normalised title plus organisation, then title similarity within a 14-day window. The first source to
publish keeps the record, which preserves attribution.

---

## Stack

| | |
| --- | --- |
| **Mobile + web** | Expo SDK 57 · React Native 0.86 · React 19 · expo-router · react-native-web |
| **Mobile UI** | **GlueStack UI** + NativeWind on the auth, Jobs and Policies screens; a themed StyleSheet kit on the rest |
| **Admin panel** | React 19 · Vite 7 · Tailwind v4 · **shadcn/ui** · React Router · TanStack Query |
| **Backend** | Node 22+ · Express 5 · zod · node-cron · cheerio |
| **Database** | SQLite via the built-in `node:sqlite`, with versioned migrations |
| **AI** | Google Gemini, with a deterministic rule-based fallback for every feature |
| **State** | TanStack Query on both front-ends |

The mobile app deliberately runs two UI layers side by side — GlueStack UI on the new screens, the
original StyleSheet kit on the existing ones — sharing one palette so they are visually indistinguishable.
`apps/mobile/tailwind.config.js` mirrors `src/constants/theme.ts` and the admin panel's tokens.

---

## Layout

```
kal-ukfinder/
├── server/                      Node 22+ API — no build step, no external database
│   ├── src/
│   │   ├── migrations/          Versioned schema; 001 adopts a pre-migration database
│   │   ├── auth/                scrypt hashing, DB-backed sessions, role guards
│   │   ├── content/             The collection engine
│   │   │   ├── adapters/        rss · api · scraper
│   │   │   ├── detect.js        Auto-detection and selector suggestion
│   │   │   ├── robots.js        robots.txt parsing and enforcement
│   │   │   ├── fetcher.js       The only way this codebase talks to a third-party site
│   │   │   ├── normalise.js     Adapter output → the Job and Policy models
│   │   │   ├── dedupe.js        URL → content hash → title similarity
│   │   │   └── engine.js        Orchestrates the above, per source
│   │   ├── scheduler/           Per-source intervals with exponential backoff
│   │   ├── ai/                  Gemini + rule-based fallback, prompts, CV heuristics
│   │   ├── store/               SQLite queries: items · jobs · sources · users · logs
│   │   ├── routes/              Public API, auth, and the guarded /api/admin routes
│   │   └── notifications/       Expo push and the personalised digest
│   └── test/                    120 tests, no API key needed
│
├── apps/admin/                  Vite + React + shadcn/ui
│   └── src/pages/               dashboard · sources · wizard · content · users · logs · analytics
│
├── apps/mobile/                 Expo — iOS, Android and web from one source
│   └── src/
│       ├── app/(tabs)/          Briefing · Jobs · Policy · Coach · You
│       ├── app/(auth)/          sign-in · sign-up · forgot-password
│       ├── components/ui/gs/    GlueStack UI + NativeWind layer
│       └── lib/                 API client, session, notifications
│
├── scripts/
│   ├── dev.mjs                  Runs API + admin + Expo from one command
│   ├── clean.mjs                Clears every build cache
│   ├── prepare-web.mjs          URL-safe filenames for dynamic routes
│   └── serve-dist.mjs           Serves the build the way Vercel does
│
├── vercel.json                  Web app deployment
├── apps/admin/vercel.json       Admin panel deployment
├── render.yaml                  API deployment (one-click blueprint)
└── docs/integration-plan.md     Architecture analysis and build record
```

### App screens

```
(tabs)/index      Briefing — personalised feed, quick actions
(tabs)/jobs       Jobs — search, filter sheet, infinite scroll, AI shortlist
(tabs)/policy     Policy watch — department and category filters, infinite scroll
(tabs)/coach      Career Q&A, with links to CV review and interview prep
(tabs)/profile    Account, profile, topics, job preferences, notifications
item/[id]         Briefing detail — bullets, impact, next step, source link
job/[id]          Vacancy detail — requirements, closing date, apply
cv-review         Paste a CV, get a score and prioritised fixes
interview         Interview plan plus a practice panel that marks answers
saved · sources · onboarding
```

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run install:all` | Install all three packages |
| **`npm run dev`** | **API + admin panel + Expo, one terminal** |
| `npm run clean` | Clear every build cache (Metro, Expo, Vite) |
| `npm run server` | API on :4000 with the collection scheduler |
| `npm run admin` | Admin panel on :5173 |
| `npm run web` / `npm run app` | Expo for web / native |
| `npm run ingest` | Collect every active source now |
| `npm run digest` | Send the notification digest now |
| `npm test` | Server test suite (120 tests) |
| `npm run typecheck` | TypeScript across the app and the admin panel |
| `npm run build:web` | Web export + dynamic-route preparation for static hosting |
| `npm run preview:web` | Serve the build exactly as Vercel will, on :4173 |
| `npm run build:admin` | Admin panel static build |

## API

```
PUBLIC     /api/auth/register · login · refresh · logout · forgot-password · reset-password
           /api/jobs?search=&category=&location=&employmentType=&remote=&page=&pageSize=
           /api/policies · /api/items/:id · /api/jobs/:id · /api/search?q=
           /api/feed · /api/taxonomy · /api/sources · /api/status

SIGNED IN  /api/auth/me · /api/users/me · saved items · notifications
           /api/ai/ask · /api/ai/cv-review · /api/ai/interview

ADMIN      /api/admin/stats · analytics · settings
           /api/admin/sources (+ /detect, /test, /:id/sync, /:id/active)
           /api/admin/jobs · /api/admin/policies · /api/admin/bulk
           /api/admin/users (+ /:id/role, /:id/status)
           /api/admin/scrape-runs (+ /:id/errors)
```

Every list endpoint returns `{ data, page, pageSize, total, pages }`.

---

## Security

- **Passwords** — scrypt from the Node standard library, per-password salt, parameters stored with the
  hash so they can be raised later without invalidating anyone.
- **Sessions** — opaque random tokens, stored only as a SHA-256 hash, rotated on refresh and revocable
  instantly. Disabling an account or changing a role takes effect on the next request.
- **Authorization** — enforced in middleware on the server. The admin panel's route guard only decides
  what to render; a tampered client gets 403s. Every admin route is asserted in the test suite to reject
  both a plain user and an anonymous caller.
- **Rate limiting** — 10 attempts per 15 minutes on credential endpoints, tighter limits on AI and
  source-testing endpoints.
- **Headers and CORS** — helmet, an origin allow-list, and a header check on cookie-authenticated
  mutations.
- **Validation** — every request body and query string is parsed with zod before it reaches a handler.
- **Secrets** — server-side only. The app and the panel never see an API key.

On device the session token is stored in the Keychain / Android Keystore via `expo-secure-store`; the web
build falls back to storage, which is why tokens are short-lived and revocable.

---

## Testing

```bash
npm test                                # 120 server tests
npm run typecheck                       # app + admin panel
npm run build:web && npm run build:admin
```

The suite needs no API key and no network — a fixture website (feed, job listing page, JSON API,
robots.txt) is served on a local port so the collection engine is exercised end to end. It covers
authentication and roles, the source engine and duplicate detection, scheduling and backoff, content
moderation, pagination and filters, and a contract suite that walks the exact call sequence the mobile app
performs and asserts the response shapes its types declare.

---

## Deploying

This is a monorepo with three deployables, and they do not all belong in the same place.

| Part | Where | Why |
| --- | --- | --- |
| Web app | **Vercel** (static) | Pre-rendered HTML per route |
| Admin panel | **Vercel** (static) | Vite SPA |
| API | **Not Vercel** — Render, Railway, Fly, or any VPS | Needs a writable database file and a long-running scheduler |

**Deploy the API first.** Both front-ends are static and useless on their own — they have to be told where
the backend is, at build time. Doing Vercel first means a site that loads and then reports it has no
backend.

### Vercel

`vercel.json` at the repo root builds the **web app**; `apps/admin/vercel.json` builds the **admin panel**.
They are two separate Vercel projects pointed at the same repository.

**Deploying the repo root without these files is what produces `404: NOT_FOUND`** — Vercel finds no build
output and has nothing to serve.

**Project 1 — the web app**

| Setting | Value |
| --- | --- |
| Root Directory | *(leave empty — repo root)* |
| Build & Output | picked up from `vercel.json`, nothing to type |
| Environment variable | `EXPO_PUBLIC_API_URL` = your deployed API, e.g. `https://api.example.com` |

**Project 2 — the admin panel**

| Setting | Value |
| --- | --- |
| Root Directory | `apps/admin` |
| Build & Output | picked up from `apps/admin/vercel.json` |
| Environment variable | `VITE_API_URL` = the same API URL |

Then set `CORS_ORIGIN` on the API to both Vercel origins, comma separated:

```
CORS_ORIGIN=https://kal-ukfinder.vercel.app,https://kal-ukfinder-admin.vercel.app
```

Both env vars are read **at build time**, not runtime — change one and you must redeploy.

#### Why the routing config is needed

expo-router writes a static file per route, and dynamic routes land in files with the parameter in
brackets: `item/[id].html`. Square brackets are reserved in a URL, so `/item/abc123` matches no file and
404s. `npm run build:web` therefore runs `scripts/prepare-web.mjs`, which copies each one to a URL-safe
twin (`item/_id.html`), and `vercel.json` rewrites to it:

```json
{ "source": "/item/:id", "destination": "/item/_id.html" }
```

`cleanUrls` serves `/jobs` from `jobs.html`, and `+not-found.html` catches anything unmatched.

#### Check the routing before you deploy

```bash
npm run build:web      # export + prepare dynamic routes
npm run preview:web    # serves dist exactly as Vercel will, on :4173
```

`scripts/serve-dist.mjs` mirrors `vercel.json` — the same cleanUrls, rewrites and fallback. If a URL works
there it will work on Vercel. Verified across all 25 routes, including `/item/:id` and `/job/:id`.

### The API — deploy this first

**The Vercel site is inert without it.** With no API the app loads, renders its shell, and then every
screen reports that it cannot reach a backend. This is the step people miss.

`render.yaml` in the repo root makes it one click:

1. **render.com → New → Blueprint** → point it at this repository. It reads `render.yaml`, builds
   `server/`, and health-checks `/api/health`.
2. Set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in the Render dashboard (they are marked `sync: false`, so they
   never live in the repo). The first administrator is created on boot.
3. Edit `CORS_ORIGIN` in `render.yaml` to your two Vercel URLs.
4. Copy the URL Render gives you, e.g. `https://kal-ukfinder-api.onrender.com`.

Then in Vercel, set `EXPO_PUBLIC_API_URL` (web app) and `VITE_API_URL` (admin panel) to that URL and
**redeploy both** — those are build-time variables, so setting them alone changes nothing.

On Render's free plan, comment out the `disk:` block. The app still works: migrations run and the 26
sources re-ingest on startup, so content comes back by itself. What does not survive a restart is user
accounts and saved items — fine for a demo, not for real use.

Railway, Fly.io or any VPS work equally well: set the env vars from `.env.example`, give it a writable
path for `server/data/kal-ukfinder.db`, run `npm start`.

**Why not Vercel.** Serverless functions have an ephemeral filesystem, so the SQLite database would vanish
between invocations, and `node-cron` cannot keep a scheduler alive between requests. Hosting the API on
Vercel would mean moving the store to a hosted Postgres and replacing the scheduler with Vercel Cron — a
real change, not a config tweak. `.vercelignore` keeps `server/` out of the web deployment.

### Mobile

`eas build`. Run `eas init` first so a project id is written into `app.json`; that id is what push
notifications are addressed to.

---

## Troubleshooting

**"Cannot reach the Kal-UKFinder server"** — the API is not running, or the phone cannot see your laptop.
On a device the app resolves the API from the host serving the Metro bundle on port 4000; set
`EXPO_PUBLIC_API_URL` to override.

**Nobody can sign into the admin panel** — set `ADMIN_EMAIL` and `ADMIN_PASSWORD` in `server/.env` and
restart the API. The first administrator is created on boot, and only when no administrator exists.

**The feed is empty** — the first collection runs on boot and takes a minute. `npm run ingest` forces it.

**A source keeps failing** — open Scrape logs in the admin panel and click the failed run. The error names
the stage (fetch, parse, normalise, store) and the reason. Sites that block automated clients return
HTTP 403; sites that disallow the path in robots.txt are refused before any request is made.

**A fix does not seem to take effect** — Metro keys its transform cache on the babel config, so after a
config change it will keep serving the old bundle. `npm run clean` then `npm run dev:clean`.

**`404: NOT_FOUND` on Vercel** — the project is deploying the repo root without picking up `vercel.json`,
so there is no build output. Check the project's Root Directory: empty for the web app, `apps/admin` for
the admin panel. If only the deep links 404 (`/item/abc`), the build skipped `scripts/prepare-web.mjs` —
build with `npm run build:web`, not `expo export` directly. Reproduce either locally with
`npm run preview:web`.

**The deployed site loads but says it has no backend** — you have not deployed the API yet. The Vercel
projects are static front-ends; they need somewhere to talk to. Follow "The API — deploy this first"
above, then set `EXPO_PUBLIC_API_URL` (web) and `VITE_API_URL` (admin) and **redeploy both** — those are
read at build time, so setting them without redeploying does nothing.

**The deployed site says the API is "not responding"** — the URL is configured but the request failed.
Three usual causes: the API is asleep (Render's free plan idles after inactivity — the first request takes
~30 seconds), `CORS_ORIGIN` on the API does not include your Vercel origin, or the API is serving `http://`
while the site is `https://`, which browsers block as mixed content.

**Red error screen on the phone** — the app shows a readable error screen rather than a bare red box: it
names what failed, the API address it tried, and the first lines of the stack. Screenshot that.
Notifications are the one known Expo Go limitation — `expo-notifications` was removed from Expo Go on
Android in SDK 53, so reminders need a development build (`npx expo run:android`). Everything else in the
app works in Expo Go.

**`npm install` fails in `apps/mobile` on Windows** — if a previous install was interrupted, some
directories can be left in a delete-pending state that an editor's file watcher keeps alive. Close the
editor, then `rmdir /s /q apps\mobile\node_modules` and reinstall.

---

## Things worth knowing

- **Anonymous accounts.** The app creates one on first launch so browsing works immediately. Registering
  upgrades that same record, so saved items and coach history survive signing up.
- **Sample vacancies.** Listings labelled "Sample listing" are illustrative and bundled with the repo, not
  real adverts. Add a job-board key for live ones.
- **Generated summaries can be wrong.** The app says so on every detail screen and links to the original
  for anything affecting money, visas or legal rights.
- **Not every website may legally be scraped.** The platform prefers feeds and APIs, enforces robots.txt
  and keeps only excerpts — but whoever adds a source is responsible for checking its terms of service.

Architecture decisions, the database schema and the build record are in
[`docs/integration-plan.md`](docs/integration-plan.md).
