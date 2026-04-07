import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null | undefined

/** Returns null when Supabase env is not configured (mock-auth-only mode). */
export function getSupabaseBrowserClient(): SupabaseClient | null {
  if (client !== undefined) {
    return client
  }
  const url = import.meta.env.VITE_SUPABASE_URL
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
  if (!url || !anonKey) {
    client = null
    return null
  }
  client = createClient(url, anonKey)
  return client
}
