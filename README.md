# ECL Web

Next.js frontend for the ECL (Expected Credit Loss) platform.

## Prerequisites

- Node.js 20+
- npm

The backend (`ECL-Server`) is **optional for marketing pages** (`/`, `/pricing`, `/security`). Protected routes (`/dashboard`, `/runs`, etc.) load data client-side and require the backend to be running for live data.

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in AUTH_SECRET, AUTH_URL, BACKEND_URL, NEXT_PUBLIC_API_URL
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Expected dev timings

| Step | Target |
|------|--------|
| `next dev` ready | < 3s |
| First page load (`GET /`) | < 5s |
| Warm restart + page load | < 1s ready, < 500ms page |

If startup takes minutes, see [Troubleshooting](#troubleshooting-slow-dev) below.

## Environment variables

Copy `.env.example` to `.env.local`:

| Variable | Purpose |
|----------|---------|
| `AUTH_SECRET` | NextAuth JWT encryption |
| `AUTH_URL` | Canonical app URL (e.g. `http://localhost:3000`) |
| `BACKEND_URL` | Server-side API base (e.g. `http://localhost:8000`) |
| `NEXT_PUBLIC_API_URL` | Browser-accessible API base |

Optional:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_RQ_DEVTOOLS` | Set to `1` to enable React Query Devtools in development |

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server (Turbopack) |
| `npm run dev:clean` | Purge turbopack cache, then start dev |
| `npm run cache:prune` | Remove `.next/dev/cache/turbopack` only |
| `npm run cache:reset` | Remove entire `.next` directory |
| `npm run build` | Production build (validates env first) |
| `npm run start` | Start production server |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Run TypeScript check |

## Troubleshooting slow dev

Dev startup is **not blocked by the backend**. Slow starts are almost always caused by Turbopack filesystem cache bloat or slow disk I/O on `.next/dev`.

### Quick fixes

1. **Prune the cache:**
   ```bash
   npm run cache:prune
   npm run dev
   ```

2. **Full reset if still slow:**
   ```bash
   npm run cache:reset
   npm run dev
   ```

3. **Use clean start shortcut:**
   ```bash
   npm run dev:clean
   ```

### Root causes

- **Turbopack cache bloat** — `.next/dev/cache/turbopack` can grow to gigabytes and cause 40s+ compaction hangs. This project disables persistent FS cache (`turbopackFileSystemCacheForDev: false`) in `next.config.ts` to prevent recurrence.
- **Slow filesystem** — If you see `Slow filesystem detected` in the terminal, check whether the project folder is under cloud sync (Google Drive, Dropbox, OneDrive, iCloud). Exclude `.next/` from sync or move the project to a local path like `~/Projects/ECL`.
- **Antivirus scanning** — Realtime AV on `.next/dev/cache/turbopack` (thousands of small files) can slow I/O. Add the project `.next` folder to exclusions.

### Phantom service worker / stale module errors

If you see errors like `next-themes ... module factory is not available` even though this project uses a custom theme provider (not `next-themes`), a **stale browser cache or old service worker** is serving outdated JavaScript chunks.

1. Hard-reload the page (Ctrl+Shift+R / Cmd+Shift+R)
2. Clear site data in DevTools → Application → Storage
3. Run `npm run cache:reset && npm run dev`

The app automatically unregisters stale service workers on load and serves a self-removing `/sw.js` for legacy PWA registrations.

### Phantom service worker

If the browser requests `/sw.js`, it may be from an old PWA registration. The app serves an empty response at `/sw.js` to avoid triggering full compiles on cold start. Clear site data in DevTools if issues persist.

## Architecture notes

- **Marketing pages** — Static SSR, no backend calls at startup.
- **Protected routes** — NextAuth JWT in middleware + shell layout; data fetched client-side via React Query after hydration.
- **Backend dependency** — Required for login, dashboard data, etc. Not required for `next dev` to start or for marketing pages to render. When the API is down, protected pages show a banner and inline notices instead of crashing.

## Production

```bash
npm run build
npm run start
```

Build output uses `output: "standalone"` for container deployment.
