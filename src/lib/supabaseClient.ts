import { createClient } from '@supabase/supabase-js'

// Connects to the same Supabase project as UKWX.github.io/admin so the
// already-persisted browser session can be read without a second login form.
// Both apps share the origin https://ukwx.github.io and the default storage
// key, so a session created by the login page is visible here automatically.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const supabaseAnonKey =
  (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? ''

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
