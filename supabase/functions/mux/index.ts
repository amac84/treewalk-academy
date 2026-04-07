/**
 * Mux Video API proxy for direct uploads and upload/asset status polling.
 * Secrets: MUX_TOKEN_ID, MUX_TOKEN_SECRET (Supabase Edge Function secrets).
 *
 * Auth: set MUX_ALLOW_UNAUTHENTICATED=true only for local/dev with the mock UI.
 * Otherwise require Authorization: Bearer <Supabase user JWT>.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
} as const

type AuthOk = { ok: true; userId: string }
type AuthErr = { ok: false; response: Response }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const tokenId = Deno.env.get('MUX_TOKEN_ID')
  const tokenSecret = Deno.env.get('MUX_TOKEN_SECRET')
  if (!tokenId || !tokenSecret) {
    return jsonResponse(
      { ok: false, error: 'Mux is not configured (missing MUX_TOKEN_ID / MUX_TOKEN_SECRET).' },
      500,
    )
  }

  const auth = await authorizeRequest(request)
  if (!auth.ok) {
    return auth.response
  }

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid JSON body.' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''

  try {
    switch (action) {
      case 'create_direct_upload':
        return await handleCreateDirectUpload(request, tokenId, tokenSecret, body)
      case 'get_upload':
        return await handleGetUpload(tokenId, tokenSecret, body)
      case 'get_asset':
        return await handleGetAsset(tokenId, tokenSecret, body)
      default:
        return jsonResponse(
          { ok: false, error: 'Unknown action. Use create_direct_upload, get_upload, or get_asset.' },
          400,
        )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Mux request failed.'
    return jsonResponse({ ok: false, error: msg }, 502)
  }
})

async function authorizeRequest(request: Request): Promise<AuthOk | AuthErr> {
  const allow = Deno.env.get('MUX_ALLOW_UNAUTHENTICATED') === 'true'
  if (allow) {
    return { ok: true, userId: 'dev-bypass' }
  }

  const authHeader = request.headers.get('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      ok: false,
      response: jsonResponse(
        {
          ok: false,
          error:
            'Missing Authorization. Sign in with Supabase Auth, or set MUX_ALLOW_UNAUTHENTICATED=true only for local dev.',
        },
        401,
      ),
    }
  }

  const jwt = authHeader.slice(7).trim()
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  if (!supabaseUrl || !anonKey) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Supabase URL/anon key missing on the server.' }, 500),
    }
  }

  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
  const supabase = createClient(supabaseUrl, anonKey)
  const { data, error } = await supabase.auth.getUser(jwt)
  if (error || !data.user) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Invalid or expired session.' }, 401),
    }
  }

  return { ok: true, userId: data.user.id }
}

async function handleCreateDirectUpload(
  request: Request,
  tokenId: string,
  tokenSecret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const origin =
    (typeof body.cors_origin === 'string' && body.cors_origin) ||
    request.headers.get('origin') ||
    '*'

  const payload = {
    cors_origin: origin,
    new_asset_settings: {
      playback_policies: ['public'],
    },
  }

  const res = await muxFetch(tokenId, tokenSecret, '/video/v1/uploads', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

  const json = (await res.json()) as MuxEnvelope<{ id?: string; url?: string; status?: string }>
  if (!res.ok) {
    const err = json.errors?.[0]?.message ?? json.error ?? `Mux error (${res.status})`
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const data = json.data
  if (!data?.id || !data?.url) {
    return jsonResponse({ ok: false, error: 'Mux did not return upload id/url.' }, 502)
  }

  return jsonResponse({
    ok: true,
    uploadId: data.id,
    uploadUrl: data.url,
    status: data.status,
  })
}

async function handleGetUpload(
  tokenId: string,
  tokenSecret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const uploadId = typeof body.upload_id === 'string' ? body.upload_id.trim() : ''
  if (!uploadId) {
    return jsonResponse({ ok: false, error: 'upload_id is required.' }, 400)
  }

  const res = await muxFetch(tokenId, tokenSecret, `/video/v1/uploads/${encodeURIComponent(uploadId)}`)
  const json = (await res.json()) as MuxEnvelope<{
    id?: string
    status?: string
    asset_id?: string
    error?: { type?: string; messages?: string[] }
  }>

  if (!res.ok) {
    const err = json.errors?.[0]?.message ?? `Mux error (${res.status})`
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const data = json.data
  return jsonResponse({
    ok: true,
    uploadId: data?.id,
    status: data?.status,
    assetId: data?.asset_id ?? null,
    error: data?.error ?? null,
  })
}

async function handleGetAsset(
  tokenId: string,
  tokenSecret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const assetId = typeof body.asset_id === 'string' ? body.asset_id.trim() : ''
  if (!assetId) {
    return jsonResponse({ ok: false, error: 'asset_id is required.' }, 400)
  }

  const res = await muxFetch(tokenId, tokenSecret, `/video/v1/assets/${encodeURIComponent(assetId)}`)
  const json = (await res.json()) as MuxEnvelope<{
    id?: string
    status?: string
    playback_ids?: Array<{ id?: string; policy?: string }>
    errors?: unknown
  }>

  if (!res.ok) {
    const err = json.errors?.[0]?.message ?? `Mux error (${res.status})`
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const data = json.data
  const playbackId = data?.playback_ids?.[0]?.id ?? null

  return jsonResponse({
    ok: true,
    assetId: data?.id,
    status: data?.status,
    playbackId,
    playbackIds: data?.playback_ids ?? [],
  })
}

type MuxEnvelope<T> = {
  data?: T
  errors?: Array<{ message?: string }>
  error?: string
}

function muxAuthHeader(tokenId: string, tokenSecret: string): string {
  const raw = `${tokenId}:${tokenSecret}`
  return `Basic ${btoa(raw)}`
}

async function muxFetch(
  tokenId: string,
  tokenSecret: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const url = `https://api.mux.com${path}`
  const headers = new Headers(init.headers)
  headers.set('Authorization', muxAuthHeader(tokenId, tokenSecret))
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  return await fetch(url, { ...init, headers })
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      'Content-Type': 'application/json',
    },
  })
}
