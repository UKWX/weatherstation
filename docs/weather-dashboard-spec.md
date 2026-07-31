# UKWX Personal Weather Station Dashboard
## Master Specification and 10 Sequential GitHub Copilot Prompts

**Version:** 1.0  
**Project:** Professional React/TypeScript personal weather-station and climate dashboard  
**Primary data source:** `https://ukwx.duckdns.org/station-data`

---

# How to use this document

1. Add this file to the repository as:

   `docs/weather-dashboard-spec.md`

2. Give Copilot the prompts in order, one at a time.
3. Test and review the application after every prompt.
4. Commit each completed stage before moving to the next.
5. Every prompt tells Copilot to read this specification first. This keeps the prompts manageable without losing the detailed business rules.

Copilot must treat this document as authoritative. It should inspect the existing repository before creating files, reuse working code and installed libraries, and avoid rebuilding parts that already work.

---

# PART A — MASTER APPLICATION SPECIFICATION

## A1. Product goal

Build a professional-grade Personal Weather Station dashboard for Wakefield, UK using React and TypeScript.

The application must combine:

- Real-time station conditions.
- Recent intraday observations.
- A historical temperature archive from 1995 onward.
- A historical rainfall archive from 1 May 2020 onward.
- Daily and monthly climate normals.
- Historical records, rankings and comparisons.
- Deterministic monthly and annual reports.
- A secure administrator-only correction interface.

The public website is read-only. Historical corrections are made through a separate authenticated admin API.

The interface must be suitable for desktop and mobile use and should feel like a serious meteorological and climatological product rather than a generic template dashboard.

---

## A2. Core architectural rules

### Existing project first

Before every implementation stage, Copilot must:

- Inspect the existing repository structure.
- Reuse the existing router, state library, component system and chart library where suitable.
- Preserve working pages and features.
- Avoid creating duplicate utilities, hooks or components.
- Avoid replacing the entire application unless explicitly required.
- Keep components modular and reasonably sized.
- Keep calculations outside presentation components.
- Remove temporary mock data when the real implementation for that feature is completed.

### Suggested libraries when the project has no equivalent

Use the existing stack where possible. Where no suitable equivalent exists, prefer:

- React Router for routing.
- TanStack Query for remote-state caching.
- Zod or lightweight runtime guards for validating API responses.
- Recharts or another existing chart library.
- Luxon or date-fns with timezone support.
- Vitest and React Testing Library.
- A Web Worker for large JSONL parsing.
- Supabase JS for authentication.

Do not add a large dependency when a small utility is sufficient.

---

## A3. Styling and interaction rules

### Visual design

Use:

- Clean white backgrounds in light mode.
- Blue as the main interface colour.
- Restrained purple accents.
- Clear spacing and visual hierarchy.
- Professional chart presentation.
- Subtle borders and shadows.
- No stock photography.
- No decorative weather imagery that distracts from data.

### Dark mode

Dark mode must support:

- Navigation.
- Cards.
- Tables.
- Charts.
- Tooltips.
- Calendars.
- Modals.
- Empty, loading and error states.

Store the user's chosen theme locally. On first visit, use the operating-system preference.

### Responsive behaviour

Desktop:

- Fixed or sticky sidebar.
- Full data tables.
- Annual climate-calendar view.
- Multi-column dashboard cards.

Mobile:

- Collapsible navigation drawer.
- Horizontally scrollable tables where necessary.
- Single-month climate calendar.
- Touch-friendly controls.
- Explicit Edit buttons instead of relying on double-click.
- Charts with readable axes and tooltips.

### Accessibility

Include:

- Semantic headings.
- Keyboard navigation.
- Visible focus states.
- Accessible form labels.
- Text alternatives for chart summaries.
- Sufficient colour contrast.
- Patterns, labels or icons so information is not communicated by colour alone.
- Accessible modal focus management.
- Reduced-motion support where practical.

---

## A4. Units and timezone

Use these units everywhere:

- Temperature: Celsius (`°C`)
- Rainfall: millimetres (`mm`)
- Pressure: hectopascals (`hPa`)
- Wind: miles per hour (`mph`)

Use:

- Timezone: `Europe/London`
- UK date formatting.
- UK daylight-saving rules.

Never use the browser's local timezone as the authoritative climate timezone.

All displayed timestamps must clearly distinguish:

- Observation time.
- Data retrieval time.
- Finalised climate date.
- Provisional values.

---

## A5. Official meteorological day windows

These are strict business rules.

### Daily maximum temperature

- Window: 06:00 to 06:00 Europe/London.
- The value assigned to a date is calculated by the backend using this official station rule.

### Daily minimum temperature

- Window: 18:00 to 18:00 Europe/London.
- The value assigned to a date is calculated by the backend using this official station rule.

### Daily rainfall

- Window: 00:00 to 00:00 Europe/London.

### Frontend rule

The frontend must not silently recalculate official daily climate values from minute observations.

Official daily values come from the annual climate files.

Minute observations may be used for:

- Live graphs.
- Intraday custom graphs.
- Exploratory display.
- Clearly labelled provisional summaries where the API supplies them.

The user interface must explain the official windows on relevant pages and in report notes.

---

## A6. Data availability and missing-data rules

### Temperature coverage

- Daily maximum and minimum temperature records begin in 1995.
- The active current year is incomplete until it has ended.
- Missing temperature observations remain `null`.

### Rainfall coverage

- Daily rainfall records begin on `2020-05-01`.
- Every rainfall value before that date is unavailable.
- Unavailable rainfall must be represented as `null`, never `0`.
- The year 2020 is a partial rainfall year and must not be treated as a complete annual rainfall record.

### Meaning of values

These states must remain distinct:

- `0.0 mm`: a genuine dry day.
- `null`: unavailable or missing.
- Provisional value: not yet finalised.
- Finalised value: published in the climate archive.

Never:

- Convert null to zero.
- Include unavailable rainfall in totals.
- Treat unavailable rainfall as a dry day.
- Connect missing chart values with a misleading continuous line.
- Rank incomplete data as though it were complete.

### Missing-data presentation

Display:

- Genuine zero rainfall as `0.0 mm`.
- Missing values as `—`.
- Historically unavailable rainfall as `Unavailable`.
- Provisional values with a visible `Provisional` badge.
- Incomplete periods with a visible coverage warning.

---

## A7. Data endpoints

Base URL:

`https://ukwx.duckdns.org/station-data`

### Live endpoints

- `/current.json`
- `/status.json`
- `/recent.json`
- `/today.json`

### Minute archive

- `/archive/YYYY/MM/DD.jsonl`

Use minute archive files only for detailed intraday custom graphs or an explicitly selected short period.

Do not load the entire minute archive.

### Climate archive

- `/climate/archive/index.json`
- `/climate/archive/{year}.json`

Example daily climate object:

```json
{
  "date": "2026-07-29",
  "max_temp_c": 26.3,
  "min_temp_c": 17.5,
  "mean_temp_c": 21.9,
  "rainfall_mm": 0.0
}
```

### Normals

- `/climate/normals/daily.json`
- `/climate/normals/monthly.json`

### Admin API

Base URL:

`https://ukwx.duckdns.org/station-admin`

Protected endpoints:

- `GET /daily/{date}`
- `PATCH /daily/{date}`
- `GET /audit`
- `POST /audit/{id}/revert`

The admin API requires a valid Supabase access token.

---

## A8. TypeScript data model

The implementation should define or adapt typed interfaces for at least:

- `CurrentConditions`
- `StationStatus`
- `RecentObservation`
- `TodaySummary`
- `ClimateDay`
- `ClimateArchiveIndex`
- `DailyNormal`
- `MonthlyNormal`
- `MonthlyClimateSummary`
- `AnnualClimateSummary`
- `ClimatePeriodCoverage`
- `RecordEntry`
- `ComparisonPeriod`
- `ComparisonResult`
- `ReportData`
- `AdminDailyRecord`
- `AdminAuditEntry`
- `ApiError`

All measurement fields must permit `null` unless the actual API contract guarantees otherwise.

Runtime response validation should reject malformed structures without crashing the entire application.

Do not invent fields that the endpoint does not provide. Inspect actual payloads and build a small adapter layer when field names differ.

---

## A9. Climate calculations

Keep these calculations in pure, tested utility modules.

### Daily mean temperature

```text
(maximum + minimum) / 2
```

Return `null` unless both values exist.

Use the published `mean_temp_c` when it is present and valid. The calculated value can be used for validation and admin preview.

### Monthly calculations

- Monthly mean maximum: average of valid daily maxima.
- Monthly mean minimum: average of valid daily minima.
- Monthly mean temperature: average of valid daily means.
- Monthly rainfall: total of valid daily rainfall values.
- Rain days: count of days with rainfall strictly greater than `0.1 mm`.
- Wettest day: highest valid daily rainfall.
- Highest maximum: highest valid daily maximum.
- Lowest minimum: lowest valid daily minimum.
- Tied dates must all be retained.

### Anomalies

- Temperature anomaly: observed minus normal.
- Rainfall percentage: `(observed / normal) × 100`.
- Rainfall difference: observed minus normal.

Only calculate an anomaly when both observed and normal values exist.

Handle a zero or missing normal safely.

### Daily normals baseline

- 1995–2024.

### Monthly normals baseline

- 1991–2020.

Do not mix the two baseline labels.

### Rainfall-year context

For completed months, year-to-date expected rainfall may be calculated by summing monthly 1991–2020 normals.

For a partial current month:

- Prefer a daily rainfall-normal series when one becomes available.
- Otherwise either stop expected rainfall at the last completed month, or show a clearly labelled prorated estimate.
- Never present a prorated estimate as an observed climatological normal.

### Meteorological seasons

- Winter: December, January, February.
- Spring: March, April, May.
- Summer: June, July, August.
- Autumn: September, October, November.

Winter must support crossing calendar years.

### Record ties

Never arbitrarily select one date or year.

Store and display all tied record holders.

---

## A10. Completeness and provisional logic

### Daily records

A daily metric is valid when its value is present.

A daily record may contain:

- Complete temperature and rainfall.
- Complete temperature but unavailable rainfall.
- Only one temperature extreme.
- A skipped or absent record.

### Complete temperature month

A month is complete for a temperature metric only when every expected calendar day has the required valid value.

### Complete rainfall month

A rainfall month is complete only when:

- The month is on or after June 2020, or May 2020 with coverage beginning on the first day.
- Every expected day has a valid rainfall value.

May 2020 is eligible as a complete rainfall month only if all dates from 1–31 May are present.

### Complete year

A temperature year is complete when every expected date has required temperature values.

A rainfall year is complete only when every expected date from 1 January to 31 December has valid rainfall data.

Therefore:

- 2020 is never a complete rainfall year.
- The current year is provisional until finished.
- An incomplete year must not be placed in rankings that require complete annual coverage.

### Coverage display

For every month, year, report and comparison show:

- Expected day count.
- Valid day count.
- Missing day count.
- Whether the period is complete.
- Whether the period is provisional.

---

# PART B — REQUIRED TABS

## Tab 1 — Overview

Purpose: a concise snapshot of the station and current climate context.

Include:

- Current temperature.
- Feels-like temperature when supplied.
- Dew point when supplied.
- Humidity.
- Pressure.
- Wind speed.
- Wind gust.
- Wind direction.
- Current rain rate when supplied.
- Current daily rainfall where supplied.
- Observation timestamp.
- Observation age.
- Station online/offline state.
- Last successful station update.
- Today's provisional maximum.
- Today's provisional minimum.
- Today's provisional rainfall.
- Yesterday's finalised maximum, minimum, mean and rainfall.
- Current-month temperature and rainfall summary.
- Current-month anomaly where available.
- Recent temperature trend.
- Recent pressure trend.
- Recent rainfall summary.
- Quick links to Live Data, Climate Archive, Records and Reports.

Rules:

- Clearly label provisional values.
- Do not use a current observation as an official daily extreme.
- Hide cards for unsupported measurements instead of showing invented values.
- Show a visible stale-data warning.

---

## Tab 2 — Live Data

Purpose: detailed real-time monitoring.

Include:

- Full current-condition cards.
- Station-health panel.
- Last observation and retrieval times.
- 1-hour, 3-hour and 6-hour ranges.
- Temperature graph.
- Humidity graph.
- Pressure graph.
- Wind and gust graph.
- Rainfall or rain-rate graph where supplied.
- Recent-observations table.
- Automatic refresh.
- Pause/resume refresh.
- Last-updated indicator.
- Tooltip units.
- Gaps for missing readings.
- Mobile-friendly chart controls.

Use `recent.json` where possible. Do not fetch unnecessary historical JSONL files for the normal live view.

---

## Tab 3 — Custom Graphs

Purpose: flexible user-generated weather and climate charts.

Controls:

- Variable selector.
- Multiple-series selector where meaningful.
- Start and end dates.
- Resolution selector:
  - Minute.
  - Hourly.
  - Daily.
  - Monthly.
  - Annual.
- Aggregation selector:
  - Mean.
  - Maximum.
  - Minimum.
  - Total.
- Chart type:
  - Line.
  - Bar.
  - Area.
  - Cumulative.
- Comparison series.
- Normal overlay.
- Running mean.
- Temperature range shading.
- Rainfall accumulation mode.
- Zoom.
- Reset zoom.
- PNG export.
- CSV export.

Presets:

- Last hour.
- Last 3 hours.
- Last 6 hours.
- Today.
- Last 7 days.
- Month to date.
- Year to date.

Data rules:

- Minute and hourly charts use selected JSONL day files only.
- Daily, monthly and annual charts use climate annual JSON.
- Do not permit multi-year minute-data requests.
- Enforce a sensible minute-data range limit and explain it.
- Parse JSONL incrementally or in a Web Worker.
- Ignore malformed lines but report how many were skipped.
- Preserve null gaps.

---

## Tab 4 — Climate Archive

Purpose: browse finalised historical daily and monthly climate records.

Include:

- Archive coverage summary.
- Year selector from the archive index.
- Month selector.
- Annual overview.
- Monthly overview.
- Daily table.
- Date details drawer.
- Monthly and annual charts.
- CSV export.
- Direct links to relevant reports and records.

Daily table columns:

- Date.
- Maximum temperature.
- Minimum temperature.
- Mean temperature.
- Rainfall.
- Temperature anomaly where loaded.
- Data-status indicator.

Monthly summary:

- Highest maximum and all tied dates.
- Lowest minimum and all tied dates.
- Mean maximum.
- Mean minimum.
- Mean temperature.
- Temperature anomalies.
- Rainfall total.
- Rainfall percentage of normal.
- Rain days.
- Wettest day and all tied dates.
- Missing-day count.
- Provisional/complete status.

Annual summary:

- Annual mean temperature.
- Mean maximum.
- Mean minimum.
- Highest maximum.
- Lowest minimum.
- Rainfall total for complete available data.
- Wettest day.
- Rain days.
- Monthly breakdown.
- Coverage warnings.

---

## Tab 5 — Normals & Anomalies

Purpose: show climate context against the correct baselines.

Include:

- Daily normal maximum curve.
- Daily normal minimum curve.
- Selected-year observations over daily normals.
- Daily max anomaly.
- Daily min anomaly.
- Monthly mean-max anomaly.
- Monthly mean-min anomaly.
- Monthly mean-temperature anomaly.
- Monthly rainfall total.
- Monthly rainfall normal.
- Monthly rainfall percentage of normal.
- Year-to-date temperature context.
- Year-to-date rainfall context.
- Positive and negative anomaly tables.
- Baseline explanation.

Every chart and table must display its baseline:

- Daily normals: 1995–2024.
- Monthly normals: 1991–2020.

Missing values must not become zero anomalies.

---

## Tab 6 — Records

Purpose: provide a full historical records centre.

Sections:

### Overall station records

- Highest daily maximum.
- Lowest daily minimum.
- Highest daily minimum.
- Lowest daily maximum.
- Wettest available day.
- Warmest complete month.
- Coldest complete month.
- Wettest complete month.
- Driest complete month.
- Warmest complete year.
- Coldest complete year.
- Wettest complete rainfall year.
- Driest complete rainfall year.

### Calendar-date records

For each month/day:

- Highest maximum.
- Lowest maximum.
- Highest minimum.
- Lowest minimum.
- Wettest available year.
- All tied record holders.

### Rankings

- Top and bottom daily maxima.
- Top and bottom daily minima.
- Top and bottom monthly temperatures.
- Top and bottom complete annual temperatures.
- Wettest days.
- Wettest complete months.
- Driest complete months.
- Wettest complete years.
- Driest complete years.

### Thresholds and spells

Examples:

- Days at or above 20°C.
- Days at or above 25°C.
- Days at or above 30°C.
- Frost days below 0°C.
- Rain days above 0.1 mm.
- Heavy-rain days above configurable thresholds.
- Longest dry spell.
- Longest rain-day spell.
- Longest warm spell.
- Longest cold spell.

### Record progression

Show:

- Date a record was first set.
- Later dates that tied or exceeded it.
- Progression chart.
- Number of current records held by each year.

Rules:

- Exclude null values.
- Respect completeness.
- Show ties.
- Never rank unavailable rainfall.

---

## Tab 7 — Comparisons

Purpose: compare climate periods side by side.

Comparison modes:

- Date versus date.
- Month versus month.
- Year versus year.
- Season versus season.
- Same period across several years.
- Two equal-length custom periods.

Compare:

- Mean maximum.
- Mean minimum.
- Mean temperature.
- Highest maximum.
- Lowest minimum.
- Rainfall total.
- Rainfall percentage of normal.
- Rain days.
- Wettest day.
- Temperature anomalies.
- Threshold counts.
- Coverage.

Presentation:

- Side-by-side summary cards.
- Difference table.
- Overlay charts.
- Daily cumulative rainfall.
- Temperature-range comparison.
- Coverage and completeness warnings.
- CSV export.
- PNG export.
- Shareable URL query parameters where practical.

Do not compare rainfall as complete when either selected period is incomplete.

---

## Tab 8 — Reports

Purpose: create deterministic monthly and annual climate summaries.

Do not use an LLM to invent values or meteorological claims.

### Monthly report format

The report should support a compact summary resembling:

```text
TMax 26.3°C (29th)
TMin 7.4°C (11th)
TMean 17.9°C (+3.4°C avg)
Mean max 22.8°C (+3.7°C avg)
Mean min 13.0°C (+3.0°C avg)
Rainfall 34.5 mm (53.2% avg)
Rain days (>0.1 mm) 15
Wettest day 13.3 mm (11th)
Annual rainfall 396.9 mm
```

The values above are only an example format. Always calculate the real selected period.

Monthly report content:

- Highest maximum and tied dates.
- Lowest minimum and tied dates.
- Mean temperature and anomaly.
- Mean maximum and anomaly.
- Mean minimum and anomaly.
- Rainfall total.
- Rainfall normal and percentage.
- Rain days above 0.1 mm.
- Wettest day and tied dates.
- Year-to-date rainfall.
- Expected year-to-date rainfall.
- Monthly temperature ranking.
- Monthly rainfall ranking where valid.
- New or tied records.
- Missing-data statement.
- Provisional/complete label.
- Deterministic written summary.

### Annual report content

- Annual mean maximum.
- Annual mean minimum.
- Annual mean temperature.
- Temperature anomaly.
- Highest maximum and date.
- Lowest minimum and date.
- Annual rainfall total.
- Rainfall percentage of normal.
- Rain days.
- Wettest day.
- Monthly breakdown.
- Annual ranking.
- Threshold counts.
- Longest spells.
- Records set or tied.
- Completeness statement.

Exports:

- Print view.
- Professional PNG summary.
- CSV source data.
- Copyable text summary.

Only include pressure extremes, lightning totals, thunder days or other manually supplied metadata when an actual endpoint or data field exists.

---

## Tab 9 — Climate Calendar

Purpose: visually explore daily climate values.

Views:

- Full annual desktop grid.
- Single-month mobile view.

Modes:

- Maximum temperature.
- Minimum temperature.
- Mean temperature.
- Rainfall.
- Maximum anomaly.
- Minimum anomaly.
- Mean anomaly.

Include:

- Accessible legends.
- Separate colour scales for each metric.
- Record marker.
- Provisional marker.
- Missing-data style.
- Historically unavailable-rainfall style.
- Selected-date details panel.
- Month and year navigation.
- Keyboard selection.
- Leap-year support.

Never use the same styling for `0 mm`, missing rainfall and historically unavailable rainfall.

---

## Tab 10 — On This Day

Purpose: explore the archive for one calendar date.

Default to today's month and day in Europe/London.

Include:

- Month/day picker.
- Daily normal maximum.
- Daily normal minimum.
- Highest maximum and tied years.
- Lowest maximum and tied years.
- Highest minimum and tied years.
- Lowest minimum and tied years.
- Wettest available year and ties.
- Mean and median where valid.
- Year-by-year table.
- Historical chart.
- Temperature anomalies by year.
- Links to the selected archive date.

29 February:

- Show only leap-year records.
- Explain the reduced sample size.
- Do not invent normals when the source does not provide them.

Rainfall must only appear for dates from 1 May 2020 onward.

---

## Tab 11 — Station Information

Purpose: explain the station and its data.

Use configuration-driven content.

Include:

- General station area: Wakefield, United Kingdom.
- No precise private address.
- Current observation update frequency.
- Historical temperature coverage from 1995.
- Historical rainfall coverage from 1 May 2020.
- Live endpoint information.
- Units.
- Europe/London timezone.
- Official daily max/min/rainfall windows.
- Daily and monthly normal baselines.
- Difference between live, provisional and finalised values.
- Missing-data policy.
- Rain-day definition.
- Data-quality statement.
- Contact or project link where configured.

---

## Tab 12 — Data Corrections

Purpose: allow authorised administrators to correct finalised daily values.

This tab must be hidden from non-admin users and protected at route level.

Features:

- Supabase sign-in/session support.
- Admin-role verification.
- Date picker.
- Load existing daily record.
- Edit existing values.
- Double-click edit on desktop.
- Explicit Edit button on mobile.
- Maximum field.
- Minimum field.
- Rainfall field.
- Null/blank support.
- Mean-temperature preview.
- Correction reason.
- Before/after preview.
- Save confirmation.
- Audit history.
- Revert action.

Validation:

- Temperatures may be negative.
- Rainfall cannot be negative.
- Blank values become null.
- Mean requires max and min.
- Warn when minimum exceeds maximum.
- Warn for rainfall before 1 May 2020.
- Do not silently create an absent date unless the backend explicitly supports upsert.

After a successful edit:

- Refresh the record.
- Invalidate the affected annual climate file.
- Refresh summaries.
- Refresh calendar.
- Refresh records.
- Refresh comparisons.
- Refresh reports.
- Show confirmation.

---

# PART C — DATA FETCHING AND PERFORMANCE

## C1. Caching strategy

Suggested behaviour:

- `current.json`: refresh approximately every 60 seconds.
- `status.json`: refresh approximately every 60 seconds.
- `recent.json`: refresh approximately every 60 seconds.
- `today.json`: refresh approximately every 60 seconds.
- Archive index: long cache with manual invalidation.
- Annual climate files: cache by year.
- Normals: effectively static cache.
- Admin data: short cache or no cache after mutation.

Preserve the last successful live response during temporary refresh failures.

Do not repeatedly download unchanged annual files.

---

## C2. Lazy loading

Lazy-load heavier routes such as:

- Records.
- Comparisons.
- Reports.
- Custom Graphs.
- Climate Calendar.

Do not fetch every year at startup.

Load only the years required by the current page and selected filters.

---

## C3. JSONL parsing

For minute archives:

- Fetch only selected dates.
- Stream or incrementally parse where supported.
- Otherwise parse inside a Web Worker.
- Split by line.
- Ignore blank lines.
- Validate each object.
- Count malformed lines.
- Return partial valid data with a warning.
- Support cancellation when the user changes the range.
- Avoid locking the main UI thread.

---

## C4. Chart behaviour

All charts should:

- Use consistent units.
- Use Europe/London timestamps.
- Preserve missing gaps.
- Have readable tooltips.
- Have dark-mode styling.
- Use responsive containers.
- Avoid excessive animation.
- Support keyboard or text summaries where practical.
- Clearly label provisional series.
- Clearly label normals and comparison series.
- Avoid implying precision beyond the source data.

---

# PART D — ADMIN SECURITY

## D1. Supabase

Use only browser-safe Supabase configuration in the frontend.

Never expose:

- Service-role keys.
- Database passwords.
- Private backend secrets.

The frontend must:

- Restore the session on reload.
- Subscribe to auth-state changes.
- Retrieve the current access token.
- Resolve the user's role.
- Require the `admin` role for the correction route.

Frontend route protection is not sufficient by itself. The external admin API must independently validate the token and role.

---

## D2. Admin request format

Send:

```http
Authorization: Bearer <supabase-access-token>
```

Do not place access tokens in:

- Query strings.
- Local logs.
- Error messages.
- Analytics events.

---

## D3. Admin error handling

Handle clearly:

- `400` invalid request.
- `401` expired or missing session.
- `403` not an administrator.
- `404` daily record not found.
- `409` conflict or stale version.
- `422` validation failure.
- `500` server failure.

Do not optimistically show saved values before the server confirms the mutation.

---

# PART E — TESTING AND ACCEPTANCE

## E1. Required tests

Test at least:

- Daily mean calculation.
- Null-safe calculations.
- Rainfall unavailable before 1 May 2020.
- Genuine zero rainfall.
- Rain-day threshold greater than 0.1 mm.
- Leap years.
- 29 February.
- Meteorological winter crossing years.
- Monthly completeness.
- Annual completeness.
- Record ties.
- Incomplete rainfall comparisons.
- Anomaly calculations.
- Rainfall percentages.
- Loading and error states.
- Theme persistence.
- Protected admin route.
- Correction validation.
- Successful correction refresh.
- Audit revert refresh.

---

## E2. Acceptance rules for every stage

Before stopping after each prompt:

- Run lint.
- Run TypeScript type-checking.
- Run relevant tests.
- Run a production build where practical.
- Fix errors introduced in that stage.
- Summarise files changed.
- Summarise tests run.
- State any genuine blocker.
- Do not leave the project in a knowingly broken state.

---

# PART F — 10 SEQUENTIAL COPILOT PROMPTS

## Prompt 1 — TypeScript interfaces and project foundation

```text
Read docs/weather-dashboard-spec.md and treat it as authoritative. Inspect the existing repository before changing anything. Preserve working code and reuse existing libraries.

Complete only the project foundation.

Create or refine the weather-domain types, configuration and pure utilities. Include typed models for live observations, station status, today’s provisional values, climate days, archive index, daily normals, monthly normals, summaries, records, comparisons, reports and admin audit entries. All measurement fields must support null unless the endpoint guarantees otherwise.

Create shared constants for the API base, Europe/London timezone, units, the 1995–2024 daily-normal baseline, the 1991–2020 monthly-normal baseline and rainfall availability beginning 2020-05-01.

Implement tested utilities for nullable formatting, daily mean temperature, safe averages/totals, anomaly calculations, rainfall percentages, rain-day counting, season mapping, leap years and period coverage.

Strict rules:
- Daily max represents 06:00–06:00.
- Daily min represents 18:00–18:00.
- Rainfall represents 00:00–00:00.
- Rainfall before 2020-05-01 is null/unavailable, never zero.
- Mean temperature is null unless max and min exist.
- Record ties must be retained.

Do not build pages, API hooks or charts yet. Finish by running lint, type-checking and focused unit tests.
```

---

## Prompt 2 — API client, hooks and shared remote state

```text
Read docs/weather-dashboard-spec.md first. Inspect the existing data-fetching approach and reuse it. Complete only the public API and shared remote-state layer.

Create a typed API client and reusable hooks for:
- current.json
- status.json
- recent.json
- today.json
- climate/archive/index.json
- climate/archive/{year}.json
- climate/normals/daily.json
- climate/normals/monthly.json

Use runtime response validation, AbortSignal support, typed errors, query-key factories and request deduplication. Preserve null values exactly. Do not invent endpoint fields.

Refresh live endpoints about every 60 seconds. Keep the last successful live response visible during temporary failures. Cache normals for a long period and annual files by year. Never load all years at startup.

Expose clear loading, empty, stale, offline and retry states. Make annual climate files lazy and manually invalidatable so future admin edits can refresh one affected year plus dependent summaries.

Add mocked API tests for successful responses, null measurements, malformed payloads, 404s and temporary network failures. Do not build full pages yet.
```

---

## Prompt 3 — App shell, routing, theme and shared UI

```text
Read docs/weather-dashboard-spec.md. Inspect the existing router, layout and styles before editing. Complete only the application shell and shared interface components.

Create routes for all 12 tabs:
Overview, Live Data, Custom Graphs, Climate Archive, Normals & Anomalies, Records, Comparisons, Reports, Climate Calendar, On This Day, Station Information and Data Corrections.

Make Overview the default route. Build a professional desktop sidebar, mobile navigation drawer, page header, station-status indicator, dark-mode toggle, reusable page container and accessible loading/error/empty states.

Use the required clean white-and-blue presentation with restrained purple accents. Dark mode must cover navigation, cards, tables, charts, calendars and modals. Store the theme preference and respect the operating-system preference on first use.

Create the Station Information page from configuration using the coverage, units, timezone, official observation windows, normal baselines and missing-data policy in the specification.

Create placeholders for unfinished feature pages. Protect the Data Corrections route structurally but do not implement Supabase yet.

Run routing, accessibility, theme, lint and type checks before stopping.
```

---

## Prompt 4 — Overview and Live Data

```text
Read docs/weather-dashboard-spec.md. Complete only the Overview and Live Data tabs using the shared API hooks and existing chart system.

Overview must show the supported current measurements, observation age, online/offline status, today’s provisional max/min/rainfall, yesterday’s finalised climate values, current-month summary, recent trends and quick links. Hide unsupported cards instead of showing fake values.

Live Data must show detailed current conditions, station health, last observation/retrieval times, selectable 1-hour, 3-hour and 6-hour charts, a recent-observations table, automatic refresh and pause/resume controls.

Use temperature, feels-like, dew point, humidity, pressure, wind, gust, direction, rain rate and rainfall only where actual endpoint fields exist. Inspect payloads and use adapters rather than guessing names.

Strict rules:
- Provisional values must be visibly labelled.
- A current reading is not an official daily extreme.
- Preserve gaps in charts.
- Show stale and offline warnings.
- Use Europe/London and the configured units.

Add responsive layouts, skeletons, retry controls and tests for missing fields, stale data and offline status.
```

---

## Prompt 5 — Climate Archive and Climate Calendar

```text
Read docs/weather-dashboard-spec.md. Complete the Climate Archive and the base Climate Calendar.

Use the archive index to populate year choices and load only the selected annual file. Build annual and monthly archive views, summary cards, charts, a sortable daily table, date-details panel and CSV export.

Implement all monthly and annual calculations through tested utilities. Show highest max, lowest min, means, rainfall total, rainfall percentage, rain days, wettest day, tied dates, coverage counts and provisional/complete state.

Build the Climate Calendar with annual desktop and single-month mobile views. Add max, min, mean and rainfall modes, accessible legends, date selection and a details panel.

Strict rules:
- Temperature starts in 1995.
- Rainfall before 2020-05-01 is unavailable/null.
- Zero rainfall, missing rainfall and unavailable rainfall need different displays.
- 2020 is not a complete rainfall year.
- Current periods are provisional.
- Incomplete years must not be treated as complete rankings.
- Support leap years.

Leave clean extension points for anomaly colouring and record markers. Add tests for coverage, month boundaries, leap years and missing rainfall.
```

---

## Prompt 6 — Normals, anomalies and On This Day

```text
Read docs/weather-dashboard-spec.md. Complete the Normals & Anomalies tab, On This Day tab and anomaly mode for Climate Calendar.

Use daily normals for 1995–2024 and monthly normals for 1991–2020. Label the baseline beside every relevant chart and table.

Build daily normal max/min curves, selected-year observations against normals, monthly temperature anomalies, monthly rainfall normal/percentage, year-to-date context and positive/negative anomaly tables.

Enhance Climate Calendar with max, min and mean anomaly modes. Missing values must remain neutral and unavailable rainfall must retain its separate style.

On This Day should default to today’s calendar date in Europe/London and show normals, all four temperature record categories, wettest available year, tied holders, mean/median, year-by-year values, anomalies and a historical chart. Link each observation to its archive date.

Handle 29 February explicitly and use only leap years. Rainfall must only appear where historically available.

Add null-safe tests for anomalies, rainfall percentages, ties, leap day and missing normals.
```

---

## Prompt 7 — Records and Comparisons

```text
Read docs/weather-dashboard-spec.md. Complete the Records and Comparisons tabs using reusable, tested analysis utilities.

Records must include overall records, calendar-date records, top/bottom rankings, monthly and annual rankings, threshold counts, longest spells and record progression. Provide metric, month, season, year-range and result-limit filters. Show all ties.

Comparisons must support date, month, year, meteorological season, same-period-across-years and two equal-length custom periods. Compare averages, extremes, anomalies, rainfall, rain days, wettest day, thresholds and coverage. Show side-by-side cards, difference tables, overlay charts and CSV/PNG exports.

Strict rules:
- Exclude null values.
- Rain day means rainfall greater than 0.1 mm.
- Winter crosses calendar years.
- 2020 is not a complete rainfall year.
- Current or incomplete periods need clear warnings.
- Do not compare rainfall as complete when either side lacks full coverage.
- Do not fetch unrelated annual files.

Add tests for ties, seasons crossing years, incomplete periods, threshold counts and streak calculations.
```

---

## Prompt 8 — Reports and Custom Graphs

```text
Read docs/weather-dashboard-spec.md. Complete the deterministic Reports and Custom Graphs tabs.

Reports must generate the exact monthly and annual content defined in the specification: extremes and tied dates, means, anomalies, rainfall totals and percentages, rain days, wettest day, year-to-date context, rankings, records, coverage and a deterministic written summary. Add print view, professional PNG, CSV and copyable text exports. Never invent unavailable pressure, lightning or thunder statistics.

Custom Graphs must support minute, hourly, daily, monthly and annual resolutions; variable and multi-series selection; date range; aggregation; chart type; comparison; normals; running means; temperature range; cumulative rainfall; zoom; presets; PNG and CSV exports.

Use JSONL only for selected short intraday ranges. Parse incrementally or in a Web Worker, support cancellation, skip malformed lines with a warning and never freeze the UI. Use annual climate JSON for daily and coarser resolutions.

Preserve missing gaps and enforce a clearly explained minute-data range limit. Add tests for report calculations, exports, JSONL parsing and cancellation.
```

---

## Prompt 9 — Supabase authentication and correction editor

```text
Read docs/weather-dashboard-spec.md. Inspect any existing Supabase client, authentication flow and role tables before adding code. Complete only authentication, route protection, record loading and the validated correction editor.

Use browser-safe Supabase environment variables only. Restore sessions, listen for auth changes and resolve whether the user has the admin role. Hide Data Corrections from non-admin navigation and protect direct route access.

Create an authenticated client for https://ukwx.duckdns.org/station-admin using the Supabase access token as a Bearer token.

Build the correction page with a date picker, GET /daily/{date}, current values, desktop double-click editing, mobile Edit buttons, max/min/rainfall fields, null support, mean preview, required reason, validation and before/after comparison.

Rules:
- Negative temperatures are valid.
- Rainfall cannot be negative.
- Blank means null, not zero.
- Mean requires max and min.
- Warn when min exceeds max.
- Warn for rainfall before 2020-05-01.
- Explain the official observation windows.
- Do not submit PATCH yet.
- Do not expose service-role keys or tokens.

Add tests for session restoration, role protection, record loading and validation.
```

---

## Prompt 10 — Admin submissions, audit trail and final integration

```text
Read docs/weather-dashboard-spec.md. Finish admin submissions, audit history, reverts and the final integration audit.

Submit validated corrections with PATCH /daily/{date}. Include the required reason and Bearer token. Wait for server confirmation before updating the UI.

After success, refetch the daily record and invalidate the affected year, archive summaries, calendar, records, comparisons and reports. Handle 400, 401, 403, 404, 409, 422 and 500 responses clearly.

Build the audit section using GET /audit and POST /audit/{id}/revert. Show timestamp, climate date, administrator, old values, new values, reason and reverted state. Add filters and require confirmation before revert.

Do not silently create absent dates. Offer record creation only when the backend explicitly confirms upsert support.

Complete a final audit:
- All 12 tabs implemented.
- No feature placeholders remain.
- Null and unavailable rainfall rules are correct.
- Baselines are labelled correctly.
- Europe/London is used consistently.
- Dark mode covers charts and calendars.
- Mobile layouts work.
- Large archives are lazy-loaded.
- No secrets or mock data remain.
- Admin navigation and route access are protected.
- Relevant data refreshes after correction or revert.

Finish with end-to-end tests, lint, type-checking and a production build.
```

---

# Final Copilot reminder

For every prompt, Copilot should:

1. Read this specification.
2. Inspect existing code.
3. Complete only the requested stage.
4. Avoid unrelated refactors.
5. Run relevant checks.
6. Summarise changes and any genuine unresolved issues.
