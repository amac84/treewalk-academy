import { verifyToken } from 'npm:@clerk/backend@2.33.1'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-clerk-session-token',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const

const ACADEMY_ROLES = [
  'learner',
  'instructor',
  'content_admin',
  'hr_admin',
  'super_admin',
] as const
type AcademyRole = (typeof ACADEMY_ROLES)[number]

type ClerkEmail = { id?: string; email_address?: string }
type ClerkUser = {
  id?: string
  primary_email_address_id?: string | null
  email_addresses?: ClerkEmail[]
  public_metadata?: Record<string, unknown> | null
}

function isAcademyRole(value: unknown): value is AcademyRole {
  return typeof value === 'string' && (ACADEMY_ROLES as readonly string[]).includes(value)
}

function jsonResponse(payload: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}

function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase()
}

function isLikelyEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function academyRoleFromClerkUser(
  emailLower: string,
  superAdminEmails: Set<string>,
  publicMetadata: Record<string, unknown>,
): AcademyRole {
  if (emailLower && superAdminEmails.has(emailLower)) return 'super_admin'
  const raw = publicMetadata.academyRole ?? publicMetadata.role
  if (isAcademyRole(raw)) return raw
  return 'learner'
}

function clerkErrorMessage(raw: unknown): string {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return ''
  const obj = raw as Record<string, unknown>
  const errors = obj.errors
  if (Array.isArray(errors)) {
    const first = errors[0]
    if (first && typeof first === 'object') {
      const e = first as Record<string, unknown>
      if (typeof e.long_message === 'string' && e.long_message.trim()) return e.long_message.trim()
      if (typeof e.message === 'string' && e.message.trim()) return e.message.trim()
      if (typeof e.code === 'string' && e.code.trim()) return e.code.trim()
    }
  }
  if (typeof obj.message === 'string' && obj.message.trim()) return obj.message.trim()
  if (typeof obj.error === 'string' && obj.error.trim()) return obj.error.trim()
  return ''
}

async function clerkApi(
  clerkSecret: string,
  path: string,
  init: RequestInit = {},
): Promise<{ ok: true; json: Record<string, unknown> } | { ok: false; status: number; message: string }> {
  const headers = new Headers(init.headers)
  headers.set('Authorization', `Bearer ${clerkSecret}`)
  if (!headers.get('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const response = await fetch(`https://api.clerk.com${path}`, {
    ...init,
    headers,
  })
  const rawText = await response.text()
  let json: Record<string, unknown> = {}
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>
      }
    } catch {
      json = {}
    }
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      message: clerkErrorMessage(json) || `Clerk API error (${response.status}).`,
    }
  }
  return { ok: true, json }
}

async function authorizeInviteSender(
  request: Request,
): Promise<{ ok: true; role: AcademyRole } | { ok: false; response: Response }> {
  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY')
  const clerkToken = request.headers.get('x-clerk-session-token')?.trim()
  if (!clerkSecret) {
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          error:
            'Invite email function is not configured: set CLERK_SECRET_KEY in Supabase Edge Function secrets.',
        },
        503,
      ),
    }
  }
  if (!clerkToken) {
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          error: 'Missing X-Clerk-Session-Token. Sign in again, then retry.',
        },
        401,
      ),
    }
  }

  let payload: { sub?: string }
  try {
    payload = (await verifyToken(clerkToken, { secretKey: clerkSecret })) as { sub?: string }
  } catch {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Invalid or expired Clerk session.' }, 401) }
  }

  const clerkUserId = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  if (!clerkUserId) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Clerk token missing user id.' }, 401) }
  }

  const userResult = await clerkApi(clerkSecret, `/v1/users/${encodeURIComponent(clerkUserId)}`)
  if (!userResult.ok) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: `Could not load Clerk profile: ${userResult.message}` }, 502),
    }
  }
  const user = userResult.json as ClerkUser
  const primaryEmail = (() => {
    const list = Array.isArray(user.email_addresses) ? user.email_addresses : []
    const byPrimary = user.primary_email_address_id
      ? list.find((entry) => entry?.id === user.primary_email_address_id)
      : null
    return byPrimary?.email_address ?? list[0]?.email_address ?? ''
  })()
  const emailLower = normalizeEmail(primaryEmail)
  const meta = (user.public_metadata ?? {}) as Record<string, unknown>
  const superSet = new Set(
    (Deno.env.get('ACADEMY_SUPER_ADMIN_EMAILS') ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
  const role = academyRoleFromClerkUser(emailLower, superSet, meta)
  if (role !== 'hr_admin' && role !== 'super_admin') {
    const learnerHint =
      role === 'learner'
        ? ' If this user is promoted only in app-settings superAdminEmails, also set ACADEMY_SUPER_ADMIN_EMAILS in Edge Function secrets.'
        : ''
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          error: `Your role (${role}) cannot issue invite emails. Allowed: hr_admin or super_admin.${learnerHint}`,
        },
        403,
      ),
    }
  }
  return { ok: true, role }
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const auth = await authorizeInviteSender(request)
  if (!auth.ok) {
    return auth.response
  }

  const clerkSecret = Deno.env.get('CLERK_SECRET_KEY')
  if (!clerkSecret) {
    return jsonResponse({ ok: false, error: 'CLERK_SECRET_KEY missing.' }, 503)
  }

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const email = typeof body.email === 'string' ? normalizeEmail(body.email) : ''
  const roleRaw = body.role
  const role = isAcademyRole(roleRaw) ? roleRaw : null
  const inviteCode = typeof body.inviteCode === 'string' ? body.inviteCode.trim().toUpperCase() : ''
  const signUpUrlRaw = typeof body.signUpUrl === 'string' ? body.signUpUrl.trim() : ''

  if (!email || !isLikelyEmail(email)) {
    return jsonResponse({ ok: false, error: 'A valid email is required.' }, 400)
  }
  if (!role) {
    return jsonResponse({ ok: false, error: 'A valid academy role is required.' }, 400)
  }

  let redirectUrl: string | undefined
  if (signUpUrlRaw) {
    try {
      const u = new URL(signUpUrlRaw)
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        return jsonResponse({ ok: false, error: 'signUpUrl must use http or https.' }, 400)
      }
      if (inviteCode && !u.searchParams.get('invite')) {
        u.searchParams.set('invite', inviteCode)
      }
      redirectUrl = u.toString()
    } catch {
      return jsonResponse({ ok: false, error: 'signUpUrl must be a valid URL.' }, 400)
    }
  }

  const invitationPayload: Record<string, unknown> = {
    email_address: email,
    notify: true,
    ignore_existing: true,
    public_metadata: {
      academyRole: role,
      inviteCode: inviteCode || undefined,
      invitedByRole: auth.role,
    },
  }
  if (redirectUrl) {
    invitationPayload.redirect_url = redirectUrl
  }

  const inviteResult = await clerkApi(clerkSecret, '/v1/invitations', {
    method: 'POST',
    body: JSON.stringify(invitationPayload),
  })
  if (!inviteResult.ok) {
    const status = inviteResult.status === 409 || inviteResult.status === 422 ? 400 : 502
    return jsonResponse({ ok: false, error: inviteResult.message }, status)
  }

  return jsonResponse({
    ok: true,
    invitationId: typeof inviteResult.json.id === 'string' ? inviteResult.json.id : undefined,
    emailAddress: email,
  })
})
