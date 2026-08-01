import { useCallback, useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabaseClient'
import { checkAdminPermission } from '@/api/stationAdminApi'
import type { AdminPermissionState } from '@/types/admin'

const LOGIN_REDIRECT_URL =
  'https://ukwx.github.io/admin/login?returnTo=%2Fweatherstation%2Fdata-corrections'

export function redirectToLogin(): void {
  window.location.href = LOGIN_REDIRECT_URL
}

export function useAdminAuth(): {
  permissionState: AdminPermissionState
  session: Session | null
} {
  const [permissionState, setPermissionState] =
    useState<AdminPermissionState>('loading')
  const [session, setSession] = useState<Session | null>(null)

  const resolvePermission = useCallback(async (activeSession: Session | null) => {
    if (!activeSession) {
      setPermissionState('signed-out')
      redirectToLogin()
      return
    }

    setSession(activeSession)

    try {
      await checkAdminPermission()
      setPermissionState('authorised')
    } catch (err: unknown) {
      const status =
        err != null && typeof err === 'object' && 'status' in err
          ? (err as { status: unknown }).status
          : null

      if (status === 401) {
        setPermissionState('signed-out')
        redirectToLogin()
      } else if (status === 403) {
        setPermissionState('unauthorised')
      } else if (status === 503) {
        setPermissionState('unavailable')
      } else {
        setPermissionState('unavailable')
      }
    }
  }, [])

  useEffect(() => {
    let mounted = true

    // 1. Read the persisted Supabase session immediately
    void supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return
      void resolvePermission(data.session)
    })

    // 2. Listen for auth-state changes (sign-in, sign-out, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (!mounted) return
      void resolvePermission(newSession)
    })

    return () => {
      mounted = false
      subscription.unsubscribe()
    }
  }, [resolvePermission])

  return { permissionState, session }
}
