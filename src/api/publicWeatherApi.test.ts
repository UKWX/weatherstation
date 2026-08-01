import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  evaluatePublicEndpointDiagnostics,
  fetchTypedJson,
  getAnnualClimate,
  getClimateArchiveIndex,
  getClimateIndex,
  getCurrentConditions,
  getDailyNormals,
  getMonthlyNormals,
  getRecentObservations,
  getStationStatus,
  getTodaySummary,
  PublicApiError,
  type PublicApiDiagnosticEndpoint,
} from '@/api/publicWeatherApi'

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

const currentFixture = {
  observation_time_utc: '2026-08-01T08:00:00Z',
  observation_time_local: '2026-08-01 09:00:00 BST',
  fetched_at_utc: '2026-08-01T08:00:10Z',
  temperature_c: 21.3,
  dewpoint_c: 14.4,
  heat_index_c: 22.1,
  wind_chill_c: null,
  humidity_percent: 64,
  pressure_hpa: 1009.1,
  wind_speed_kmh: 13.1,
  wind_speed_mph: 8.1,
  wind_gust_kmh: 20.1,
  wind_gust_mph: 12.5,
  wind_direction_degrees: 245,
  rain_rate_mm_per_hour: 0.2,
  rain_today_mm: 0.6,
  solar_radiation_wm2: 512,
  uv_index: 4.3,
}

const statusFixture = {
  status: 'online',
  collector_status: 'running',
  message: 'Collector healthy',
  checked_at_utc: '2026-08-01T08:00:12Z',
  observation_time_utc: '2026-08-01T08:00:00Z',
  observation_age_seconds: 12,
}

const recentFixture = {
  metadata: {
    station: 'Wakefield',
    generated_at_utc: '2026-08-01T08:00:10Z',
  },
  observations: [
    {
      observation_time_utc: '2026-08-01T08:00:00Z',
      observation_time_local: '2026-08-01 09:00:00 BST',
      temperature_c: null,
      dewpoint_c: 14.2,
      heat_index_c: null,
      wind_chill_c: null,
      humidity_percent: 67,
      pressure_hpa: null,
      wind_speed_kmh: 9.2,
      wind_speed_mph: 5.7,
      wind_gust_kmh: null,
      wind_gust_mph: null,
      wind_direction_degrees: 211,
      rain_rate_mm_per_hour: null,
      rain_today_mm: null,
      solar_radiation_wm2: 488,
      uv_index: 3.8,
    },
    {
      observation_time_utc: '2026-08-01T07:50:00Z',
      observation_time_local: '2026-08-01 08:50:00 BST',
      temperature_c: 21.3,
      dewpoint_c: 14.1,
      heat_index_c: 22.1,
      wind_chill_c: null,
      humidity_percent: 64,
      pressure_hpa: 1009.1,
      wind_speed_kmh: 13.1,
      wind_speed_mph: 8.1,
      wind_gust_kmh: 20.1,
      wind_gust_mph: 12.5,
      wind_direction_degrees: 245,
      rain_rate_mm_per_hour: 0.2,
      rain_today_mm: 0.6,
      solar_radiation_wm2: 512,
      uv_index: 4.3,
    },
  ],
}

const todayFixture = {
  metadata: {
    station: 'Wakefield',
    date: '2026-08-01',
    generated_at_utc: '2026-08-01T08:00:10Z',
  },
  current_observation: currentFixture,
  maximum_temperature: {
    window_start_local: '09:00',
    window_end_local: '21:00',
    provisional: true,
    value: 21.3,
    time_local: '09:00',
    coverage: {
      observed_count: 1,
      expected_count: 1,
      complete: true,
    },
  },
  minimum_temperature: {
    window_start_local: '21:00',
    window_end_local: '09:00',
    provisional: true,
    value: 14.1,
    time_local: '05:40',
    coverage: {
      observed_count: 9,
      expected_count: 9,
      complete: true,
    },
  },
  rainfall: {
    window_start_local: '09:00',
    window_end_local: '09:00',
    provisional: true,
    total_mm: 0.6,
    coverage: {
      observed_count: 1,
      expected_count: 1,
      complete: true,
    },
  },
  calendar_day_extremes: {
    maximum_wind_gust: {
      value: 20.1,
      time_local: '08:12',
      provisional: true,
      coverage: {
        observed_count: 1,
        expected_count: 1,
      },
    },
    maximum_pressure: {
      value: 1009.1,
      time_local: '08:00',
      provisional: true,
      coverage: {
        observed_count: 1,
        expected_count: 1,
      },
    },
    minimum_pressure: {
      value: 1007.8,
      time_local: '04:05',
      provisional: true,
      coverage: {
        observed_count: 8,
        expected_count: 8,
      },
    },
  },
}

const climateIndexFixture = {
  status: 'ok',
  station: 'Wakefield',
  generated_at_utc: '2026-08-01T08:00:10Z',
  history: {
    first_date: '1995-01-01',
    last_date: '2026-07-31',
    first_year: 1995,
    last_year: 2026,
    year_count: 32,
  },
  normals: {
    daily: {
      baseline: '1995-2024',
      endpoint: '/climate/normals/daily.json',
    },
    monthly: {
      baseline: '1991-2020',
      endpoint: '/climate/normals/monthly.json',
    },
    daily_baseline: '1995-2024',
    monthly_baseline: '1991-2020',
  },
  data_quality: {
    provisional_years: [2026],
    notes: null,
  },
  endpoints: {
    archive_index: '/climate/archive/index.json',
    daily_normals: '/climate/normals/daily.json',
    monthly_normals: '/climate/normals/monthly.json',
  },
}

const archiveIndexFixture = {
  station: 'Wakefield',
  generated_at_utc: '2026-08-01T08:00:10Z',
  first_year: 1995,
  last_year: 2026,
  years: [
    {
      year: 1995,
      start_date: '1995-01-01',
      end_date: '1995-12-31',
      observation_count: 365,
      complete: true,
    },
    {
      year: 2010,
      start_date: '2010-01-01',
      end_date: '2010-12-31',
      observation_count: null,
      complete: true,
    },
    {
      year: 2026,
      start_date: '2026-01-01',
      end_date: '2026-07-31',
      observation_count: 212,
      complete: false,
    },
  ],
}

const annualFixture = {
  station: 'Wakefield',
  year: 2026,
  complete: false,
  through: '2026-07-31',
  observation_count: 212,
  generated_at_utc: '2026-08-01T07:59:59Z',
  units: {
    temperature: 'celsius',
    rainfall: 'millimetres',
  },
  records: [
    {
      date: '2026-07-31',
      max_temp_c: 24.1,
      min_temp_c: 13.6,
      mean_temp_c: 18.9,
      rainfall_mm: 0,
    },
  ],
}

const dailyNormalsFixture = {
  station: 'Wakefield',
  generated_at_utc: '2026-08-01T08:00:10Z',
  baseline: '1995-2024',
  units: {
    temperature: 'celsius',
  },
  record_count: 366,
  records: [
    {
      date: '2000-01-01',
      month: 1,
      day: 1,
      max_temp_c: 7.8,
      min_temp_c: 2.3,
      mean_temp_c: 5.1,
    },
    {
      date: '2000-02-29',
      month: 2,
      day: 29,
      max_temp_c: 7.2,
      min_temp_c: 1.8,
      mean_temp_c: 4.5,
    },
  ],
}

const monthlyNormalsFixture = {
  station: 'Wakefield',
  generated_at_utc: '2026-08-01T08:00:10Z',
  baseline: '1991-2020',
  units: {
    temperature: 'celsius',
    rainfall: 'millimetres',
  },
  month_count: 12,
  months: [
    {
      month: 1,
      mean_max_temp_c: 6.9,
      mean_min_temp_c: 1.5,
      mean_temp_c: 4.2,
      rainfall_mm: 63.4,
    },
    {
      month: 7,
      mean_max_temp_c: 22.1,
      mean_min_temp_c: 12.8,
      mean_temp_c: 17.4,
      rainfall_mm: 58.2,
    },
  ],
}

const endpointFixtures: Record<PublicApiDiagnosticEndpoint, unknown> = {
  '/current.json': currentFixture,
  '/status.json': statusFixture,
  '/recent.json': recentFixture,
  '/today.json': todayFixture,
  '/climate/index.json': climateIndexFixture,
  '/climate/archive/index.json': archiveIndexFixture,
  '/climate/archive/2026.json': annualFixture,
  '/climate/normals/daily.json': dailyNormalsFixture,
  '/climate/normals/monthly.json': monthlyNormalsFixture,
}

describe('publicWeatherApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('adapts valid current payloads from the real field names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(currentFixture)))

    const data = await getCurrentConditions()

    expect(data).toMatchObject({
      observationTimeUtc: '2026-08-01T08:00:00Z',
      dewpointC: 14.4,
      humidityPercent: 64,
      rainTodayMm: 0.6,
      heatIndexC: 22.1,
      feelsLikeC: 22.1,
    })
  })

  it('maps missing optional current fields to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          observation_time_utc: '2026-08-01T08:00:00Z',
          temperature_c: 19.4,
        }),
      ),
    )

    const data = await getCurrentConditions()

    expect(data.windSpeedMph).toBeNull()
    expect(data.windSpeedKmh).toBeNull()
    expect(data.rainRateMmPerHour).toBeNull()
    expect(data.feelsLikeC).toBeNull()
  })

  it('preserves recent metadata and null values', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(recentFixture)))

    const data = await getRecentObservations()

    expect(data.metadata).toMatchObject({ station: 'Wakefield' })
    expect(data.observations[0]).toMatchObject({
      observationTimeUtc: '2026-08-01T08:00:00Z',
      temperatureC: null,
      pressureHpa: null,
      rainRateMmPerHour: null,
      rainTodayMm: null,
    })
  })

  it('derives station live state from status strings', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(statusFixture)))

    const data = await getStationStatus()

    expect(data.status).toBe('online')
    expect(data.collectorStatus).toBe('running')
    expect(data.online).toBe(true)
    expect(data.live).toBe(true)
  })

  it('does not treat unknown station status strings as definitely online', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          ...statusFixture,
          status: 'mystery',
          collector_status: 'unknown',
        }),
      ),
    )

    const data = await getStationStatus()

    expect(data.online).toBe(false)
    expect(data.live).toBe(false)
  })

  it('adapts the real today summary structure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(todayFixture)))

    const data = await getTodaySummary()

    expect(data).toMatchObject({
      maximumTemperature: {
        value: 21.3,
        provisional: true,
      },
      rainfall: {
        totalMm: 0.6,
      },
    })
    expect(data?.calendarDayExtremes.maximum_wind_gust).toBeDefined()
  })

  it('adapts the real climate index structure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(climateIndexFixture)))

    const data = await getClimateIndex()

    expect(data).toMatchObject({
      status: 'ok',
      station: 'Wakefield',
      history: {
        firstDate: '1995-01-01',
        lastYear: 2026,
        yearCount: 32,
      },
    })
  })

  it('adapts archive index without requiring rainfall completeness', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(archiveIndexFixture)))

    const data = await getClimateArchiveIndex()

    expect(data.years[0]).toMatchObject({
      year: 1995,
      complete: true,
    })
    expect(data.years[1]).toMatchObject({
      year: 2026,
      complete: false,
    })
  })

  it('returns clear not-found handling for annual files', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ error: 'missing' }, 404)))

    const data = await getAnnualClimate(1980)

    expect(data).toBeNull()
  })

  it('throws malformed-data error for invalid annual payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          ...annualFixture,
          records: 'invalid',
        }),
      ),
    )

    await expect(getAnnualClimate(2025)).rejects.toMatchObject({
      code: 'MALFORMED_DATA',
    })
  })

  it('preserves annual metadata fields and raw units', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse(annualFixture)))

    const data = await getAnnualClimate(2026)

    expect(data).toMatchObject({
      station: 'Wakefield',
      year: 2026,
      complete: false,
      through: '2026-07-31',
      observationCount: 212,
      generatedAtUtc: '2026-08-01T07:59:59Z',
      units: {
        temperature: 'celsius',
        rainfall: 'millimetres',
        pressure: null,
        wind: null,
      },
    })
    expect(data?.records).toHaveLength(1)
  })

  it('preserves daily and monthly normals metadata wrappers', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn()
        .mockResolvedValueOnce(mockJsonResponse(dailyNormalsFixture))
        .mockResolvedValueOnce(mockJsonResponse(monthlyNormalsFixture)),
    )

    const daily = await getDailyNormals()
    const monthly = await getMonthlyNormals()

    expect(daily).toMatchObject({
      station: 'Wakefield',
      baseline: '1995-2024',
      recordCount: 366,
    })
    expect(monthly).toMatchObject({
      station: 'Wakefield',
      baseline: '1991-2020',
      monthCount: 12,
    })
  })

  it('passes diagnostics validation and adaptation for every endpoint fixture', () => {
    for (const [endpoint, payload] of Object.entries(endpointFixtures) as Array<
      [PublicApiDiagnosticEndpoint, unknown]
    >) {
      const result = evaluatePublicEndpointDiagnostics(endpoint, payload)

      expect(result.validationSucceeded, endpoint).toBe(true)
      expect(result.adapterSucceeded, endpoint).toBe(true)
    }
  })

  it('surfaces the requested diagnostics inspection keys', () => {
    const recentResult = evaluatePublicEndpointDiagnostics('/recent.json', recentFixture)
    const todayResult = evaluatePublicEndpointDiagnostics('/today.json', todayFixture)
    const climateIndexResult = evaluatePublicEndpointDiagnostics(
      '/climate/index.json',
      climateIndexFixture,
    )
    const archiveIndexResult = evaluatePublicEndpointDiagnostics(
      '/climate/archive/index.json',
      archiveIndexFixture,
    )
    const dailyNormalsResult = evaluatePublicEndpointDiagnostics(
      '/climate/normals/daily.json',
      dailyNormalsFixture,
    )
    const monthlyNormalsResult = evaluatePublicEndpointDiagnostics(
      '/climate/normals/monthly.json',
      monthlyNormalsFixture,
    )

    expect(recentResult.inspection).toMatchObject({
      observationsCount: 2,
      firstObservation: {
        index: 0,
        keys: expect.arrayContaining(['observation_time_utc', 'temperature_c']),
      },
      lastObservation: {
        index: 1,
      },
      mostCompleteObservation: {
        index: 1,
      },
    })
    expect(todayResult.inspection).toMatchObject({
      maximumTemperatureCoverage: {
        keys: expect.arrayContaining(['observed_count', 'expected_count', 'complete']),
      },
      minimumTemperatureCoverage: {
        keys: expect.arrayContaining(['observed_count', 'expected_count', 'complete']),
      },
      rainfallCoverage: {
        keys: expect.arrayContaining(['observed_count', 'expected_count', 'complete']),
      },
      calendarDayExtremesTopLevelKeys: expect.arrayContaining([
        'maximum_wind_gust',
        'maximum_pressure',
      ]),
      calendarDayExtremesChildren: {
        maximum_wind_gust: {
          keys: expect.arrayContaining(['value', 'time_local', 'provisional', 'coverage']),
        },
      },
    })
    expect(climateIndexResult.inspection).toMatchObject({
      normals: {
        keys: expect.arrayContaining(['daily', 'monthly']),
      },
      normalsDaily: {
        keys: expect.arrayContaining(['baseline', 'endpoint']),
      },
      normalsMonthly: {
        keys: expect.arrayContaining(['baseline', 'endpoint']),
      },
      dataQuality: {
        keys: expect.arrayContaining(['provisional_years', 'notes']),
      },
      endpoints: {
        keys: expect.arrayContaining(['archive_index', 'daily_normals', 'monthly_normals']),
      },
    })
    expect(archiveIndexResult.inspection).toMatchObject({
      firstYearEntry: {
        keys: expect.arrayContaining(['year', 'start_date', 'end_date', 'observation_count', 'complete']),
      },
      lastYearEntry: {
        keys: expect.arrayContaining(['year', 'start_date', 'end_date', 'observation_count', 'complete']),
      },
      completeHistoricalYearEntry: {
        keys: expect.arrayContaining(['year', 'start_date', 'end_date', 'observation_count', 'complete']),
      },
      currentYearEntry: {
        keys: expect.arrayContaining(['year', 'start_date', 'end_date', 'observation_count', 'complete']),
      },
    })
    expect(dailyNormalsResult.inspection).toMatchObject({
      firstRecord: {
        keys: expect.arrayContaining(['date', 'month', 'day', 'max_temp_c', 'min_temp_c', 'mean_temp_c']),
      },
      february29Record: {
        keys: expect.arrayContaining(['date', 'month', 'day', 'max_temp_c', 'min_temp_c', 'mean_temp_c']),
      },
    })
    expect(monthlyNormalsResult.inspection).toMatchObject({
      firstMonth: {
        keys: expect.arrayContaining([
          'month',
          'mean_max_temp_c',
          'mean_min_temp_c',
          'mean_temp_c',
          'rainfall_mm',
        ]),
      },
      summerMonth: {
        keys: expect.arrayContaining([
          'month',
          'mean_max_temp_c',
          'mean_min_temp_c',
          'mean_temp_c',
          'rainfall_mm',
        ]),
      },
    })
  })

  it('raises timeout errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_: string, init?: RequestInit) => {
        return new Promise((_, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => {
              reject(new DOMException('Aborted', 'AbortError'))
            },
            { once: true },
          )
        })
      }),
    )

    await expect(
      fetchTypedJson('/current.json', {
        timeoutMs: 5,
        validate: (value) => value as Record<string, unknown>,
      }),
    ).rejects.toMatchObject({
      code: 'TIMEOUT',
    })
  })

  it('raises cancelled-request errors', async () => {
    const controller = new AbortController()
    controller.abort()

    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_: string, init?: RequestInit) => {
        return new Promise((_, reject) => {
          if (init?.signal?.aborted) {
            reject(new DOMException('Aborted', 'AbortError'))
            return
          }
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true },
          )
        })
      }),
    )

    await expect(
      fetchTypedJson('/current.json', {
        signal: controller.signal,
        timeoutMs: 500,
        validate: (value) => value as Record<string, unknown>,
      }),
    ).rejects.toMatchObject({
      code: 'ABORTED',
    })
  })

  it('keeps 404 as explicit structured API error for non-nullable endpoints', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockJsonResponse({ error: 'missing' }, 404)))

    await expect(getCurrentConditions()).rejects.toBeInstanceOf(PublicApiError)
    await expect(getCurrentConditions()).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    })
  })
})
