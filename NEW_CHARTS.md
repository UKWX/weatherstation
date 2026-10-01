# Climate and rainfall charts

Progress log for the eight climate-statistics datasets and their chart
integration. All calculations live in `src/features/climateStats` and retain
missing, unavailable, and provisional values instead of interpolating them.

| Chart | Calculation dataset | Status |
| --- | --- | --- |
| Monthly temperature and normals | `buildMonthlyTemperatureStats` | Complete |
| Daily temperature and normals | `buildDailyTemperatureStats` | Complete |
| Monthly temperature anomalies | `buildMonthlyTemperatureStats` | Complete |
| Daily temperature anomalies | `buildDailyTemperatureStats` | Complete |
| Monthly rainfall versus normal | `buildMonthlyRainfallStats` | Complete |
| Daily rainfall and cumulative total | `buildDailyRainfallStats` | Complete |
| Temperature range | `buildTemperatureRangeStats` | Complete |
| Threshold and wet/dry day counts | `buildMonthlyThresholdStats` | Complete |

Annual trend data can be prepared with `buildAnnualClimateStats`; it is kept
separate from the annual overview export so the existing overview output is
unchanged. Chart rendering uses the shared `ChartCard`, `DateSeriesChart`, and
chart tokens. The shared PNG exporter now uses the same white-background,
high-resolution blob path as the annual overview exporter.

## Remaining validation

- Add visual regression coverage for the eight rendered cards.
- Run the existing type-check and frontend test suite in CI.

## Requested eight new charts (2026)

| # | Chart | Component | Page / mount | Status |
|---|---|---|---|---|
| 1 | Temperature anomaly grid | `src/features/climateStats/TemperatureAnomalyGridChart.tsx` | `src/pages/NormalsAnomaliesPage.tsx:1210` | Done: mounted; calculation, render and export tests pass |
| 2 | Today vs every year | `src/features/climateStats/TodayEveryYearChart.tsx` | `src/pages/OnThisDayPage.tsx:315`; live summary `src/pages/LiveDataPage.tsx:505` | Done: mounted; calculation, render and export tests pass |
| 3 | Monthly spread | `src/features/climateStats/MonthlySpreadChart.tsx` | `src/pages/ClimateArchivePage.tsx:1044` | Done: mounted; calculation, render and export tests pass |
| 4 | Warm and frost spells | `src/features/climateStats/WarmFrostSpellsChart.tsx` | `src/pages/RecordsPage.tsx:1601` | Done: mounted; calculation, render and export tests pass |
| 5 | Rainfall year on year | `src/features/climateStats/RainfallYearOnYearChart.tsx` | `src/pages/ClimateArchivePage.tsx:1042` | Done: mounted; calculation, render and export tests pass |
| 6 | Rainfall grid | `src/features/climateStats/RainfallGridChart.tsx` | `src/pages/NormalsAnomaliesPage.tsx:1213` | Done: mounted; calculation, render and export tests pass |
| 7 | Dry spells | `src/features/climateStats/DrySpellsChart.tsx` | `src/pages/ClimateArchivePage.tsx:1043` | Done: mounted; calculation, render and export tests pass |
| 8 | Warm/wet quadrant | `src/features/climateStats/WarmWetQuadrantChart.tsx` | `src/pages/NormalsAnomaliesPage.tsx:1214` | Done: mounted; calculation, render and export tests pass |

## Export comparison with the 2026 temperature overview

The original shared exporter cloned a live SVG and copied computed styles, unlike the overview's standalone SVG builder. It lacked the page canvas, rounded bordered card, title, subtitle, legend, footnote, source line, calculated content height, and fixed export typography; it depended on the live DOM for styles. Both PNG paths already rendered at 2×, but the shared path captured only the on-page chart. The shared exporter now composes a standalone bordered card with its own 1480px canvas, literal chart styles, all descriptive text, calculated height and full-width charts. The overview's own export implementation and output bytes remain unchanged.

Remaining: the overview builder is still separate from the shared export builder; they use the same visual composition but not one literal implementation. Type-check passed; the frontend suite passed (454/454), including 13 export and new-chart tests.
