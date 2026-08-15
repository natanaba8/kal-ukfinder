# Kal-UKFinder — admin panel

React + Vite + Tailwind v4 + **shadcn/ui**. Static build, talks to the Kal-UKFinder API.

```bash
npm install
npm run dev          # http://localhost:5173, proxies /api to localhost:4000
npm run build        # static files in dist/
npm run typecheck
```

## Signing in

The first administrator is created by the API on boot. Set these in `server/.env` and restart it:

```
ADMIN_EMAIL=you@example.com
ADMIN_PASSWORD=a-long-password
```

Nothing here can be reached without an `ADMIN` or `SUPER_ADMIN` account. The route guard in `App.tsx` only
decides what to render — every endpoint is independently authorised on the server, so a tampered client
gets 403s rather than data.

## Pages

```
/                Dashboard — collection health, today's counts, recent runs
/jobs            Job moderation — search, filter, publish/hide/feature/delete, bulk actions
/policies        The same for policy articles
/sources         Every configured source, with sync/enable/disable/delete
/sources/new     7-step wizard: website → content → method → configure → test → preview → activate
/sources/:id     Settings, field mapping, and that source's run history
/logs            Every collection run; a failed row opens its error detail
/users           Accounts — change role, disable, delete
/analytics       Collection volume and per-source success rate
/settings        Platform defaults, crawler behaviour, your own password
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `VITE_API_URL` | Point a built panel at a deployed API. Unset in development — Vite proxies `/api` instead. |

The palette in `src/index.css` mirrors the mobile app's tokens, so the two products look like one.
