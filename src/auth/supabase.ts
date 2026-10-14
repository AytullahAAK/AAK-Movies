import { createClient } from '@supabase/supabase-js'

const projectUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? ''
const publicAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() ?? ''

function hasAllowedProjectUrl(value: string) {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' || (import.meta.env.DEV && (url.hostname === 'localhost' || url.hostname === '127.0.0.1'))
  } catch {
    return false
  }
}

export const isSupabaseAuthConfigured = hasAllowedProjectUrl(projectUrl) && publicAnonKey.length > 0

/** The Supabase anon key is a public project identifier; never put a service-role key here. */
export const supabaseAuthClient = isSupabaseAuthConfigured
  ? createClient(projectUrl, publicAnonKey, {
    auth: { flowType: 'pkce', persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  })
  : null
