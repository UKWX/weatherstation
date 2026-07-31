# UKWX Weather Station Dashboard
## Complete Master Specification and 15 Sequential GitHub Copilot Prompts

**Version:** 3.0  
**Frontend repository:** `weatherstation`  
**Deployment URL:** `https://ukwx.github.io/weatherstation/`  
**Existing login repository:** `UKWX.github.io`  
**Public weather backend:** `https://ukwx.duckdns.org/station-data`  
**Protected admin backend:** `https://ukwx.duckdns.org/station-admin`

---

# 1. How to use this document

Add this file to the root of the new `weatherstation` repository as:

```text
docs/weather-dashboard-spec.md
```

Then give GitHub Copilot the prompts in order, one at a time.

For every prompt:

1. Copilot must read this file first.
2. Copilot must inspect the repository before changing code.
3. Copilot must complete only the requested stage.
4. Review the result in the browser.
5. Run the tests and production build.
6. Commit the completed stage before moving to the next prompt.

The prompts are intentionally modular. They contain enough detail to build each feature properly without asking Copilot to implement the entire application in one operation.

Do not skip the master specification. The prompts refer back to it rather than repeating every rule in full.

---

# 2. Repository and deployment architecture

## 2.1 New weatherstation repository

The new dashboard is being developed in a separate GitHub repository named:

```text
weatherstation
```

Its GitHub Pages URL will be:

```text
https://ukwx.github.io/weatherstation/
```

The project must not assume that it is deployed at the root `/`.

For a Vite project, configure:

```ts
base: "/weatherstation/"
```

For React Router, use:

```tsx
<BrowserRouter basename="/weatherstation">
```

Provide a GitHub Pages single-page-application fallback so direct navigation and refreshes work for routes such as:

```text
https://ukwx.github.io/weatherstation/climate-archive
https://ukwx.github.io/weatherstation/data-corrections
```

Use a proven `404.html` path-preservation redirect approach, or another clean solution that preserves BrowserRouter URLs. Do not silently switch to hash routes unless there is a genuine deployment blocker.

## 2.2 Existing UKWX.github.io repository

The existing main UKWX website and admin login live in a different repository:

```text
UKWX.github.io
```

The existing login URL is:

```text
https://ukwx.github.io/admin/login
```

The existing Supabase client in that repository is:

```text
src/lib/supabaseClient.js
```

The new `weatherstation` repository cannot import that source file directly.

Instead, create a small Supabase browser client inside `weatherstation` that connects to the **same Supabase project** using the same public URL and anon/publishable key.

The two deployed applications share the same web origin:

```text
https://ukwx.github.io
```

Therefore, when the same Supabase project and default storage key are used, the weatherstation application should be able to read the existing persisted browser session.

Do not create:

- A second Supabase project.
- A second user account.
- A new user table.
- A service-role key in the browser.
- New Supabase SQL.
- A duplicate password form inside the weatherstation application.

## 2.3 Authentication redirect

When the weatherstation application has no valid session, redirect with a full-page navigation to:

```text
https://ukwx.github.io/admin/login
```

Preserve the intended return URL, for example:

```text
https://ukwx.github.io/admin/login?returnTo=%2Fweatherstation%2Fdata-corrections
```

The weatherstation repository must not assume that its own React Router controls `/admin/login`.

A small companion change may later be made in the `UKWX.github.io` repository so its login page safely honours `returnTo`. That return path must be validated as a local path beginning with `/weatherstation/`; never allow an arbitrary external redirect URL.

---

# 3. Existing DigitalOcean backend

The DigitalOcean backend is already built, running and tested.

Do not recreate it in the frontend repository.

## 3.1 Public station-data service

Base URL:

```text
https://ukwx.duckdns.org/station-data
```

Available public endpoints:

```text
/current.json
/status.json
/recent.json
/today.json
/archive/YYYY/MM/DD.jsonl
/climate/index.json
/climate/archive/index.json
/climate/archive/{year}.json
/climate/normals/daily.json
/climate/normals/monthly.json
```

### Annual climate response

An annual file is an object containing metadata and a `records` array. It is not a bare array.

The object includes fields such as:

```text
station
year
generated_at_utc
complete
through
observation_count
units
records
```

Example record:

```json
{
  "date": "2026-07-29",
  "max_temp_c": 26.3,
  "min_temp_c": 17.5,
  "mean_temp_c": 21.9,
  "rainfall_mm": 0.0
}
```

The frontend must validate the actual response and preserve its metadata.

## 3.2 Protected station-admin service

Base URL:

```text
https://ukwx.duckdns.org/station-admin
```

Available endpoints:

```text
GET   /health
GET   /daily/{date}
PATCH /daily/{date}
GET   /audit
POST  /audit/{id}/revert
```

`GET /health` is public.

Every other endpoint requires:

```http
Authorization: Bearer <current Supabase access token>
```

The backend independently:

- Validates the Supabase token.
- Permits only the configured administrator.
- Reads and updates SQLite.
- Recalculates mean temperature.
- Creates a database backup before a correction or revert.
- Regenerates the public climate JSON.
- Writes an audit entry.
- Prevents an unsafe revert when the record has changed since the selected audit entry.

The frontend must treat backend authorisation as authoritative.

## 3.3 Admin response contracts

### GET `/daily/{date}`

Successful response:

```json
{
  "record": {
    "date": "2026-07-29",
    "year": 2026,
    "month": 7,
    "day": 29,
    "max_temp_c": 26.3,
    "min_temp_c": 17.5,
    "mean_temp_c": 21.9,
    "rainfall_mm": 0.0,
    "temperature_source": "manual",
    "rainfall_source": "manual"
  }
}
```

A missing date returns `404`.

The current backend edits existing records only. It does not create missing dates.

### PATCH `/daily/{date}`

Send one or more explicitly supplied measurement fields plus a reason:

```json
{
  "max_temp_c": 26.4,
  "min_temp_c": 17.5,
  "rainfall_mm": 0.0,
  "reason": "Corrected from checked station record"
}
```

The request is a partial patch:

- Omit an unchanged field.
- Send a field as `null` only when intentionally clearing it.
- Always send `reason`.
- Never turn an empty input into zero.

Successful response contains:

```text
status
record
audit_id
backup
```

### GET `/audit`

Optional query parameters:

```text
climate_date=YYYY-MM-DD
limit=1..500
```

Successful response:

```json
{
  "entries": [],
  "count": 0
}
```

Each entry may contain:

```text
id
action
climate_date
admin_user_id
reason
created_at_utc
reverted_at_utc
reverted_by_user_id
related_audit_id
previous_record
new_record
```

### POST `/audit/{id}/revert`

Successful response contains:

```text
status
record
original_audit_id
revert_audit_id
backup
```

## 3.4 Expected admin errors

Handle these explicitly:

- `400`: invalid request.
- `401`: missing, invalid or expired login session.
- `403`: authenticated but not authorised.
- `404`: record or audit entry not found.
- `409`: conflict, already reverted or later record change.
- `422`: validation failure.
- `500`: backend or exporter failure.
- `503`: Supabase authentication service unavailable.

Do not replace these messages with a generic “Something went wrong” when the response contains a useful safe explanation.

---

# 4. Strict meteorological and climate rules

These rules are authoritative.

## 4.1 Official daily windows

### Maximum temperature

```text
06:00 to 06:00 Europe/London
```

### Minimum temperature

```text
18:00 to 18:00 Europe/London
```

### Rainfall

```text
00:00 to 00:00 Europe/London
```

The frontend must not recalculate official finalised daily values from minute observations.

Official daily values come from the climate archive.

Minute observations are for live and intraday displays only.

## 4.2 Historical coverage

Temperature records begin:

```text
1995-01-01
```

Rainfall records begin:

```text
2020-05-01
```

Rainfall before 1 May 2020 is unavailable and must be represented as:

```text
null
```

It must never be changed to `0`.

The year 2020 is not a complete rainfall year.

## 4.3 Meaning of values

The following states must remain distinct:

- `0.0 mm`: genuine dry day.
- `null`: unavailable or missing.
- Provisional: period has not finished.
- Finalised: value is published in the climate archive.
- Incomplete: expected observations are missing.

Suggested presentation:

- Genuine zero: `0.0 mm`.
- Missing: `—`.
- Historically unavailable rainfall: `Unavailable`.
- Provisional: visible badge.
- Incomplete: visible warning with valid/expected day count.

## 4.4 Units

Use:

- Temperature: `°C`
- Rainfall: `mm`
- Pressure: `hPa`
- Wind: `mph`

## 4.5 Timezone

Use:

```text
Europe/London
```

Use UK date formatting and daylight-saving-aware logic.

Do not use the viewer’s local timezone for climate-day assignment.

## 4.6 Normals

Daily temperature normals:

```text
1995–2024
```

Monthly temperature and rainfall normals:

```text
1991–2020
```

Every relevant chart, report and table must show the correct baseline.

Do not label one baseline as the other.

## 4.7 Rain day

A rain day is:

```text
rainfall_mm > 0.1
```

Exactly `0.1 mm` is not counted as a rain day.

## 4.8 Meteorological seasons

- Winter: December, January, February.
- Spring: March, April, May.
- Summer: June, July, August.
- Autumn: September, October, November.

Winter comparisons must support crossing calendar years.

## 4.9 Mean temperature

Daily mean:

```text
(maximum + minimum) / 2
```

Return `null` unless both maximum and minimum exist.

Use published `mean_temp_c` when available. A calculated value may be used for validation and correction previews.

## 4.10 Ties

Retain every tied:

- Date.
- Year.
- Record holder.
- Wettest day.
- Highest or lowest extreme.

Never arbitrarily select only the first tie.

---

# 5. Climate calculations and completeness

Keep climate calculations in pure, tested modules rather than page components.

## 5.1 Monthly calculations

Calculate:

- Highest valid daily maximum.
- Lowest valid daily minimum.
- Mean of valid daily maxima.
- Mean of valid daily minima.
- Mean of valid daily means.
- Total valid rainfall.
- Count of rain days greater than 0.1 mm.
- Wettest valid day.
- All tied dates.
- Expected days.
- Valid days per metric.
- Missing days per metric.
- Completion state.
- Provisional state.

Do not divide temperature means by the number of calendar days when values are missing. Divide by the number of valid values and display coverage.

## 5.2 Anomalies

Temperature anomaly:

```text
observed - normal
```

Rainfall percentage:

```text
observed / normal * 100
```

Rainfall difference:

```text
observed - normal
```

Only calculate when both values exist.

Handle a missing or zero normal safely.

## 5.3 Complete month

A temperature month is complete for a metric when every expected date has that metric.

A rainfall month is complete when:

- The period is within rainfall availability.
- Every expected date has a valid rainfall value.

May 2020 may be complete if every date from 1–31 May is present.

## 5.4 Complete year

A temperature year is complete when all expected dates have the required temperature metric.

A rainfall year is complete only when every date from 1 January to 31 December has valid rainfall.

Therefore:

- 2020 cannot be a complete rainfall year.
- The current year is provisional until it ends.
- Incomplete years must not appear in rankings that require complete annual coverage.

## 5.5 Thresholds and streaks

Support tested calculations for:

- Days at or above 20°C.
- Days at or above 25°C.
- Days at or above 30°C.
- Frost days below 0°C.
- Rain days.
- Heavy-rain thresholds selected by the user.
- Dry spells.
- Rain-day spells.
- Warm spells.
- Cold spells.

Streak calculations must break on missing values unless the feature explicitly offers a documented alternative.

---

# 6. Required application tabs

The application must contain these 12 tabs:

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

Do not leave placeholder pages after the final prompt.

---

# 7. Visual and interaction requirements

## 7.1 General style

Use:

- Clean white presentation in light mode.
- Blue as the primary interface colour.
- Restrained purple accents.
- Professional meteorological appearance.
- Clear hierarchy.
- Good spacing.
- Subtle borders and shadows.
- No stock photography.
- No gimmicky weather backgrounds.

## 7.2 Dark mode

Dark mode must cover:

- Navigation.
- Cards.
- Tables.
- Charts.
- Tooltips.
- Modals.
- Calendars.
- Forms.
- Loading states.
- Error states.
- Exports where practical.

Store the chosen mode locally and respect the operating-system preference on first load.

## 7.3 Desktop

Use:

- Sidebar navigation.
- Multi-column overview.
- Full tables.
- Annual climate calendar.
- Wider comparison and report layouts.

## 7.4 Mobile

Use:

- Collapsible navigation drawer.
- Touch-friendly controls.
- Horizontal table scrolling where necessary.
- Single-month calendar.
- Clear chart controls.
- Explicit edit buttons instead of relying only on double-click.
- No clipped tooltips or unusably small axes.

## 7.5 Accessibility

Include:

- Semantic headings.
- Accessible labels.
- Keyboard navigation.
- Visible focus states.
- Modal focus management.
- Good colour contrast.
- Text or icons in addition to colour.
- Reduced-motion support where practical.
- Text summaries for important charts.

---

# 8. Performance requirements

- Do not fetch all annual files on startup.
- Cache annual files separately by year.
- Cache normals for a long period.
- Refresh live endpoints approximately every 60 seconds.
- Keep the last successful live response during temporary failures.
- Lazy-load heavy routes.
- Memoise expensive derived calculations.
- Use a Web Worker for large JSONL parsing.
- Cancel obsolete requests when filters change.
- Do not request multiple years of minute-level data.
- Preserve chart gaps rather than interpolating missing values.
- Avoid giant page components.
- Avoid unnecessary dependencies.

---

# 9. Testing and completion requirements

Use the repository’s selected test system. Prefer Vitest and React Testing Library for a new Vite project.

Test at least:

- Rainfall unavailable before 1 May 2020.
- Genuine zero rainfall.
- Daily mean.
- Rain-day threshold.
- Leap years and 29 February.
- Winter across calendar years.
- Monthly and annual completeness.
- Null-safe totals and averages.
- Record ties.
- Anomalies.
- Rainfall percentage.
- API response validation.
- Live stale/offline states.
- Theme persistence.
- GitHub Pages route restoration.
- Shared Supabase session detection.
- Admin `401`, `403`, `404`, `409` and `422`.
- Partial correction payloads.
- Explicit null correction.
- Audit display.
- Revert refresh.

At the end of every prompt:

- Run lint.
- Run type-checking.
- Run relevant tests.
- Run a production build where practical.
- Fix errors introduced by that prompt.
- Summarise changed files.
- Summarise tests run.
- State any genuine unresolved blocker.

---

# 10. Companion prompt for the existing UKWX.github.io repository

This is a separate one-off prompt. Use it only in the existing `UKWX.github.io` repository after the weatherstation authentication flow is ready.

```text
Inspect the existing UKWX.github.io repository and its current AdminLoginPage. Make one tightly scoped enhancement without changing the existing Supabase project, login credentials, admin pages or styling.

Add support for an optional `returnTo` query parameter on `/admin/login`.

Security requirements:

- Accept only a local path beginning with `/weatherstation/`.
- Reject full URLs, protocol-relative URLs, backslashes, encoded external URLs and all other paths.
- Fall back to the existing admin destination when the parameter is absent or invalid.
- After a successful login, perform a full-page redirect to the validated return path.
- Preserve the existing login behaviour for normal visits.
- Do not expose tokens in the URL.
- Do not add another Supabase client.

Add focused tests for valid and invalid return paths. Run the existing tests and production build. Keep this change isolated from the weatherstation repository.
```

---

# 11. Fifteen sequential weatherstation Copilot prompts

## Prompt 1 — Scaffold the separate repository and GitHub Pages deployment

```text
Read docs/weather-dashboard-spec.md in full and treat it as authoritative.

This is the separate `weatherstation` repository, not the existing UKWX.github.io repository. Inspect the current repository before changing anything.

Complete only the application scaffold and deployment foundation.

Create or standardise a React + TypeScript + Vite application using the repository’s existing package manager. Add strict TypeScript settings and sensible path aliases.

Configure production deployment under:

https://ukwx.github.io/weatherstation/

Requirements:

- Vite base must be `/weatherstation/`.
- React Router must use the correct basename.
- Create a GitHub Pages deployment workflow for the repository.
- Add a reliable `404.html` SPA fallback that preserves deep paths and query strings.
- Confirm direct refreshes can restore routes such as `/weatherstation/climate-archive`.
- Do not alter the separate UKWX.github.io repository.

Create the initial folder structure:

src/app
src/pages
src/components
src/features
src/api
src/hooks
src/lib
src/types
src/config
src/workers
src/test

Add placeholder routes for all 12 required tabs, but do not implement their feature content yet.

Add baseline tooling:

- lint
- formatting
- type-check command
- unit tests
- production build
- optional Playwright configuration for later end-to-end tests

Create a small deployment documentation section in the README.

Acceptance checks:

- Development server runs.
- Production build succeeds.
- Built asset paths contain `/weatherstation/`.
- All placeholder routes render through the router.
- The existing main UKWX website is not referenced as source code.
- No mock weather values are introduced.
```

## Prompt 2 — Build domain models, strict rules and calculation utilities

```text
Read docs/weather-dashboard-spec.md. Complete only domain modelling, configuration and pure utilities.

Create strongly typed models for:

- current conditions
- station status
- recent observation
- provisional today summary
- archive index
- annual climate payload
- climate day
- daily normal
- monthly normal
- monthly summary
- annual summary
- period coverage
- record entry
- comparison selection
- comparison result
- report data
- admin daily record
- audit entry
- structured API error

All measurements must support null unless the actual endpoint contract guarantees a value.

Create central configuration for:

- public station-data base URL
- station-admin base URL
- Europe/London timezone
- units
- temperature start date
- rainfall start date
- daily-normal baseline
- monthly-normal baseline
- rain-day threshold

Implement pure tested helpers for:

- parsing ISO climate dates without accidental timezone shifts
- Europe/London display formatting
- nullable measurement formatting
- daily mean temperature
- safe average
- safe total
- ties
- temperature anomalies
- rainfall percentage
- meteorological seasons
- expected days
- month/year completeness
- provisional periods
- threshold counts
- dry/wet/warm/cold streaks

Strict rules:

- Rainfall before 2020-05-01 is unavailable/null.
- Genuine zero must remain zero.
- Mean is null unless max and min exist.
- Rain day is strictly greater than 0.1 mm.
- Winter crosses years.
- Missing values break streaks.
- Keep all tied holders.

Do not fetch APIs or build feature pages yet.

Add comprehensive unit tests, including leap years, 29 February, 2020 rainfall coverage and incomplete current periods.
```

## Prompt 3 — Build public API clients, validation, caching and adapters

```text
Read docs/weather-dashboard-spec.md. Complete only the public data access layer.

Inspect the real response shape of every public endpoint before finalising types. Do not guess field names.

Build a typed fetch client with:

- runtime validation
- AbortSignal support
- structured errors
- JSON parse protection
- timeout handling
- request cancellation
- safe retry behaviour

Create hooks or query functions for:

- /current.json
- /status.json
- /recent.json
- /today.json
- /climate/index.json
- /climate/archive/index.json
- /climate/archive/{year}.json
- /climate/normals/daily.json
- /climate/normals/monthly.json

The annual climate response contains metadata plus `records`. Preserve:

- complete
- through
- observation_count
- generated_at_utc
- units

Use TanStack Query when no equivalent remote-state library exists.

Caching requirements:

- Live endpoints refresh around every 60 seconds.
- Keep previous live data during a temporary refresh failure.
- Cache archive index.
- Cache annual files independently by year.
- Cache normals for a long period.
- Never fetch all years at startup.
- Expose query keys that can later invalidate one affected year after an admin correction.

Create adapter functions between raw live payloads and internal models. Unsupported fields must remain absent/null rather than fabricated.

Add mocked tests for:

- valid payloads
- missing optional fields
- malformed annual payload
- null values
- 404
- network timeout
- cancelled request
- stale live response
```

## Prompt 4 — Build the design system, shell, routing and shared states

```text
Read docs/weather-dashboard-spec.md. Complete only the application shell and reusable interface system.

Build:

- desktop sidebar
- mobile navigation drawer
- top header
- active-route state
- page title and description area
- station online/offline indicator
- theme toggle
- main content container
- responsive card grid
- reusable table wrapper
- reusable modal
- tooltip
- badge
- skeleton
- empty state
- error state with retry
- stale-data warning
- provisional badge
- incomplete-data warning
- unavailable-data display

Implement all 12 navigation items.

Use the specified white-and-blue design with restrained purple accents. Support full dark mode, not just a dark page background.

Create shared chart tokens for:

- axis text
- grid lines
- tooltips
- normal/reference series
- observed series
- missing values
- provisional series

Create Station Information now. Include:

- Wakefield, United Kingdom
- temperature coverage from 1995
- rainfall coverage from 1 May 2020
- official max/min/rainfall windows
- units
- timezone
- normal baselines
- rain-day definition
- live vs provisional vs finalised explanation
- missing-data policy
- public endpoint attribution

Keep Data Corrections unavailable until Prompt 14.

Test keyboard navigation, mobile navigation, theme persistence and key accessibility states.
```

## Prompt 5 — Build the Overview dashboard fully

```text
Read docs/weather-dashboard-spec.md. Complete only the Overview tab to a production-quality level.

Use current, status, recent, today, archive index and the latest annual climate file as required.

Build a clear hierarchy:

1. Station status header:
   - online/offline
   - observation time
   - observation age
   - last successful update
   - stale warning

2. Current condition cards, only when supported:
   - temperature
   - feels-like
   - dew point
   - humidity
   - pressure
   - wind speed
   - gust
   - direction
   - rain rate
   - today’s live rainfall

3. Today’s provisional climate card:
   - provisional maximum
   - provisional minimum
   - provisional rainfall
   - clear explanation that finalised values use different official windows

4. Yesterday’s finalised card:
   - max
   - min
   - mean
   - rainfall
   - link to the archive date

5. Current month context:
   - highest max
   - lowest min
   - mean max
   - mean min
   - mean temperature
   - rainfall total
   - rain days
   - valid/expected coverage
   - temperature and rainfall anomaly where normals are available
   - provisional label

6. Compact recent charts:
   - temperature
   - pressure
   - rainfall or rain rate where available

7. Quick links:
   - Live Data
   - Climate Archive
   - Records
   - Reports

Do not invent unsupported live fields. Do not use a current reading as an official daily extreme. Preserve missing chart gaps.

Add responsive behaviour, chart text summaries and tests for stale data, offline station, missing fields and absent yesterday record.
```

## Prompt 6 — Build Live Data fully

```text
Read docs/weather-dashboard-spec.md. Complete only the Live Data tab.

Use current.json, status.json and recent.json for the normal live view.

Create:

- detailed current-condition panel
- station-health panel
- observation age and retrieval time
- refresh countdown
- pause/resume automatic refresh
- manual refresh action
- selectable 1-hour, 3-hour and 6-hour ranges
- measurement selector
- recent-observations table

Build dedicated responsive charts for supported fields:

- temperature and feels-like
- humidity and dew point
- pressure
- wind and gust
- rainfall/rain rate

Requirements:

- Use actual endpoint fields through adapters.
- Preserve missing gaps.
- Use Europe/London timestamps.
- Use configured units.
- Clearly show stale/offline conditions.
- Do not load JSONL files for this page unless recent.json genuinely lacks enough data and the fallback is explicitly isolated.
- Avoid constant chart animation on each minute refresh.
- Keep the previous successful chart visible when the latest fetch fails.

Recent table should support:

- timestamp
- key measurements
- compact mobile mode
- sorting newest/oldest
- visible missing values
- optional CSV export of the currently loaded recent data

Add tests for range filtering, refresh pause, failed refresh, missing readings and responsive controls.
```

## Prompt 7 — Build Climate Archive fully

```text
Read docs/weather-dashboard-spec.md. Complete only the Climate Archive tab.

Use climate/archive/index.json for coverage and year options. Load only the selected annual file.

Provide:

- archive coverage header
- selected year
- selected month
- annual/monthly view switch
- URL query parameters for selected year/month
- loading and retry states
- data coverage summary

Annual view:

- annual mean max
- annual mean min
- annual mean temperature
- highest max and tied dates
- lowest min and tied dates
- rainfall total with completeness label
- rain days
- wettest day and ties
- monthly breakdown table
- annual temperature chart
- monthly rainfall chart
- missing-data warnings

Monthly view:

- highest max and tied dates
- lowest min and tied dates
- mean max
- mean min
- mean temperature
- anomalies
- rainfall total
- rainfall percentage of normal
- rain days
- wettest day and ties
- coverage counts
- provisional/complete state
- daily max/min chart
- daily rainfall chart
- cumulative rainfall option

Daily table:

- date
- max
- min
- mean
- rainfall
- anomaly where loaded
- status
- sortable columns
- mobile compact mode
- CSV export

Selecting a day opens a details drawer with values, normals, anomalies and links to On This Day and Data Corrections when authorised.

Strictly distinguish 0 mm, missing and unavailable rainfall. Never describe 2020 as a complete rainfall year. Add tests for year/month switching, missing dates, ties, partial periods and CSV content.
```

## Prompt 8 — Build Climate Calendar and On This Day fully

```text
Read docs/weather-dashboard-spec.md. Complete Climate Calendar and On This Day.

Climate Calendar:

- annual desktop grid
- single-month mobile view
- year selector
- month navigation
- metric selector
- max, min, mean and rainfall modes
- accessible legend
- keyboard navigation
- selected-day details panel
- record marker extension
- provisional marker
- missing-data style
- historically unavailable rainfall pattern
- direct URL state where practical

Use separate appropriate scales for each metric. Do not use the same colour logic for temperature and rainfall. Add text/icon cues so colour is not the only signal.

Selecting a date should show:

- max
- min
- mean
- rainfall
- relevant normals
- anomalies
- data status
- links to archive, On This Day and authorised correction page

On This Day:

- default to today in Europe/London
- month/day picker
- URL query state
- normal max and min
- highest max and ties
- lowest max and ties
- highest min and ties
- lowest min and ties
- wettest available year and ties
- valid mean and median
- year-by-year table
- historical chart
- anomaly by year
- archive links

29 February must include leap years only and explain the smaller sample. Rainfall before its availability must remain unavailable.

Add tests for calendar mapping, metric scales, leap day, ties, keyboard selection and URL restoration.
```

## Prompt 9 — Build Normals & Anomalies fully

```text
Read docs/weather-dashboard-spec.md. Complete only Normals & Anomalies.

Use daily normals, monthly normals and lazily loaded selected-year climate data.

Create sections for:

1. Baseline explanation:
   - daily normals 1995–2024
   - monthly normals 1991–2020
   - no misleading combined baseline label

2. Daily temperature normals:
   - normal max curve
   - normal min curve
   - selected-year max/min overlay
   - optional shaded normal temperature range
   - daily anomaly chart
   - hover values and date details

3. Monthly temperature anomalies:
   - mean max anomaly
   - mean min anomaly
   - mean temperature anomaly
   - table and chart
   - positive/negative styling

4. Monthly rainfall:
   - observed total
   - 1991–2020 normal
   - difference
   - percentage of normal
   - incomplete-period warning

5. Year-to-date context:
   - selected year against normals
   - current-year provisional state
   - observed coverage
   - careful handling of expected rainfall when only monthly normals are available

6. Anomaly ranking tables:
   - warmest/coldest departures
   - wettest/driest valid departures
   - selected period filters

Only calculate when observed and normal exist. Do not fabricate daily rainfall normals. Clearly label any prorated estimate and prefer completed-month context.

Add tests for missing normals, zero normal, partial month, baseline labels and anomaly sorting.
```

## Prompt 10 — Build Records Centre fully

```text
Read docs/weather-dashboard-spec.md. Complete only the Records tab as a full records centre.

Load archive years lazily. Create a reusable indexed analysis layer so switching record views does not repeatedly recompute everything unnecessarily.

Sections:

1. Overall station records:
   - highest daily max
   - lowest daily min
   - highest daily min
   - lowest daily max
   - wettest available day
   - warmest/coldest complete month
   - wettest/driest complete rainfall month
   - warmest/coldest complete year
   - wettest/driest complete rainfall year

2. Daily rankings:
   - highest/lowest maxima
   - highest/lowest minima
   - wettest days
   - top N selector
   - month and season filters
   - ties

3. Calendar-date records:
   - month/day selector
   - four temperature record categories
   - wettest available year
   - record sample size
   - ties

4. Monthly rankings:
   - mean max
   - mean min
   - mean temperature
   - rainfall
   - complete-period filtering

5. Annual rankings:
   - mean max
   - mean min
   - mean temperature
   - rainfall for complete years only

6. Thresholds:
   - 20°C, 25°C and 30°C days
   - frost days
   - rain days
   - custom heavy-rain threshold

7. Spells:
   - longest dry
   - longest wet
   - longest warm
   - longest cold
   - start/end dates
   - missing-data rule

8. Record progression:
   - chronological record evolution
   - ties
   - record breaks
   - chart and table
   - current records held by each year

Provide filters, CSV export and links back to archive dates.

Never rank null values. Never include incomplete rainfall years in complete-year rainfall rankings. Add extensive tests for ties, completeness, thresholds and streaks.
```

## Prompt 11 — Build Comparisons fully

```text
Read docs/weather-dashboard-spec.md. Complete only Comparisons.

Comparison modes:

- date vs date
- month vs month
- year vs year
- season vs season
- same period across several years
- two equal-length custom periods

Create a guided selector that prevents invalid combinations and stores valid selections in URL query parameters.

For each selected period calculate:

- mean max
- mean min
- mean temperature
- highest max
- lowest min
- rainfall total
- rainfall percentage of normal
- rain days
- wettest day
- temperature anomaly
- threshold counts
- valid/expected coverage
- provisional/complete state

Presentation:

- side-by-side summary cards
- absolute differences
- percentage differences where meaningful
- daily or monthly overlay charts
- temperature range chart
- cumulative rainfall chart
- coverage panel
- clear winner/warmer/wetter language only when supported
- CSV export
- PNG export
- shareable URL

Rules:

- Winter crosses calendar years.
- Custom periods must have equal duration for direct comparison.
- Missing values remain missing.
- Do not claim rainfall comparison completeness when either side is incomplete.
- Do not fetch unrelated years.
- Current periods must be labelled provisional.
- Avoid misleading percentage comparison when the reference is zero.

Add tests for selection validation, winter, leap-day periods, equal duration, incomplete rainfall and URL restoration.
```

## Prompt 12 — Build Reports fully

```text
Read docs/weather-dashboard-spec.md. Complete only Reports.

Reports must be deterministic. Do not use an LLM to invent values, causes or meteorological explanations.

Create monthly and annual report generators.

Monthly report must calculate and display:

- TMax and all tied dates
- TMin and all tied dates
- TMean and anomaly
- mean max and anomaly
- mean min and anomaly
- rainfall total
- rainfall normal
- rainfall percentage
- rain days above 0.1 mm
- wettest day and all ties
- year-to-date rainfall
- expected year-to-date rainfall where valid
- monthly temperature ranking
- monthly rainfall ranking where coverage permits
- records set or tied
- valid/expected/missing day counts
- provisional/complete state

Support a compact copyable format similar to:

TMax 26.3°C (29th)
TMin 7.4°C (11th)
TMean 17.9°C (+3.4°C avg)
Mean max 22.8°C (+3.7°C avg)
Mean min 13.0°C (+3.0°C avg)
Rainfall 34.5 mm (53.2% avg)
Rain days (>0.1 mm) 15
Wettest day 13.3 mm (11th)
Annual rainfall 396.9 mm

The example is formatting only. Always use selected-period values.

Annual report must include:

- annual means and anomalies
- highest max
- lowest min
- rainfall total and percentage
- rain days
- wettest day
- monthly breakdown
- rankings
- thresholds
- spells
- records
- completeness statement

Exports:

- clean print view
- professional social-media PNG
- CSV source data
- copyable text
- optional downloadable JSON report model

Only include pressure, lightning, thunder or manually entered metadata when an actual endpoint/data field exists. Never fabricate those sections.

Add snapshot and calculation tests, including ties, missing data and provisional reports.
```

## Prompt 13 — Build Custom Graphs and scalable JSONL parsing fully

```text
Read docs/weather-dashboard-spec.md. Complete only Custom Graphs and its data-processing infrastructure.

Supported resolutions:

- minute
- hourly
- daily
- monthly
- annual

Controls:

- one or more variables
- start and end date/time
- resolution
- aggregation
- chart type
- comparison series
- normal overlay
- running mean
- cumulative rainfall
- temperature range shading
- zoom/reset
- legend controls
- PNG export
- CSV export

Presets:

- last hour
- last 3 hours
- last 6 hours
- today
- last 7 days
- month to date
- year to date

Data selection:

- Minute/intraday uses `/archive/YYYY/MM/DD.jsonl`.
- Daily and coarser uses annual climate JSON.
- Do not fetch the full minute archive.
- Enforce a documented minute-range limit.
- Estimate file count before fetching.
- Allow cancellation.

Implement a Web Worker or incremental parser that:

- parses line by line
- ignores blank lines
- validates each object
- counts malformed lines
- reports partial-success warnings
- supports cancellation
- does not freeze the UI

Aggregation must use Europe/London boundaries and preserve null gaps.

Chart rules:

- choose sensible defaults by variable
- rainfall bars/cumulative modes
- temperature line/range modes
- no misleading interpolation
- dark-mode support
- accessible summary
- responsive controls

Add tests for URL generation, parser errors, cancellation, aggregation boundaries, null gaps and exports.
```

## Prompt 14 — Integrate the shared Supabase session and build correction editing

```text
Read docs/weather-dashboard-spec.md. Complete authentication integration and the correction editor, but do not implement audit revert yet.

This repository is separate from UKWX.github.io. Create a small local Supabase client using:

- VITE_SUPABASE_URL
- VITE_SUPABASE_ANON_KEY

These values must point to the same Supabase project as the existing UKWX admin login.

Do not add a login form.

Session flow:

1. Read the persisted Supabase session.
2. Listen for auth-state changes.
3. When no session exists, redirect with full-page navigation to:
   https://ukwx.github.io/admin/login?returnTo=%2Fweatherstation%2Fdata-corrections
4. When a session exists, call protected station-admin endpoint `/audit?limit=1`.
5. Treat its response as authoritative:
   - 200 authorised
   - 401 expired/signed out
   - 403 unauthorised
   - 503 authentication service unavailable

Create a reusable authenticated admin API client that always obtains the current access token immediately before a request. Do not cache the token in application state longer than necessary. Never put it in a URL or log.

Build Data Corrections:

- protected route
- date picker
- load GET /daily/{date}
- clear 404 absent-record state
- current values
- source fields
- double-click edit desktop
- Edit button mobile
- max input
- min input
- rainfall input
- explicit null/clear control
- calculated mean preview
- required reason
- before/after comparison
- confirmation modal

Validation:

- negative temperatures valid
- rainfall cannot be negative
- blank does not automatically mean zero
- explicit clear sends null
- mean preview requires max and min
- warn when min exceeds max
- rainfall before 2020-05-01 must remain null
- reason 3–500 characters
- omit unchanged fields from PATCH

Implement PATCH save. Wait for server confirmation, then invalidate the affected public annual file and dependent queries.

Handle 400, 401, 403, 404, 409, 422, 500 and 503 with clear actions.

Add tests for shared session discovery, redirect, authorisation check, partial patch, explicit null and successful refresh.
```

## Prompt 15 — Build audit/revert, finish integration and conduct final QA

```text
Read docs/weather-dashboard-spec.md. Complete the audit interface, revert workflow and final production audit.

Audit interface:

- GET /audit
- date filter
- limit selector
- newest-first entries
- action badge
- climate date
- timestamp formatted in Europe/London
- administrator ID
- reason
- previous record
- new record
- changed-field highlighting
- reverted state
- linked revert entry
- empty and error states

Revert flow:

- only offer revert for eligible update entries
- require a confirmation modal
- explain that later conflicting changes prevent a revert
- call POST /audit/{id}/revert
- handle 404, 409 and 422 clearly
- wait for server confirmation
- refresh audit
- refresh daily record
- invalidate the affected annual archive year
- refresh archive, calendar, records, comparisons and reports

Do not offer “Create missing record”; the current backend edits existing records only.

Complete the full application audit:

- all 12 tabs are implemented
- no feature placeholders remain
- deep route refresh works on GitHub Pages
- `/weatherstation/` asset paths are correct
- existing main UKWX site is unaffected
- signed-out correction access redirects to the existing login
- a shared existing session is recognised
- unauthorised users are denied by the backend
- every protected request sends the current token
- no token, service key or private value is committed
- public climate data remains public/read-only
- null values are safe
- zero rainfall differs from unavailable rainfall
- pre-May-2020 rainfall is never zero
- baselines are correct and visible
- Europe/London is used consistently
- current periods are provisional
- incomplete periods are excluded where required
- dark mode covers all interface types
- mobile layouts and touch interactions work
- large routes are lazy-loaded
- minute parsing does not block the main thread
- all exports contain the selected data
- no mock data or debug logs remain

Add end-to-end coverage for:

- Overview load
- climate archive selection
- unavailable rainfall display
- calendar date selection
- On This Day leap date
- records filter
- comparison restoration from URL
- monthly report export
- custom graph cancellation
- theme persistence
- signed-out admin redirect
- authorised record read
- correction submission
- audit display
- revert
- protected error states

Run lint, type-check, all tests and a production build. Fix every issue introduced by the implementation. Produce a final concise README section describing local development, environment variables, GitHub Pages deployment, public endpoints and protected admin behaviour.
```

---

# 12. Final environment variables for weatherstation

The weatherstation repository needs:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

These must use the same Supabase project values as the existing UKWX.github.io admin application.

Do not use:

```text
SUPABASE_SERVICE_ROLE_KEY
```

The public backend URLs can be constants or public Vite variables:

```text
VITE_STATION_DATA_BASE=https://ukwx.duckdns.org/station-data
VITE_STATION_ADMIN_BASE=https://ukwx.duckdns.org/station-admin
```

No private DigitalOcean secret is required in the frontend.

---

# 13. Final implementation principle

The frontend is responsible for:

- presentation
- public data retrieval
- climate analysis
- report generation
- reading the existing browser login
- attaching the access token
- displaying admin responses

DigitalOcean remains responsible for:

- finalised data storage
- correction authorisation
- SQLite changes
- mean recalculation
- backups
- public JSON publication
- audit history
- safe revert checks

Do not duplicate DigitalOcean business logic in the browser.
