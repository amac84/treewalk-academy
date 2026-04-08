const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** Enough for pasted console errors / stack traces while keeping abuse bounded. */
const MAX_MESSAGE_LENGTH = 12000
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

/** Reject markdown/HTML-style destinations that are commonly abused in issue bodies. */
const DANGEROUS_MARKDOWN_LINK = /\]\(\s*(javascript|data|vbscript):/i
const RISKY_HTML_TAG = /<\s*\/?\s*(script|iframe|object|embed|link|meta|style)\b/i

type CreateLinearIssueResult = {
  id: string
  identifier: string
  title: string
  url?: string | null
}

type ParsedBody = {
  message: string
  route: string
  image: { bytes: Uint8Array; filename: string; contentType: string } | null
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ success: false, error: 'Method not allowed.' }, 405)
  }

  const linearApiKey = Deno.env.get('LINEAR_API_KEY')
  const linearTeamId = Deno.env.get('LINEAR_TEAM_ID')
  const linearProjectId = Deno.env.get('LINEAR_PROJECT_ID')

  if (!linearApiKey || !linearTeamId) {
    return jsonResponse(
      { success: false, error: 'Linear integration is not configured on the server.' },
      500,
    )
  }

  const parsed = await parseFeedbackRequest(request)
  if ('error' in parsed) {
    return jsonResponse({ success: false, error: parsed.error }, 400)
  }

  const { message: rawMessage, route, image } = parsed
  const safeRoute = sanitizeRoute(route)

  let message = rawMessage.trim()
  if (!message && image) {
    message = '(Screenshot attached; no written description.)'
  }
  if (!message) {
    return jsonResponse({ success: false, error: 'Message or screenshot is required.' }, 400)
  }

  const textCheck = sanitizeFeedbackText(message)
  if (!textCheck.ok) {
    return jsonResponse({ success: false, error: textCheck.error }, 400)
  }
  message = textCheck.text

  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ success: false, error: 'Message is too long.' }, 400)
  }

  let imagePayload = image
  if (imagePayload) {
    const magic = validateImageMagicBytes(imagePayload.bytes, imagePayload.contentType)
    if (!magic.ok) {
      return jsonResponse({ success: false, error: magic.error }, 400)
    }
    imagePayload = { ...imagePayload, contentType: magic.contentType }
  }

  let screenshotMarkdown = ''
  if (imagePayload) {
    try {
      const assetUrl = await uploadImageToLinear(linearApiKey, imagePayload)
      screenshotMarkdown = `\n\n## Screenshot\n\n![Screenshot](${assetUrl})\n`
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Image upload failed.'
      return jsonResponse({ success: false, error: msg }, 502)
    }
  }

  const title = buildIssueTitle(message)
  const description = buildIssueDescription({ message, route: safeRoute }) + screenshotMarkdown

  const mutation = `
    mutation IssueCreate($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `

  const variables = {
    input: {
      title,
      description,
      teamId: linearTeamId,
      projectId: linearProjectId || undefined,
    },
  }

  const linearPayload = await linearGraphql(linearApiKey, mutation, variables)

  if (linearPayload.errors?.length) {
    const errorMessage = linearPayload.errors[0]?.message ?? 'Linear request failed.'
    return jsonResponse({ success: false, error: errorMessage }, 502)
  }

  const issue = linearPayload.data?.issueCreate?.issue
  if (!linearPayload.data?.issueCreate?.success || !issue) {
    return jsonResponse({ success: false, error: 'Linear did not create a ticket.' }, 502)
  }

  return jsonResponse({
    success: true,
    ticketId: issue.identifier,
    ticketUrl: issue.url ?? undefined,
  })
})

async function parseFeedbackRequest(request: Request): Promise<ParsedBody | { error: string }> {
  const contentType = request.headers.get('content-type') ?? ''

  if (contentType.includes('multipart/form-data')) {
    let form: FormData
    try {
      form = await request.formData()
    } catch {
      return { error: 'Invalid form data.' }
    }
    const messageField = form.get('message')
    const routeField = form.get('route')
    const message = typeof messageField === 'string' ? messageField : ''
    const route = typeof routeField === 'string' ? routeField.trim() : 'unknown-route'
    const file = form.get('image')

    if (file === null || file === '') {
      return { message, route, image: null }
    }

    if (!(file instanceof File)) {
      return { error: 'Invalid image field.' }
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { error: 'Image is too large (max 5MB).' }
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { error: 'Image is too large (max 5MB).' }
    }
    const rawDeclared = (file.type || '').toLowerCase()
    const declaredNorm = rawDeclared === 'image/jpg' ? 'image/jpeg' : rawDeclared
    if (
      declaredNorm &&
      declaredNorm !== 'application/octet-stream' &&
      !ALLOWED_IMAGE_TYPES.has(declaredNorm)
    ) {
      return { error: 'Only PNG, JPEG, WebP, or GIF images are allowed.' }
    }
    const filename = sanitizeFilename(file.name || 'screenshot.png')
    return {
      message,
      route: route || 'unknown-route',
      image: {
        bytes,
        filename,
        contentType: declaredNorm || 'application/octet-stream',
      },
    }
  }

  const payload = await request.json().catch(() => null) as { message?: unknown; route?: unknown } | null
  const message = typeof payload?.message === 'string' ? payload.message : ''
  const route = typeof payload?.route === 'string' ? payload.route.trim() : 'unknown-route'
  return { message, route, image: null }
}

function sanitizeFilename(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120)
  return base || 'screenshot.png'
}

/** Limit route to a safe path-shaped string so it cannot break markdown or inject backticks. */
function sanitizeRoute(route: string): string {
  const t = route.trim().slice(0, 256)
  if (!t.startsWith('/')) {
    return 'unknown-route'
  }
  if (!/^[/a-zA-Z0-9._~?#%&+=\-]+$/.test(t)) {
    return 'unknown-route'
  }
  return t
}

function sanitizeFeedbackText(raw: string): { ok: true; text: string } | { ok: false; error: string } {
  let s = raw.replace(/\0/g, '')
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  s = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  s = s.replace(/\n{8,}/g, '\n\n\n\n\n\n\n')
  s = s.trim()
  if (DANGEROUS_MARKDOWN_LINK.test(s)) {
    return { ok: false, error: 'Message contains disallowed link patterns.' }
  }
  if (RISKY_HTML_TAG.test(s)) {
    return { ok: false, error: 'Disallowed HTML-like content in the message.' }
  }
  return { ok: true, text: s }
}

function inferImageTypeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 12) {
    return null
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function validateImageMagicBytes(
  bytes: Uint8Array,
  declaredContentType: string,
): { ok: true; contentType: string } | { ok: false; error: string } {
  const inferred = inferImageTypeFromMagic(bytes)
  if (!inferred) {
    return { ok: false, error: 'File is not a valid PNG, JPEG, GIF, or WebP image.' }
  }
  const declared = (declaredContentType === 'image/jpg' ? 'image/jpeg' : declaredContentType).toLowerCase()
  const unknownDeclared =
    !declared ||
    declared === 'application/octet-stream' ||
    !ALLOWED_IMAGE_TYPES.has(declared)
  if (unknownDeclared) {
    return { ok: true, contentType: inferred }
  }
  if (declared !== inferred) {
    return { ok: false, error: 'Image type does not match file contents.' }
  }
  return { ok: true, contentType: inferred }
}

function escapeBackticksForMarkdown(s: string): string {
  return s.replace(/`/g, "'")
}

async function uploadImageToLinear(
  apiKey: string,
  image: { bytes: Uint8Array; filename: string; contentType: string },
): Promise<string> {
  const size = image.bytes.byteLength
  const fileUploadMutation = `
    mutation FileUpload($filename: String!, $contentType: String!, $size: Int!) {
      fileUpload(filename: $filename, contentType: $contentType, size: $size) {
        success
        uploadFile {
          uploadUrl
          assetUrl
          headers {
            key
            value
          }
        }
      }
    }
  `

  const uploadPayload = await linearGraphql(apiKey, fileUploadMutation, {
    filename: image.filename,
    contentType: image.contentType,
    size,
  })

  if (uploadPayload.errors?.length) {
    throw new Error(uploadPayload.errors[0]?.message ?? 'Linear file upload request failed.')
  }

  const uploadFile = uploadPayload.data?.fileUpload?.uploadFile
  if (!uploadPayload.data?.fileUpload?.success || !uploadFile?.uploadUrl || !uploadFile.assetUrl) {
    throw new Error('Linear did not return an upload URL.')
  }

  const putHeaders = new Headers()
  putHeaders.set('Content-Type', image.contentType)
  putHeaders.set('Cache-Control', 'public, max-age=31536000')
  const headerList = uploadFile.headers ?? []
  for (const h of headerList) {
    if (h?.key && h?.value !== undefined) {
      putHeaders.set(h.key, h.value)
    }
  }

  const putRes = await fetch(uploadFile.uploadUrl, {
    method: 'PUT',
    headers: putHeaders,
    body: image.bytes,
  })

  if (!putRes.ok) {
    throw new Error(`Storage upload failed (${putRes.status}).`)
  }

  return uploadFile.assetUrl
}

type LinearGraphqlResult<T> = {
  data?: T
  errors?: Array<{ message?: string }>
}

async function linearGraphql<T>(
  apiKey: string,
  query: string,
  variables: Record<string, unknown>,
): Promise<LinearGraphqlResult<T>> {
  const linearResponse = await fetch('https://api.linear.app/graphql', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: apiKey,
    },
    body: JSON.stringify({ query, variables }),
  })

  const linearPayload = await linearResponse.json().catch(() => null) as LinearGraphqlResult<T> | null
  if (!linearResponse.ok || !linearPayload) {
    return { errors: [{ message: 'Linear request failed.' }] }
  }
  return linearPayload
}

function buildIssueTitle(message: string): string {
  const normalizedMessage = message.replace(/\s+/g, ' ').trim()
  const firstSentence = normalizedMessage.split(/[.!?]/)[0]?.trim() ?? normalizedMessage
  const base = firstSentence || normalizedMessage
  const safeTitle = base.slice(0, 72).trim()
  return safeTitle ? `Bug report: ${safeTitle}` : 'Bug report from in-app feedback bar'
}

function buildIssueDescription({ message, route }: { message: string; route: string }): string {
  const routeSafe = escapeBackticksForMarkdown(route)
  return [
    '## Reported from in-app feedback bar',
    '',
    `- Route: \`${routeSafe}\``,
    `- Submitted at: ${new Date().toISOString()}`,
    '',
    '## Bug details',
    message,
  ].join('\n')
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
