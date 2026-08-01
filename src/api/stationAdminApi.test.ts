import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  StationAdminError,
  getAdminAudit,
  getAdminDaily,
  revertAdminAudit,
} from '@/api/stationAdminApi'

const mockGetSession = vi.fn()

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: (...args: unknown[]) => mockGetSession(...args),
    },
  },
}))

describe('stationAdminApi', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    mockGetSession.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
    })
    fetchMock.mockReset()
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ entries: [], count: 0 }), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it('sends latest token on audit requests with query params', async () => {
    await getAdminAudit({ climateDate: '2026-07-29', limit: 25 })
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/audit?climate_date=2026-07-29&limit=25'),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer\s.+/),
        }),
      }),
    )
  })

  it('posts revert requests with bearer token', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          status: 'ok',
          record: { date: '2026-07-29' },
          original_audit_id: 1,
          revert_audit_id: 2,
          backup: 'backup',
        }),
        { status: 200 },
      ),
    )

    await revertAdminAudit(1)
    expect(fetch).toHaveBeenCalledWith(
      expect.stringContaining('/audit/1/revert'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Bearer\s.+/),
        }),
      }),
    )
  })

  it('fails with 401 when no session token is available', async () => {
    mockGetSession.mockResolvedValueOnce({ data: { session: null } })
    await expect(getAdminDaily('2026-07-29')).rejects.toMatchObject({ status: 401 })
  })

  it('maps structured API errors', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Conflict', detail: 'already reverted' }), {
        status: 409,
      }),
    )

    await expect(revertAdminAudit(1)).rejects.toEqual(
      expect.objectContaining({
        status: 409,
        message: 'Conflict',
        detail: 'already reverted',
      } satisfies Partial<StationAdminError>),
    )
  })
})
