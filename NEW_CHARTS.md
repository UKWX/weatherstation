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
