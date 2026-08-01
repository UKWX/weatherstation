import { supabase } from '@/lib/supabaseClient'
import { STATION_ADMIN_BASE_URL } from '@/config/weather'
import type {
  AdminAuditListResponse,
  AdminDailyResponse,
  AdminPatchPayload,
  AdminPatchResponse,
  AdminRevertResponse,
} from '@/types/admin'

const ADMIN_TIMEOUT_MS = 15_000

export class StationAdminError extends Error {
  status: number
  detail: string | null

  constructor(status: number, message: string, detail: string | null = null) {
    super(message)
    this.name = 'StationAdminError'
    this.status = status
    this.detail = detail
  }
}

async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) {
    throw new StationAdminError(401, 'No active session')
  }
  return token
}

async function adminFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  // Obtain a fresh token immediately before the request — never cache it
  const token = await getAccessToken()
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), ADMIN_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(`${STATION_ADMIN_BASE_URL}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
        // Token goes only in the header, never in a URL or log
        Authorization: 'Bearer ' + token,
      },
      signal: controller.signal,
    })
  } finally {
    clearTimeout(timer)
  }

  if (response.ok) {
    return response.json() as Promise<T>
  }

  let detail: string | null = null
  let message = `Admin API error ${response.status}`
  try {
    const body = (await response.json()) as {
      message?: string
      detail?: string
      error?: string
    }
    detail = (body.detail ?? body.error ?? null) as string | null
    if (body.message) {
      message = body.message
    } else if (detail) {
      message = detail
    }
  } catch {
    // Body is not JSON; keep default message
  }

  throw new StationAdminError(response.status, message, detail)
}

/** Permission probe: GET /audit?limit=1. Throws StationAdminError on failure. */
export async function checkAdminPermission(): Promise<void> {
  await adminFetch<unknown>('/audit?limit=1')
}

/** GET /daily/{date} */
export async function getAdminDaily(date: string): Promise<AdminDailyResponse> {
  return adminFetch<AdminDailyResponse>(`/daily/${date}`)
}

/** PATCH /daily/{date} */
export async function patchAdminDaily(
  date: string,
  payload: AdminPatchPayload,
): Promise<AdminPatchResponse> {
  return adminFetch<AdminPatchResponse>(`/daily/${date}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  })
}

/** GET /audit */
export async function getAdminAudit(params?: {
  climateDate?: string
  limit?: number
}): Promise<AdminAuditListResponse> {
  const query = new URLSearchParams()
  if (params?.climateDate) {
    query.set('climate_date', params.climateDate)
  }
  if (params?.limit != null) {
    query.set('limit', String(params.limit))
  }
  const suffix = query.toString()
  return adminFetch<AdminAuditListResponse>(`/audit${suffix ? `?${suffix}` : ''}`)
}

/** POST /audit/{id}/revert */
export async function revertAdminAudit(auditId: number): Promise<AdminRevertResponse> {
  return adminFetch<AdminRevertResponse>(`/audit/${auditId}/revert`, {
    method: 'POST',
  })
}
