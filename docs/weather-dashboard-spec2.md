# UKWX Weather Station Dashboard — Copilot Build Plan v2

## Existing backend and authentication

Treat the DigitalOcean backend as complete. Do not rebuild it.

Public data base:

`https://ukwx.duckdns.org/station-data`

Public endpoints:

- `/current.json`
- `/status.json`
- `/recent.json`
- `/today.json`
- `/archive/YYYY/MM/DD.jsonl`
- `/climate/index.json`
- `/climate/archive/index.json`
- `/climate/archive/{year}.json`
- `/climate/normals/daily.json`
- `/climate/normals/monthly.json`

Annual climate files contain metadata plus a `records` array.

Protected admin API:

`https://ukwx.duckdns.org/station-admin`

Existing endpoints:

- `GET /health`
- `GET /daily/{date}`
- `PATCH /daily/{date}`
- `GET /audit`
- `POST /audit/{id}/revert`

Protected requests require the existing Supabase access token:

```http
Authorization: Bearer <access-token>
```

The backend already validates the user, creates SQLite backups, recalculates mean temperature, republishes the climate JSON and records audit entries.

Reuse the existing frontend authentication:

- `src/lib/supabaseClient.js`
- `/admin/login`
- the existing Supabase browser session

Do not create a new Supabase project, SQL schema, user table, login or service-role key.

## Strict climate rules

- Daily maximum: 06:00–06:00 Europe/London.
- Daily minimum: 18:00–18:00 Europe/London.
- Rainfall: 00:00–00:00 Europe/London.
- Temperature history begins in 1995.
- Rainfall history begins on 1 May 2020.
- Rainfall before 1 May 2020 is unavailable/null, never zero.
- Genuine 0 mm must differ from missing or unavailable rainfall.
- Daily normals: 1995–2024.
- Monthly normals: 1991–2020.
- Units: °C, mm, hPa and mph.
- Rain day: rainfall strictly greater than 0.1 mm.
- Current periods are provisional until complete.
- Incomplete periods must not be ranked as complete.
- Retain every tied record holder.
- Use Europe/London for all date and time logic.

Deployment target:

`https://ukwx.github.io/weatherstation/`

---

# Prompt 1 — Application foundation

```text
Read this specification first. Inspect the existing UKWX repository, React version, package manager, aliases, build process and GitHub Pages deployment before changing anything.

Create only the weatherstation foundation. It will be deployed at /weatherstation/ without breaking the existing UKWX site or admin pages.

Prefer a dedicated weatherstation feature area inside the existing frontend. Configure the build base, router basename and GitHub Pages SPA fallback for direct route refreshes under /weatherstation/.

Create modular folders for pages, components, charts, tables, hooks, API clients, climate utilities, types, config and tests.

Add shared configuration for:
- public data base URL
- station-admin API URL
- Europe/London timezone
- units
- rainfall start date 2020-05-01
- daily normals baseline 1995–2024
- monthly normals baseline 1991–2020

Create typed models, or JSDoc-backed models if the repository remains JavaScript, for live conditions, station status, recent observations, today summary, annual archive payload, climate day, normals, period coverage, records, comparisons, reports and audit entries. All measurements must support null unless the real API guarantees otherwise.

Do not build feature pages yet. Add focused tests for climate constants, nullable formatting, UK dates and leap years. Run lint, tests and a production build before stopping.
```

# Prompt 2 — Public API and calculation layer

```text
Read the specification and inspect the real endpoint responses before defining adapters. Complete only public data fetching, caching and pure climate calculations.

Create a typed API client and hooks for current.json, status.json, recent.json, today.json, climate/index.json, climate/archive/index.json, climate/archive/{year}.json, climate/normals/daily.json and climate/normals/monthly.json.

Annual climate files contain metadata plus a records array. Do not treat them as bare arrays.

Use AbortSignal support, typed errors, request deduplication and stable query keys. Refresh live endpoints about every 60 seconds. Cache annual files separately by year and normals for a long period. Keep the last successful live response visible during temporary failures. Never fetch all years at startup.

Create tested pure utilities for daily mean, monthly mean max/min/temperature, rainfall totals, rain days above 0.1 mm, wettest day, tied extremes, anomalies, rainfall percentage, seasons, completeness, threshold counts and streaks.

Strictly preserve null. Rainfall before 2020-05-01 is unavailable, never zero. Mark current and incomplete periods correctly.

Do not build full pages yet. Run mocked API tests, utility tests, lint and type checks.
```

# Prompt 3 — Shell, routing and visual system

```text
Read the specification. Build the weatherstation shell and route placeholders only.

Create these tabs:
1. Overview
2. Live Data
3. Custom Graphs
4. Climate Archive
5. Normals & Anomalies
6. Records
7. Comparisons
8. Reports
9. Climate Calendar
10. On This Day
11. Station Information
12. Data Corrections

Use a desktop sidebar, collapsible mobile drawer, page header, station-status indicator and dark-mode toggle.

Use a professional white-and-blue design with restrained purple accents, no stock photography, full dark mode, responsive tables/charts and accessible keyboard focus and contrast.

Store theme preference locally and respect the system preference initially.

Build Station Information now. Include Wakefield, coverage dates, units, timezone, official daily windows, normal baselines, missing-data policy, rain-day definition and the difference between live, provisional and finalised values.

Keep Data Corrections hidden or disabled until Prompt 9. Run routing, accessibility, theme, lint and build checks.
```

# Prompt 4 — Overview and Live Data

```text
Read the specification. Complete only Overview and Live Data using the public API hooks.

Overview should display supported current fields for temperature, feels-like, dew point, humidity, pressure, wind, gust, direction, rain rate and daily rainfall. Inspect actual field names and hide unsupported cards rather than inventing data.

Also show observation age, online/offline status, last update, today’s provisional max/min/rainfall, yesterday’s finalised values, current-month summary and available anomalies, recent trends and quick links.

Live Data should contain detailed cards, station health, 1-hour/3-hour/6-hour charts, recent-observation table, automatic refresh, pause/resume and visible last-updated time.

Use recent.json for the normal live page. Do not fetch minute archives unnecessarily.

Clearly label provisional values. A current reading is not an official daily extreme. Preserve chart gaps and show stale/offline warnings. Add responsive and missing-field tests.
```

# Prompt 5 — Climate Archive and Calendar

```text
Read the specification. Complete Climate Archive and the base Climate Calendar.

Use the archive index for year choices and load only the selected annual file.

Climate Archive must include coverage summary, year/month selectors, annual and monthly cards, charts, sortable daily table, date-details drawer, CSV export and links to reports and records.

Monthly summaries must include tied highest maxima, tied lowest minima, mean max/min/temperature, anomalies, rainfall total and percentage, rain days, tied wettest days, expected/valid/missing day counts and complete/provisional state.

Build Climate Calendar with an annual desktop grid, month-only mobile view, max/min/mean/rainfall modes, accessible legends, date details, keyboard navigation and leap-year support.

Use different states for 0 mm, missing rainfall and historically unavailable rainfall. Rainfall before 2020-05-01 is unavailable. 2020 is not a complete rainfall year. Current periods are provisional.

Leave extension points for anomalies and record markers. Add coverage, month-boundary and leap-year tests.
```

# Prompt 6 — Normals, anomalies and On This Day

```text
Read the specification. Complete Normals & Anomalies, On This Day and anomaly modes for Climate Calendar.

Daily normals use 1995–2024. Monthly temperature and rainfall normals use 1991–2020. Label the correct baseline beside every chart and table.

Build daily normal max/min curves, selected-year observations against normals, daily and monthly temperature anomalies, monthly rainfall normal/total/percentage, year-to-date context and positive/negative anomaly tables.

Only calculate an anomaly when both observed and normal values exist.

Add max/min/mean anomaly modes to Climate Calendar while keeping missing and unavailable states distinct.

On This Day should default to today in Europe/London and show daily normals, all four temperature record categories, wettest available year, ties, mean/median, year-by-year observations, anomalies, a chart and links to archive dates.

Handle 29 February using leap years only. Add tests for anomalies, percentages, ties, missing normals and leap day.
```

# Prompt 7 — Records and Comparisons

```text
Read the specification. Complete Records and Comparisons using reusable tested analysis utilities.

Records must include overall records, calendar-date records, daily/monthly/annual rankings, all four temperature record categories, wettest days, warmest/coldest complete months and years, wettest/driest complete rainfall periods, threshold counts, frost days, longest dry/wet/warm/cold spells, record progression and records held by year.

Provide filters for metric, month, season, year range and result count. Retain all ties.

Comparisons must support date, month, year, meteorological season, same period across years and two equal-length custom periods. Compare means, extremes, anomalies, rainfall, rain days, wettest day, thresholds and coverage. Show cards, tables, overlay charts, cumulative rainfall and CSV/PNG exports.

Winter crosses calendar years. Never present incomplete rainfall as complete. Load only required years. Add tests for ties, winter, incomplete periods, thresholds and streaks.
```

# Prompt 8 — Reports and Custom Graphs

```text
Read the specification. Complete deterministic Reports and Custom Graphs. Do not use AI to invent values or meteorological claims.

Monthly reports must include highest max and ties, lowest min and ties, mean temperature/max/min with anomalies, rainfall total/normal/percentage, rain days, wettest day and ties, year-to-date context, rankings, records, missing-data statement and provisional/complete status.

Annual reports must include corresponding annual metrics, monthly breakdown, thresholds, spells, records, rankings and completeness.

Provide print view, professional PNG, CSV and copyable text. Only include pressure, lightning or thunder metadata when a real field exists.

Custom Graphs must support minute, hourly, daily, monthly and annual resolutions, variable selection, multiple series, aggregation, chart type, comparison, normals, running means, temperature range, cumulative rainfall, zoom and exports.

Use selected JSONL days only for intraday graphs. Parse in a Web Worker or incrementally, support cancellation and report malformed lines. Enforce a clear minute-range limit. Use annual climate JSON for daily and coarser resolutions.
```

# Prompt 9 — Existing Supabase login and admin frontend

```text
Read the specification. The DigitalOcean station-admin backend is already complete. Do not create Supabase SQL, another login or another backend.

Reuse src/lib/supabaseClient.js, /admin/login and the existing Supabase browser session.

Create a station-admin client for https://ukwx.duckdns.org/station-admin. Retrieve the current Supabase session and send its access token as a Bearer token on every protected request.

Create a reusable admin-access hook using an authenticated request such as GET /audit?limit=1 as the backend-authoritative permission check:
- 200 authorised
- 401 signed out or expired
- 403 authenticated but unauthorised

Use this to protect Data Corrections and, where safe, strengthen the existing ProtectedAdminRoute without breaking current admin pages. Preserve a return path through /admin/login.

Build Data Corrections with a date picker, GET /daily/{date}, current values and sources, desktop double-click editing, mobile Edit buttons, max/min/rainfall fields, null support, recalculated mean preview, required reason, before/after view and validation.

Negative temperatures are valid. Rainfall cannot be negative. Blank means null. Mean requires max and min. Warn when min exceeds max. Rainfall before 2020-05-01 must remain null. Missing dates are not automatically created.

Do not implement save or audit actions until Prompt 10. Add authentication, permission and validation tests.
```

# Prompt 10 — Corrections, audit, deployment and QA

```text
Read the specification. Finish the Data Corrections workflow against the existing station-admin API and complete final QA.

Implement PATCH /daily/{date}, GET /audit and POST /audit/{id}/revert. Do not update optimistically; wait for the backend response.

After a correction or revert, refetch the admin record and invalidate the affected annual file, archive summaries, calendar, records, comparisons and reports.

Handle 400, 401, 403, 404, 409, 422 and 500 clearly. A 404 means the date is absent; do not offer creation because the current backend edits existing dates only.

Audit UI must show timestamp, date, administrator ID, action, reason, previous values, new values, reverted state and related entry. Add date filtering and revert confirmation.

Final QA:
- all 12 tabs work
- no placeholders remain
- /weatherstation/ and direct route refreshes work on GitHub Pages
- existing UKWX pages and /admin/login still work
- null, unavailable and 0 mm are distinct
- baselines and Europe/London rules are correct
- provisional/incomplete periods are labelled
- incomplete periods are not ranked as complete
- dark mode and mobile layouts work
- heavy routes are lazy loaded
- JSONL parsing does not block the UI
- no full archive is fetched at startup
- no keys, tokens, mock data or debug logs are committed
- station-admin requests always attach the current Supabase token

Add end-to-end tests for public browsing, theme switching, existing-login reuse, admin denial, record loading, correction submission, audit display and revert.

Run lint, all tests and a production build. Summarise deployment steps and any genuine remaining issue.
```
