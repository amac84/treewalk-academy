import { getAppSettings } from './appSettings'
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from './supabaseClient'
import type { UserRole } from '../types'

const AUTHOR_ROLES: UserRole[] = ['instructor', 'content_admin', 'super_admin']

/**
 * Seeded / invite “login” does not create Supabase Auth. The mux Edge Function still needs a user JWT.
 * When this returns true, a missing session is repaired with signInAnonymously() (enable Anonymous in Supabase).
 *
 * - Dev: always allowed.
 * - Production: allowed unless `supabaseMuxAnonFallback` is false in the app settings file (strict / real-auth-only deploys).
 */
export function isMuxAnonymousJwtBootstrapAllowed(): boolean {
  if (import.meta.env.DEV) return true
  return getAppSettings().supabaseMuxAnonFallback
}

/**
 * Returns a Supabase access token for mux/transcription calls, optionally creating an anonymous session.
 * Throws if anonymous sign-in is allowed but fails (so the UI shows the real Supabase error).
 */
export async function ensureMuxSupabaseAccessToken(): Promise<string | null> {
  if (!hasSupabaseBrowserEnv()) return null

  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  const { data: first } = await supabase.auth.getSession()
  if (first.session?.access_token) {
    return first.session.access_token
  }

  if (!isMuxAnonymousJwtBootstrapAllowed()) return null

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    throw new Error(
      `Anonymous sign-in failed: ${error.message}. In Supabase: Authentication → Providers → Anonymous must be on. In hosting: set the public Supabase values in app-settings.json for this build.`,
    )
  }
  const fromResponse = data.session?.access_token
  if (fromResponse) return fromResponse

  const { data: after } = await supabase.auth.getSession()
  const token = after.session?.access_token ?? null
  if (!token) {
    throw new Error(
      'No session after anonymous sign-in. If storage is blocked, try another browser or disable strict tracking protection for this site.',
    )
  }
  return token
}

/** Proactively obtain a JWT when an author role is active so the first upload rarely races the async sign-in. */
export async function syncSupabaseSessionForAuthorRole(role: UserRole | null): Promise<void> {
  if (!role || !AUTHOR_ROLES.includes(role)) return
  if (!hasSupabaseBrowserEnv()) return
  try {
    await ensureMuxSupabaseAccessToken()
  } catch (e) {
    console.warn('[mux] Author session sync failed:', e instanceof Error ? e.message : e)
  }
}
