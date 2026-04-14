/// <reference types="vite/client" />
/// <reference types="vitest" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  readonly VITE_MUX_ENV_KEY?: string
  readonly VITE_MUX_ENVIRONMENT_ID?: string
  readonly VITE_MUX_FUNCTION_URL?: string
  readonly VITE_FEEDBACK_FUNCTION_URL?: string
  readonly VITE_MUX_PLAYBACK_ID?: string
  readonly VITE_OPENAI_TRANSCRIBE_MODEL?: string
  readonly VITE_CLERK_PUBLISHABLE_KEY?: string
  readonly VITE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string
  /** Comma-separated emails → SPA treats them as super_admin (merged with app-settings `superAdminEmails`). */
  readonly VITE_SUPER_ADMIN_EMAILS?: string
  /** Overrides `cpdProviderName` from `/app-settings.json` (CPD certificate / transcript provider). */
  readonly VITE_CPD_PROVIDER_NAME?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
