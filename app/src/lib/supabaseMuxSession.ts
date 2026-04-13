import { getSupabaseBrowserClient } from './supabaseClient'
import type { UserRole } from '../types'

const AUTHOR_ROLES: UserRole[] = ['instructor', 'content_admin', 'super_admin']

/**
 * Seeded / invite “login” does not create Supabase Auth. The mux Edge Function still needs a user JWT.
 * When this returns true, a missing session is repaired with signInAnonymously() (enable Anonymous in Supabase).
 *
 * - Dev: always allowed.
 * - Production: allowed unless VITE_SUPABASE_MUX_ANON_FALLBACK is exactly "false" (strict / real-auth-only deploys).
 */
export function isMuxAnonymousJwtBootstrapAllowed(): boolean {
  if (import.meta.env.DEV) return true
  return import.meta.env.VITE_SUPABASE_MUX_ANON_FALLBACK !== 'false'
}

/**
 * Returns a Supabase access token for mux/transcription calls, optionally creating an anonymous session.
 */
export async function ensureMuxSupabaseAccessToken(): Promise<string | null> {
  const supabase = getSupabaseBrowserClient()
  if (!supabase) return null

  const { data: first } = await supabase.auth.getSession()
  if (first.session?.access_token) {
    return first.session.access_token
  }

  if (!isMuxAnonymousJwtBootstrapAllowed()) return null

  const { error } = await supabase.auth.signInAnonymously()
  if (error) {
    console.warn(
      '[mux] Anonymous sign-in failed — enable Anonymous in Supabase Auth, or sign in with a real account:',
      error.message,
    )
    return null
  }

  const { data: after } = await supabase.auth.getSession()
  return after.session?.access_token ?? null
}

/** Proactively obtain a JWT when an author role is active so the first upload rarely races the async sign-in. */
export async function syncSupabaseSessionForAuthorRole(role: UserRole | null): Promise<void> {
  if (!role || !AUTHOR_ROLES.includes(role)) return
  await ensureMuxSupabaseAccessToken()
}
