/** Default CPD / certificate legal provider when `cpdProviderName` is unset in config. */
export const CPD_PROVIDER_NAME_DEFAULT = 'Treewalk Consulting Inc.'

export interface AppSettings {
  clerkPublishableKey: string
  nextPublicClerkPublishableKey: string
  treewalkInternalEmailDomains: string[]
  /** Lowercased at load; grants `super_admin` in the SPA when the signed-in email matches (Clerk). */
  superAdminEmails: string[]
  /**
   * Legal entity named on CPD certificates and transcript (verifiable provider).
   * Override via `cpdProviderName` in `/app-settings.json` or `VITE_CPD_PROVIDER_NAME`.
   */
  cpdProviderName: string
  feedbackFunctionUrl: string
  muxFunctionUrl: string
  muxEnvironmentId: string
  muxEnvironmentKey: string
  muxPlaybackId: string
  supabaseUrl: string
  supabaseAnonKey: string
  openAiTranscribeModel: string
  supabaseMuxAnonFallback: boolean
}

const DEFAULT_APP_SETTINGS: AppSettings = {
  clerkPublishableKey: '',
  nextPublicClerkPublishableKey: '',
  treewalkInternalEmailDomains: [],
  superAdminEmails: [],
  cpdProviderName: CPD_PROVIDER_NAME_DEFAULT,
  feedbackFunctionUrl: '',
  muxFunctionUrl: '',
  muxEnvironmentId: '',
  muxEnvironmentKey: '',
  muxPlaybackId: '',
  supabaseUrl: '',
  supabaseAnonKey: '',
  openAiTranscribeModel: '',
  supabaseMuxAnonFallback: true,
}

let cachedSettings: AppSettings = { ...DEFAULT_APP_SETTINGS }

function trimEnv(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function normalizeEmailList(list: string[]): string[] {
  const out = new Set<string>()
  for (const item of list) {
    const e = item.trim().toLowerCase()
    if (e.includes('@')) out.add(e)
  }
  return [...out]
}

function parseCommaSeparatedEmails(raw: string): string[] {
  if (!raw) return []
  return normalizeEmailList(raw.split(','))
}

/** Non-empty `VITE_*` from `.env` override the same fields loaded from `/app-settings.json`. */
function applyViteEnvOverrides(base: AppSettings): AppSettings {
  const env = import.meta.env
  const pick = (viteVal: unknown, fallback: string) => {
    const t = trimEnv(viteVal)
    return t || fallback
  }

  const pkNext = trimEnv(env.VITE_NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY)
  const pkClerk = trimEnv(env.VITE_CLERK_PUBLISHABLE_KEY)
  const envSuperAdmins = parseCommaSeparatedEmails(trimEnv(env.VITE_SUPER_ADMIN_EMAILS))

  return {
    ...base,
    cpdProviderName: pick(env.VITE_CPD_PROVIDER_NAME, base.cpdProviderName),
    supabaseUrl: pick(env.VITE_SUPABASE_URL, base.supabaseUrl),
    supabaseAnonKey: pick(env.VITE_SUPABASE_ANON_KEY, base.supabaseAnonKey),
    muxEnvironmentKey: pick(env.VITE_MUX_ENV_KEY, base.muxEnvironmentKey),
    muxEnvironmentId: pick(env.VITE_MUX_ENVIRONMENT_ID, base.muxEnvironmentId),
    muxFunctionUrl: pick(env.VITE_MUX_FUNCTION_URL, base.muxFunctionUrl),
    feedbackFunctionUrl: pick(env.VITE_FEEDBACK_FUNCTION_URL, base.feedbackFunctionUrl),
    muxPlaybackId: pick(env.VITE_MUX_PLAYBACK_ID, base.muxPlaybackId),
    openAiTranscribeModel: pick(env.VITE_OPENAI_TRANSCRIBE_MODEL, base.openAiTranscribeModel),
    nextPublicClerkPublishableKey: pkNext || pkClerk || base.nextPublicClerkPublishableKey,
    clerkPublishableKey: pkClerk || pkNext || base.clerkPublishableKey,
    superAdminEmails: normalizeEmailList([...base.superAdminEmails, ...envSuperAdmins]),
  }
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function normalizeAppSettings(raw: unknown): AppSettings {
  const source = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  return {
    clerkPublishableKey: asString(source.clerkPublishableKey),
    nextPublicClerkPublishableKey: asString(source.nextPublicClerkPublishableKey),
    treewalkInternalEmailDomains: asStringList(source.treewalkInternalEmailDomains),
    superAdminEmails: normalizeEmailList(asStringList(source.superAdminEmails)),
    cpdProviderName: asString(source.cpdProviderName) || CPD_PROVIDER_NAME_DEFAULT,
    feedbackFunctionUrl: asString(source.feedbackFunctionUrl),
    muxFunctionUrl: asString(source.muxFunctionUrl),
    muxEnvironmentId: asString(source.muxEnvironmentId),
    muxEnvironmentKey: asString(source.muxEnvironmentKey),
    muxPlaybackId: asString(source.muxPlaybackId),
    supabaseUrl: asString(source.supabaseUrl),
    supabaseAnonKey: asString(source.supabaseAnonKey),
    openAiTranscribeModel: asString(source.openAiTranscribeModel),
    supabaseMuxAnonFallback: asBoolean(source.supabaseMuxAnonFallback, DEFAULT_APP_SETTINGS.supabaseMuxAnonFallback),
  }
}

export async function loadAppSettings(): Promise<AppSettings> {
  try {
    const response = await fetch('/app-settings.json', { cache: 'no-store' })
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`)
    }
    cachedSettings = applyViteEnvOverrides(normalizeAppSettings(await response.json()))
  } catch (error) {
    cachedSettings = applyViteEnvOverrides({ ...DEFAULT_APP_SETTINGS })
    if (typeof console !== 'undefined') {
      console.warn(
        '[app-settings] Could not load /app-settings.json. Falling back to empty defaults.',
        error,
      )
    }
  }
  return cachedSettings
}

export function getAppSettings(): Readonly<AppSettings> {
  return cachedSettings
}

/** CPD certificate / transcript provider name (from app settings). */
export function getCpdProviderName(): string {
  const name = getAppSettings().cpdProviderName.trim()
  return name || CPD_PROVIDER_NAME_DEFAULT
}

/** Used by tests to swap config without touching the public JSON file. */
export function __setAppSettingsForTests(next?: Partial<AppSettings>): void {
  cachedSettings = normalizeAppSettings({ ...DEFAULT_APP_SETTINGS, ...(next ?? {}) })
}
