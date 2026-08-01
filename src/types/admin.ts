import type { ClimateDateString } from '@/types/weather'

export type AdminPermissionState =
  | 'loading'
  | 'signed-out'
  | 'authorised'
  | 'unauthorised'
  | 'unavailable'

export interface AdminDailyRecord {
  date: ClimateDateString
  year: number
  month: number
  day: number
  max_temp_c: number | null
  min_temp_c: number | null
  mean_temp_c: number | null
  rainfall_mm: number | null
  temperature_source: string | null
  rainfall_source: string | null
}

export interface AdminDailyResponse {
  record: AdminDailyRecord
}

export interface AdminPatchPayload {
  max_temp_c?: number | null
  min_temp_c?: number | null
  rainfall_mm?: number | null
  reason: string
}

export interface AdminPatchResponse {
  status: string
  record: AdminDailyRecord
  audit_id: string
  backup: string
  message?: string
}
