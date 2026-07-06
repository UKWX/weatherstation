export type NumericValue = number | null;

export interface RawObservationInput {
  timestamp_utc: string;
  timestamp_local?: string;
  temperature?: NumericValue;
  humidity?: NumericValue;
  dew_point?: NumericValue;
  pressure?: NumericValue;
  wind_speed?: NumericValue;
  wind_direction?: NumericValue;
  wind_gust?: NumericValue;
  rainfall?: NumericValue;
  rain_rate?: NumericValue;
  solar_radiation?: NumericValue;
  uv_index?: NumericValue;
  quality_flag?: string;
}

export interface HistoricalTemperatureInput {
  observed_date: string;
  tmin?: NumericValue;
  tmax?: NumericValue;
  tmean?: NumericValue;
  source?: string;
}

export interface HistoricalPrecipitationInput {
  observed_date: string;
  rainfall_total?: NumericValue;
  rain_days?: NumericValue;
  source?: string;
}

export interface ValidationIssue {
  row: number;
  field: string;
  message: string;
}
