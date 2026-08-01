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

## Quick start

```bash
npm install
npm run dev          # development server at http://localhost:5173/weatherstation/
```

## Quality checks

```bash
npm run type-check       # TypeScript type checking
npm run lint:frontend    # oxlint
npm run format:check     # Prettier check
npm run test:frontend    # Vitest unit tests
npm run build:frontend   # production build
```

## Deployment

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

### Backend

Data is served by a separate DigitalOcean backend. Public endpoints are under `https://ukwx.duckdns.org/station-data`. See `docs/weather-dashboard-spec.md` §3 for the full contract.
