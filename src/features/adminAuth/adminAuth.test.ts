import { renderHook, waitFor, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

// Mock supabase before importing the hook so the module sees the mock
const mockGetSession = vi.fn()
const mockOnAuthStateChange = vi.fn()
const mockUnsubscribe = vi.fn()

vi.mock('@/lib/supabaseClient', () => ({
  supabase: {
    auth: {
      getSession: mockGetSession,
      onAuthStateChange: mockOnAuthStateChange,
    },
  },
}))

const mockCheckAdminPermission = vi.fn()
vi.mock('@/api/stationAdminApi', () => ({
  checkAdminPermission: mockCheckAdminPermission,
  StationAdminError: class StationAdminError extends Error {
    status: number
    detail: string | null
    constructor(status: number, msg: string, detail: string | null = null) {
      super(msg)
      this.name = 'StationAdminError'
      this.status = status
      this.detail = detail
    }
  },
}))

// Capture the redirect function before it's called so we can spy on it
let capturedHref = ''
const locationDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'location')

// ── Helpers ────────────────────────────────────────────────────────────────

function makeSession(token = 'test-access-token'): Session {
  return {
    access_token: token,
    refresh_token: 'rt',
    expires_in: 3600,
    token_type: 'bearer',
    user: {
      id: 'user-1',
      email: 'admin@example.com',
      app_metadata: {},
      user_metadata: {},
      aud: 'authenticated',
      created_at: '',
    },
    expires_at: Date.now() / 1000 + 3600,
  } as unknown as Session
}

function setupAuthMocks(
  session: Session | null,
  permissionError?: { status: number; message?: string },
) {
  mockGetSession.mockResolvedValue({ data: { session } })
  mockOnAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: mockUnsubscribe } },
  })

  if (permissionError) {
    const err = Object.assign(new Error(permissionError.message ?? 'Error'), {
      status: permissionError.status,
    })
    mockCheckAdminPermission.mockRejectedValue(err)
  } else {
    mockCheckAdminPermission.mockResolvedValue(undefined)
  }
}

// ── Tests ──────────────────────────────────────────────────────────────────

describe('useAdminAuth', () => {
  beforeEach(() => {
    capturedHref = ''
    vi.stubGlobal('location', {
      get href() {
        return capturedHref
      },
      set href(v: string) {
        capturedHref = v
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.clearAllMocks()
    if (locationDescriptor) {
      Object.defineProperty(globalThis, 'location', locationDescriptor)
    }
  })

  it('starts in loading state', async () => {
    // Delay session resolution so we can inspect the initial state
    mockGetSession.mockReturnValue(new Promise(() => undefined))
    mockOnAuthStateChange.mockReturnValue({
      data: { subscription: { unsubscribe: mockUnsubscribe } },
    })

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    expect(result.current.permissionState).toBe('loading')
  })

  it('discovers a shared persisted session and reaches authorised state', async () => {
    setupAuthMocks(makeSession())

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() =>
      expect(result.current.permissionState).toBe('authorised'),
    )
    expect(result.current.session).not.toBeNull()
    expect(mockCheckAdminPermission).toHaveBeenCalledOnce()
  })

  it('redirects to login when no session exists (signed-out)', async () => {
    setupAuthMocks(null)

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() =>
      expect(result.current.permissionState).toBe('signed-out'),
    )
    expect(capturedHref).toContain('ukwx.github.io/admin/login')
    expect(capturedHref).toContain('returnTo')
  })

  it('reaches unauthorised state when permission check returns 403', async () => {
    setupAuthMocks(makeSession(), { status: 403 })

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() =>
      expect(result.current.permissionState).toBe('unauthorised'),
    )
    expect(capturedHref).toBe('')
  })

  it('redirects when permission check returns 401 (expired session)', async () => {
    setupAuthMocks(makeSession(), { status: 401 })

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() =>
      expect(result.current.permissionState).toBe('signed-out'),
    )
    expect(capturedHref).toContain('ukwx.github.io/admin/login')
  })

  it('reaches unavailable state when permission check returns 503', async () => {
    setupAuthMocks(makeSession(), { status: 503 })

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() =>
      expect(result.current.permissionState).toBe('unavailable'),
    )
  })

  it('unsubscribes on unmount', async () => {
    setupAuthMocks(makeSession())

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { unmount } = renderHook(() => useAdminAuth())

    await waitFor(() => expect(mockCheckAdminPermission).toHaveBeenCalled())
    unmount()

    expect(mockUnsubscribe).toHaveBeenCalled()
  })

  it('re-checks permission when auth state changes', async () => {
    let authChangeCallback: ((event: string, session: Session | null) => void) | null = null

    mockGetSession.mockResolvedValue({ data: { session: null } })
    mockOnAuthStateChange.mockImplementation((cb) => {
      authChangeCallback = cb
      return { data: { subscription: { unsubscribe: mockUnsubscribe } } }
    })
    mockCheckAdminPermission.mockResolvedValue(undefined)

    const { useAdminAuth } = await import('@/features/adminAuth/useAdminAuth')
    const { result } = renderHook(() => useAdminAuth())

    await waitFor(() => expect(result.current.permissionState).toBe('signed-out'))

    // Simulate a sign-in event
    act(() => {
      authChangeCallback?.('SIGNED_IN', makeSession())
    })

    await waitFor(() => expect(result.current.permissionState).toBe('authorised'))
    expect(mockCheckAdminPermission).toHaveBeenCalledOnce()
  })
})
