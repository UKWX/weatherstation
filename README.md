# Wakefield Weather Station

React + TypeScript + Vite frontend for the UKWX personal weather station climatology dashboard.

**Live site:** <https://ukwx.github.io/weatherstation/>

## Project structure

```
src/
  app/        BrowserRouter, route definitions
  pages/      One component per tab (12 tabs)
  components/ Shared UI components
  features/   Domain-specific feature modules
  api/        API client functions
  hooks/      Custom React hooks
  lib/        Pure utility and calculation modules
  types/      TypeScript interfaces and types
  config/     Central constants (URLs, timezones, baselines)
  workers/    Web Workers (e.g. JSONL parser)
  test/       Test setup and shared test utilities
public/
  404.html    GitHub Pages SPA fallback (preserves deep paths)
```

## Local development

```bash
npm install
npm run dev          # development server at http://localhost:5173/weatherstation/
```

The frontend lives at repository root. No backend service runs in this repository.

## Required environment variables

Create `.env.local`:

```bash
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<supabase-anon-key>
```

These values are only used for shared administrator session discovery and protected `station-admin` requests.

## Quality checks

```bash
npm run type-check       # TypeScript type checking
npm run lint:frontend    # oxlint
npm run format:check     # Prettier check
npm run test:frontend    # Vitest unit tests
npm run build:frontend   # production build
```

## GitHub Pages deployment

### URL

```
https://ukwx.github.io/weatherstation/
```

The Vite `base` is hardcoded to `/weatherstation/` so all built assets use that prefix.

### GitHub Pages SPA routing

GitHub Pages serves static files and returns a 404 for unknown paths. For a React single-page application this means direct navigation to deep routes (e.g. `/weatherstation/climate-archive`) would normally fail.

The `public/404.html` fallback encodes the requested path into the query string and redirects to the app root. A small inline script in `index.html` reads that query string and calls `history.replaceState` to restore the original path before React Router mounts. No hash routes are used.

Example: a direct refresh of `/weatherstation/climate-archive` is transparently restored.

### Automatic deployment

The `.github/workflows/deploy.yml` workflow runs on every push to `main` or `UKWX`. It:

1. Installs dependencies with `npm ci`.
2. Runs type-checking, lint, and unit tests.
3. Runs `npm run build:frontend` (Vite build with base `/weatherstation/`).
4. Uploads `dist/` and deploys to GitHub Pages.

The deployed site is separate from `UKWX.github.io`. No source code in this repository references the `UKWX.github.io` repository.

### React Router

```tsx
<BrowserRouter basename="/weatherstation">
```

All internal links are relative to the basename and work correctly both locally (dev server) and on GitHub Pages.

## Route structure (12 tabs)

- `/` Overview
- `/live-data`
- `/custom-graphs`
- `/climate-archive`
- `/normals-anomalies`
- `/records`
- `/comparisons`
- `/reports`
- `/climate-calendar`
- `/on-this-day`
- `/station-information`
- `/data-corrections` (protected)

## Public station-data endpoints

Data is served by a separate DigitalOcean backend. Public endpoints are under `https://ukwx.duckdns.org/station-data`. See `docs/weather-dashboard-spec.md` §3 for the full contract.

Primary endpoints used by the app:

- `/current.json`
- `/status.json`
- `/recent.json`
- `/today.json`
- `/climate/index.json`
- `/climate/archive/index.json`
- `/climate/archive/{year}.json`
- `/climate/normals/daily.json`
- `/climate/normals/monthly.json`

Public data is read-only in this application.

## Protected station-admin behaviour

- Protected base URL: `https://ukwx.duckdns.org/station-admin`
- `/data-corrections` requires an existing Supabase session.
- Signed-out users are redirected to `https://ukwx.github.io/admin/login` with a safe local return path.
- Authorisation is checked by probing `/audit?limit=1`.
- Every protected request obtains the current token immediately before fetch and sends it in the HTTP Authorization header.
- Admin operations edit existing records only; missing records are not created.

## Shared login behaviour

The dashboard and `ukwx.github.io/admin` share origin and Supabase project configuration, so an existing admin login session is reused automatically when present.

## Testing commands

```bash
npm run lint:frontend
npm run type-check
npm run test:frontend
npx playwright test
npm run build:frontend
```

## Known genuine limitations

- Data Corrections depends on external Supabase/session availability.
- GitHub Pages cannot serve dynamic server-rendered routes; deep-link restoration is handled by the SPA fallback.
- Admin writes are constrained by backend safety checks (for example, conflicting later edits can block reverts).
