import { getSupabaseBrowserClient } from './supabaseClient'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

function muxFunctionUrl(): string {
  const url = import.meta.env.VITE_MUX_FUNCTION_URL?.trim()
  if (!url) {
    throw new Error('Set VITE_MUX_FUNCTION_URL to your Supabase function URL (…/functions/v1/mux).')
  }
  return url
}

async function jsonHeadersWithAuth(): Promise<Headers> {
  const headers = new Headers({ 'Content-Type': 'application/json' })
  const supabase = getSupabaseBrowserClient()
  if (supabase) {
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (token) {
      headers.set('Authorization', `Bearer ${token}`)
    }
  }
  return headers
}

export async function muxEdgePost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await jsonHeadersWithAuth()

  const response = await fetch(muxFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    const msg =
      (typeof json?.error === 'string' && json.error) ||
      (json?.ok === false && typeof json.error === 'string' && json.error) ||
      `Mux function error (${response.status})`
    throw new Error(msg)
  }
  return json ?? {}
}

export async function createMuxDirectUpload(corsOrigin: string): Promise<{ uploadId: string; uploadUrl: string }> {
  const json = await muxEdgePost({
    action: 'create_direct_upload',
    cors_origin: corsOrigin,
  })
  if (json.ok !== true || typeof json.uploadId !== 'string' || typeof json.uploadUrl !== 'string') {
    throw new Error(typeof json.error === 'string' ? json.error : 'Invalid create_direct_upload response.')
  }
  return { uploadId: json.uploadId, uploadUrl: json.uploadUrl }
}

export async function getMuxUpload(uploadId: string): Promise<{
  status?: string
  assetId: string | null
}> {
  const json = await muxEdgePost({ action: 'get_upload', upload_id: uploadId })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'get_upload failed.')
  }
  const assetId = typeof json.assetId === 'string' ? json.assetId : null
  return {
    status: typeof json.status === 'string' ? json.status : undefined,
    assetId,
  }
}

export async function getMuxAsset(assetId: string): Promise<{
  status?: string
  playbackId: string | null
}> {
  const json = await muxEdgePost({ action: 'get_asset', asset_id: assetId })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'get_asset failed.')
  }
  const playbackId = typeof json.playbackId === 'string' ? json.playbackId : null
  return {
    status: typeof json.status === 'string' ? json.status : undefined,
    playbackId,
  }
}

export async function putVideoToMuxUpload(uploadUrl: string, file: File): Promise<void> {
  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
    },
    body: file,
  })
  if (!response.ok) {
    throw new Error(`Upload to Mux failed (${response.status}).`)
  }
}

export async function waitForMuxPlaybackId(uploadId: string): Promise<{ assetId: string; playbackId: string }> {
  let assetId: string | null = null
  for (let i = 0; i < 90; i++) {
    const u = await getMuxUpload(uploadId)
    if (u.status === 'errored') {
      throw new Error('Mux reported an upload error.')
    }
    if (u.assetId) {
      assetId = u.assetId
      break
    }
    await sleep(2000)
  }
  if (!assetId) {
    throw new Error('Timed out waiting for Mux to link the upload to an asset.')
  }

  for (let i = 0; i < 120; i++) {
    const a = await getMuxAsset(assetId)
    if (a.status === 'errored') {
      throw new Error('Mux reported an asset processing error.')
    }
    if (a.playbackId) {
      return { assetId, playbackId: a.playbackId }
    }
    await sleep(2000)
  }

  throw new Error('Timed out waiting for Mux playback ID (encoding may take longer — refresh later).')
}
