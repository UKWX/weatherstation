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

export interface AdminAuditEntry {
  id: number
  action: string
  climate_date: ClimateDateString
  admin_user_id: string | null
  reason: string
  created_at_utc: string
  reverted_at_utc: string | null
  reverted_by_user_id: string | null
  related_audit_id: number | null
  previous_record: AdminDailyRecord | null
  new_record: AdminDailyRecord | null
}

export interface AdminAuditListResponse {
  entries: AdminAuditEntry[]
  count: number
}

export interface AdminRevertResponse {
  status: string
  record: AdminDailyRecord
  original_audit_id: number
  revert_audit_id: number
  backup: string
  message?: string
}
