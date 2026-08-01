import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  fetchTypedJson,
  getAnnualClimate,
  getCurrentConditions,
  getRecentObservations,
  getStationStatus,
  PublicApiError,
} from '@/api/publicWeatherApi'

function mockJsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('publicWeatherApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('adapts valid current payloads', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          observed_at_utc: '2026-08-01T08:00:00Z',
          temperature_c: 21.3,
          feels_like_c: 21.1,
          dew_point_c: 14.4,
          humidity_pct: 64,
          pressure_hpa: 1009.1,
          wind_speed_mph: 8.1,
          wind_gust_mph: 12.5,
          wind_direction_degrees: 245,
          rain_rate_mm_per_hour: 0.2,
          rainfall_today_mm: 0.6,
        }),
      ),
    )

    const data = await getCurrentConditions()

    expect(data).toMatchObject({
      observedAtUtc: '2026-08-01T08:00:00Z',
      temperatureC: 21.3,
      humidityPct: 64,
      rainfallTodayMm: 0.6,
    })
  })

  it('maps missing optional current fields to null', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          observed_at_utc: '2026-08-01T08:00:00Z',
          temperature_c: 19.4,
        }),
      ),
    )

    const data = await getCurrentConditions()

    expect(data.feelsLikeC).toBeNull()
    expect(data.windSpeedMph).toBeNull()
    expect(data.rainRateMmPerHour).toBeNull()
  })

  it('preserves null values in recent observations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse([
          {
            observed_at_utc: '2026-08-01T08:00:00Z',
            temperature_c: null,
            pressure_hpa: null,
            rain_rate_mm_per_hour: null,
            rainfall_today_mm: null,
          },
        ]),
      ),
    )

    const data = await getRecentObservations()

    expect(data[0]).toMatchObject({
      temperatureC: null,
      pressureHpa: null,
      rainRateMmPerHour: null,
      rainfallTodayMm: null,
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
          station: 'Wakefield',
          year: 2025,
          complete: true,
          through: '2025-12-31',
          observation_count: 365,
          generated_at_utc: '2026-01-01T00:00:00Z',
          units: {
            temperature: '°C',
            rainfall: 'mm',
            pressure: 'hPa',
            wind: 'mph',
          },
          records: 'invalid',
        }),
      ),
    )

    await expect(getAnnualClimate(2025)).rejects.toMatchObject({
      code: 'MALFORMED_DATA',
    })
  })

  it('preserves annual metadata fields', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          station: 'Wakefield',
          year: 2026,
          complete: false,
          through: '2026-07-31',
          observation_count: 212,
          generated_at_utc: '2026-08-01T07:59:59Z',
          units: {
            temperature: '°C',
            rainfall: 'mm',
            pressure: 'hPa',
            wind: 'mph',
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
        }),
      ),
    )

    const data = await getAnnualClimate(2026)

    expect(data).toMatchObject({
      station: 'Wakefield',
      year: 2026,
      complete: false,
      through: '2026-07-31',
      observationCount: 212,
      generatedAtUtc: '2026-08-01T07:59:59Z',
    })
    expect(data?.records).toHaveLength(1)
  })

  it('maps stale station status', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        mockJsonResponse({
          online: true,
          observed_at_utc: '2026-08-01T08:00:00Z',
          observation_age_seconds: 920,
          last_successful_update_utc: '2026-08-01T08:00:00Z',
          is_stale: true,
        }),
      ),
    )

    const data = await getStationStatus()

    expect(data.isStale).toBe(true)
    expect(data.online).toBe(true)
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
