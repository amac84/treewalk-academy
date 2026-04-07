/// <reference types="vite/client" />
/// <reference types="vitest" />

interface ImportMetaEnv {
  readonly VITE_FEEDBACK_FUNCTION_URL?: string
  readonly VITE_MUX_FUNCTION_URL?: string
  readonly VITE_MUX_ENVIRONMENT_ID?: string
  readonly VITE_MUX_ENV_KEY?: string
  readonly VITE_MUX_PLAYBACK_ID?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
