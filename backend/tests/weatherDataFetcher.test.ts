import { afterEach, describe, expect, it, vi } from 'vitest';

describe('weatherDataFetcher', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('fetches current Weather Underground observations and ingests them', async () => {
    process.env.WEATHER_API_KEY = 'test-api-key';
    process.env.WEATHER_STATION_ID = 'IWAKEF50';

    // Ensure DB schema (including feels_like column) is applied before the insert.
    await import('../src/db/migrate.js');

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        observations: [
          {
            obsTimeUtc: '2026-07-06T20:55:00Z',
            obsTimeLocal: '2026-07-06T21:55:00+01:00',
            humidity: 71,
            winddir: 218,
            uv: 3.1,
            solarRadiation: 321,
            metric: {
              temp: 18.4,
              heatIndex: 18.5,
              windChill: 18.3,
              dewpt: 12.9,
              pressure: 1014.7,
              windSpeed: 11.5,
              windGust: 19.2,
              precipTotal: 0.6,
              precipRate: 0
            }
          }
        ]
      })
    });

    vi.stubGlobal('fetch', fetchMock);

    const { fetchLatestWeatherObservation } = await import('../src/services/weatherDataFetcher.js');
    const result = await fetchLatestWeatherObservation();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain('stationId=IWAKEF50');
    expect(result.imported + result.duplicates).toBe(1);
    expect(result.rejected).toBe(0);
  });
});
