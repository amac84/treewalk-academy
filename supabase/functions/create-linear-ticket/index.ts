const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const MAX_MESSAGE_LENGTH = 500
const MAX_IMAGE_BYTES = 5 * 1024 * 1024
const ALLOWED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

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
  let message = rawMessage.trim()
  if (!message && image) {
    message = '(Screenshot attached; no written description.)'
  }
  if (!message) {
    return jsonResponse({ success: false, error: 'Message or screenshot is required.' }, 400)
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return jsonResponse({ success: false, error: 'Message is too long.' }, 400)
  }

  let screenshotMarkdown = ''
  if (image) {
    try {
      const assetUrl = await uploadImageToLinear(linearApiKey, image)
      screenshotMarkdown = `\n\n## Screenshot\n\n![Screenshot](${assetUrl})\n`
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Image upload failed.'
      return jsonResponse({ success: false, error: msg }, 502)
    }
  }

  const title = buildIssueTitle(message)
  const description = buildIssueDescription({ message, route }) + screenshotMarkdown

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
    const contentTypeFile = (file.type || 'application/octet-stream').toLowerCase()
    if (!ALLOWED_IMAGE_TYPES.has(contentTypeFile)) {
      return { error: 'Only PNG, JPEG, WebP, or GIF images are allowed.' }
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    if (bytes.byteLength > MAX_IMAGE_BYTES) {
      return { error: 'Image is too large (max 5MB).' }
    }
    const filename = sanitizeFilename(file.name || 'screenshot.png')
    return {
      message,
      route: route || 'unknown-route',
      image: { bytes, filename, contentType: contentTypeFile === 'image/jpg' ? 'image/jpeg' : contentTypeFile },
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
  return [
    '## Reported from in-app feedback bar',
    '',
    `- Route: \`${route}\``,
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
