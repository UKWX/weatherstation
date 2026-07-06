# WakefieldStation

Professional personal weather station climatology archive platform with long-term storage, automated processing, climate analytics, records, anomalies, reports, and exports.

## Project Structure

- `/frontend` — React + TypeScript premium meteorological interface
- `/backend` — Express + TypeScript API, ingestion pipeline, scheduler, and climate processing engine
- `/backend/src/db/schema.sql` — relational schema for raw, historical, and derived climate layers

## Architecture Layers

1. **Raw Observation Database**
   - Immutable `raw_observations` table
   - UTC + local timestamps
   - Strict duplicate prevention (`UNIQUE(station_id, timestamp_utc)`)

2. **Historical Climate Database**
   - `temperature_history`
   - `precipitation_history`

3. **Derived Climate Database**
   - `daily_summary`, `monthly_summary`, `annual_summary`
   - `climate_normals`, `records`, `anomalies`, `rankings`

## Quick Start

### 1) Install dependencies

```bash
cd /home/runner/work/WakefieldStation/WakefieldStation/frontend && npm install
cd /home/runner/work/WakefieldStation/WakefieldStation/backend && npm install
```

### 2) Configure environment

```bash
cp /home/runner/work/WakefieldStation/WakefieldStation/backend/.env.example /home/runner/work/WakefieldStation/WakefieldStation/backend/.env
```

Set `WEATHER_API_KEY` and `WEATHER_STATION_ID` in `/home/runner/work/WakefieldStation/WakefieldStation/backend/.env` for Weather Underground ingestion.

### 3) Run migrations

```bash
cd /home/runner/work/WakefieldStation/WakefieldStation/backend && npm run migrate
```

### 4) Start backend and frontend

```bash
cd /home/runner/work/WakefieldStation/WakefieldStation/backend && npm run dev
cd /home/runner/work/WakefieldStation/WakefieldStation/frontend && npm run dev
```

## Core API Domains

- Ingestion: `/api/import/raw`, `/api/import/raw/wunderground`, `/api/import/historical/*`
- Processing: `/api/process/daily`, `/api/process/rebuild`
- Archives: `/api/archive/daily|monthly|annual`
- Climate analytics: `/api/climate/*`
- Reports: `/api/reports/daily|monthly|annual`
- Exports: `/api/exports/:dataset?format=json|csv|excel|xlsx|pdf`

## Quality checks

```bash
cd /home/runner/work/WakefieldStation/WakefieldStation/backend && npm run lint && npm run test && npm run build
cd /home/runner/work/WakefieldStation/WakefieldStation/frontend && npm run lint && npm run build
```
