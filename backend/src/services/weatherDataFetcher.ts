import { DateTime } from 'luxon';
import { config } from '../config';
import { RawObservationInput } from '../types';
import { ingestRawObservations } from './ingestionService';

interface WeatherApiObservation {
  obsTimeUtc?: string;
  obsTimeLocal?: string;
  epoch?: number;
  humidity?: number;
  winddir?: number;
  uv?: number;
  solarRadiation?: number;
  metric?: {
    temp?: number;
    heatIndex?: number;
    windChill?: number;
    dewpt?: number;
    pressure?: number;
    windSpeed?: number;
    windGust?: number;
    precipTotal?: number;
    precipRate?: number;
  };
}

interface WeatherApiResponse {
  observations?: WeatherApiObservation[];
}

const toFiniteNumber = (value: unknown): number | undefined => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
};

const mapObservationToRaw = (observation: WeatherApiObservation): RawObservationInput => {
  const utcFromEpoch =
    typeof observation.epoch === 'number'
      ? DateTime.fromSeconds(observation.epoch, { zone: 'utc' }).toISO({
          suppressMilliseconds: true
        })
      : null;

  const timestampUtc = observation.obsTimeUtc ?? utcFromEpoch;
  if (!timestampUtc) {
    throw new Error('Missing observation UTC timestamp');
  }

  return {
    timestamp_utc: timestampUtc,
    timestamp_local: observation.obsTimeLocal,
    temperature: toFiniteNumber(observation.metric?.temp),
    feels_like: toFiniteNumber(observation.metric?.heatIndex ?? observation.metric?.windChill),
    humidity: toFiniteNumber(observation.humidity),
    dew_point: toFiniteNumber(observation.metric?.dewpt),
    pressure: toFiniteNumber(observation.metric?.pressure),
    wind_speed: toFiniteNumber(observation.metric?.windSpeed),
    wind_direction: toFiniteNumber(observation.winddir),
    wind_gust: toFiniteNumber(observation.metric?.windGust),
    rainfall: toFiniteNumber(observation.metric?.precipTotal),
    rain_rate: toFiniteNumber(observation.metric?.precipRate),
    solar_radiation: toFiniteNumber(observation.solarRadiation),
    uv_index: toFiniteNumber(observation.uv)
  };
};

export const fetchLatestWeatherObservation = async () => {
  if (!config.weatherApiKey) {
    throw new Error('WEATHER_API_KEY is not configured');
  }

  if (!config.weatherStationId) {
    throw new Error('WEATHER_STATION_ID is not configured');
  }

  const searchParams = new URLSearchParams({
    apiKey: config.weatherApiKey,
    stationId: config.weatherStationId,
    numericPrecision: 'decimal',
    format: 'json',
    units: 'm'
  });

  const endpoint = `${config.weatherApiEndpoint}?${searchParams.toString()}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Weather API request failed with status ${response.status}`);
  }

  const payload = (await response.json()) as WeatherApiResponse;
  const observation = payload.observations?.[0];
  if (!observation) {
    throw new Error('Weather API returned no observations');
  }

  const normalized = mapObservationToRaw(observation);
  const sourceBatchId = `wunderground:${config.weatherStationId}`;
  const ingestion = ingestRawObservations([normalized], sourceBatchId);

  return {
    stationId: config.weatherStationId,
    fetchedAt: DateTime.utc().toISO(),
    imported: ingestion.imported,
    duplicates: ingestion.duplicates,
    rejected: ingestion.rejected,
    missingData: ingestion.missingData,
    report: ingestion.report,
    issues: ingestion.issues
  };
};
