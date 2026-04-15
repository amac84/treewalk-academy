import { getAppSettings } from './appSettings'

export type InviteRole = 'learner' | 'instructor' | 'content_admin' | 'hr_admin' | 'super_admin'

type SendInviteEmailInput = {
  email: string
  role: InviteRole
  inviteCode: string
  clerkSessionToken?: string | null
  signUpUrl?: string | null
}

type InviteEdgeResponse = {
  ok?: unknown
  error?: unknown
  message?: unknown
  invitationId?: unknown
  emailAddress?: unknown
}

function supabaseApiOriginFromFeedbackUrl(): string | null {
  const raw = getAppSettings().feedbackFunctionUrl
  if (!raw || !/^https?:\/\//i.test(raw)) return null
  try {
    const u = new URL(raw)
    if (!/\.supabase\.co$/i.test(u.hostname)) return null
    return u.origin
  } catch {
    return null
  }
}

function resolvedInviteFunctionUrl(): string | null {
  const settings = getAppSettings()
  const base = settings.supabaseUrl
  if (base) {
    return `${base.replace(/\/$/, '')}/functions/v1/invite-user`
  }
  const fromFeedback = supabaseApiOriginFromFeedbackUrl()
  if (fromFeedback) {
    return `${fromFeedback}/functions/v1/invite-user`
  }
  return null
}

export function isInviteFunctionConfigured(): boolean {
  return Boolean(resolvedInviteFunctionUrl())
}

function inviteFunctionUrl(): string {
  const url = resolvedInviteFunctionUrl()
  if (!url) {
    throw new Error(
      import.meta.env.DEV
        ? 'Invite email needs supabaseUrl (or feedbackFunctionUrl) in app/public/app-settings.json.'
        : 'Invite email service is not configured for this deployment.',
    )
  }
  return url
}

function wireErrorToString(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    if (typeof o.error === 'string' && o.error.trim()) return o.error.trim()
  }
  return ''
}

function responseErrorMessage(status: number, json: InviteEdgeResponse | null, rawText: string): string {
  const fromJson =
    wireErrorToString(json?.error) ||
    (typeof json?.message === 'string' && json.message.trim()) ||
    ''
  if (fromJson) return fromJson
  const trimmed = rawText.trim()
  if (trimmed && trimmed.length < 500 && !/^\s*</.test(trimmed)) return trimmed
  if (status === 401) return 'Your session expired. Sign in again, then resend the invite email.'
  if (status === 403) return 'You do not have permission to send invite emails.'
  if (status >= 500) return 'Invite email service is unavailable right now. Try again in a moment.'
  return `Invite email request failed (${status}).`
}

export async function sendInviteEmailViaEdge(input: SendInviteEmailInput): Promise<{
  invitationId?: string
  emailAddress?: string
}> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const anonKey = getAppSettings().supabaseAnonKey
  if (anonKey) {
    headers.set('apikey', anonKey)
    headers.set('X-Client-Info', 'treewalk-academy-invites')
  }
  const token = input.clerkSessionToken?.trim()
  if (token) {
    headers.set('X-Clerk-Session-Token', token)
  }

  const response = await fetch(inviteFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify({
      email: input.email,
      role: input.role,
      inviteCode: input.inviteCode,
      signUpUrl: input.signUpUrl?.trim() || undefined,
    }),
  })

  const rawText = await response.text()
  let json: InviteEdgeResponse | null = null
  if (rawText) {
    try {
      json = JSON.parse(rawText) as InviteEdgeResponse
    } catch {
      json = null
    }
  }

  if (!response.ok) {
    throw new Error(responseErrorMessage(response.status, json, rawText))
  }

  if (json?.ok !== true) {
    const msg =
      wireErrorToString(json?.error) ||
      (typeof json?.message === 'string' && json.message.trim()) ||
      'Invite email service did not confirm success.'
    throw new Error(msg)
  }

  return {
    invitationId: typeof json?.invitationId === 'string' ? json.invitationId : undefined,
    emailAddress: typeof json?.emailAddress === 'string' ? json.emailAddress : undefined,
  }
}
