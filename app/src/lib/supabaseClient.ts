import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/** Same pattern as mux Edge URL: explicit project URL, else infer from feedback function URL. */
function resolvedSupabaseProjectUrl(): string | undefined {
  const direct = import.meta.env.VITE_SUPABASE_URL?.trim()
  if (direct) return direct
  const fb = import.meta.env.VITE_FEEDBACK_FUNCTION_URL?.trim()
  if (!fb || !/^https?:\/\//i.test(fb)) return undefined
  try {
    const u = new URL(fb)
    if (!/\.supabase\.co$/i.test(u.hostname)) return undefined
    return u.origin
  } catch {
    return undefined
  }
}

/** Returns null when Supabase env is not configured (mock-auth-only mode). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) {
    return client
  }
  const url = resolvedSupabaseProjectUrl()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    client = null
    return null
  }
  client = createClient(url, anonKey)
  return client
}
