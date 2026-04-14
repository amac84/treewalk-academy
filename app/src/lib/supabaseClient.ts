import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { getAppSettings } from './appSettings'

let client: SupabaseClient | null | undefined

/** Same pattern as mux Edge URL: explicit project URL, else infer from feedback function URL. */
function resolvedSupabaseProjectUrl(): string | undefined {
  const settings = getAppSettings()
  const direct = settings.supabaseUrl
  if (direct) return direct
  const fb = settings.feedbackFunctionUrl
  if (!fb || !/^https?:\/\//i.test(fb)) return undefined
  try {
    const u = new URL(fb)
    if (!/\.supabase\.co$/i.test(u.hostname)) return undefined
    return u.origin
  } catch {
    return undefined
  }
}

/** Project API URL from settings (for diagnostics). */
export function getConfiguredSupabaseProjectUrl(): string | undefined {
  return resolvedSupabaseProjectUrl()
}

function messageFromUnknownError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object' && 'message' in err) {
    const m = (err as { message: unknown }).message
    if (typeof m === 'string') return m
  }
  return String(err)
}

/**
 * Turns browser network errors ("Failed to fetch") into actionable copy.
 * Use when Supabase REST calls return `{ error }` or throw.
 */
export function describeSupabaseTransportFailure(operation: string, err: unknown): string {
  const raw = messageFromUnknownError(err)
  const lower = raw.toLowerCase()
  if (
    lower.includes('failed to fetch') ||
    lower.includes('load failed') ||
    lower.includes('networkerror') ||
    lower.includes('network error') ||
    lower.includes('err_network_changed') ||
    lower.includes('err_internet_disconnected')
  ) {
    const origin = getConfiguredSupabaseProjectUrl() ?? '(Supabase URL not set)'
    return `Could not reach Supabase while ${operation} (${origin}). Check internet/VPN/firewall, confirm the project is not paused in the Supabase dashboard, and that Settings → API → Project URL matches your app config.`
  }
  return raw
}

/** True when the SPA can create a Supabase client (URL + anon key). Needed for Auth and Edge calls. */
export function hasSupabaseBrowserEnv(): boolean {
  const url = resolvedSupabaseProjectUrl()
  const anonKey = getAppSettings().supabaseAnonKey
  return Boolean(url && anonKey)
}

/** Returns null when Supabase env is not configured (mock-auth-only mode). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) {
    return client
  }
  if (!hasSupabaseBrowserEnv()) {
    client = null
    return null
  }
  const url = resolvedSupabaseProjectUrl()!
  const anonKey = getAppSettings().supabaseAnonKey
  client = createClient(url, anonKey)
  return client
}
