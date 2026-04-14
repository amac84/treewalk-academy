/**
 * Video API proxy for direct uploads/status, OpenAI transcription, and
 * cheap OpenAI metadata drafting from transcripts (transcription-only actions do not need upload tokens).
 * Secrets: MUX_TOKEN_ID, MUX_TOKEN_SECRET, OPENAI_API_KEY (Edge Function secrets).
 *
 * Mux asset deletion (`delete_mux_asset`): also set CLERK_SECRET_KEY, SUPABASE_SERVICE_ROLE_KEY
 * (auto on hosted Supabase), and optionally ACADEMY_SUPER_ADMIN_EMAILS (comma-separated, lowercase)
 * to mirror SPA super-admin email overrides. Client sends `X-Clerk-Session-Token: <Clerk session JWT>`.
 *
 * Auth: set MUX_ALLOW_UNAUTHENTICATED=true only for local/dev with the mock UI.
 * Otherwise require Authorization: Bearer <Supabase user JWT>.
 */

import { createClerkClient, verifyToken } from 'npm:@clerk/backend@2.33.1'
import { COURSE_METADATA_MODEL, COURSE_QUIZ_MODEL } from './openaiConfig.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type, x-clerk-session-token',
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

function isAcademyRole(value: unknown): value is AcademyRole {
  return typeof value === 'string' && (ACADEMY_ROLES as readonly string[]).includes(value)
}

type AuthOk = { ok: true; userId: string }
type AuthErr = { ok: false; response: Response }

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (request.method !== 'POST') {
    return jsonResponse({ ok: false, error: 'Method not allowed.' }, 405)
  }

  const auth = await authorizeRequest(request)
  if (!auth.ok) {
    return auth.response
  }

  const contentType = request.headers.get('content-type')?.toLowerCase() ?? ''
  let body: Record<string, unknown> = {}
  let formData: FormData | null = null
  try {
    if (contentType.includes('multipart/form-data')) {
      formData = await request.formData()
      const actionField = formData.get('action')
      body = {
        action: typeof actionField === 'string' ? actionField : '',
      }
    } else {
      body = (await request.json()) as Record<string, unknown>
    }
  } catch {
    return jsonResponse({ ok: false, error: 'Invalid request body.' }, 400)
  }

  const action = typeof body.action === 'string' ? body.action : ''

  try {
    if (
      action === 'summarize_transcript' ||
      action === 'draft_course_metadata' ||
      action === 'generate_quiz_bank'
    ) {
      if (formData) {
        return jsonResponse(
          {
            ok: false,
            error: `${action} requires JSON body (Content-Type: application/json).`,
          },
          400,
        )
      }
      if (action === 'draft_course_metadata') {
        return await handleDraftCourseMetadata(body)
      }
      if (action === 'generate_quiz_bank') {
        return await handleGenerateQuizBank(body)
      }
      return await handleSummarizeTranscript(body)
    }

    const tokenId = Deno.env.get('MUX_TOKEN_ID')
    const tokenSecret = Deno.env.get('MUX_TOKEN_SECRET')
    if (!tokenId || !tokenSecret) {
      return jsonResponse(
        {
          ok: false,
          error: 'Video uploads are not configured on the server (missing MUX_TOKEN_ID / MUX_TOKEN_SECRET).',
        },
        500,
      )
    }

    switch (action) {
      case 'create_direct_upload':
        return await handleCreateDirectUpload(request, tokenId, tokenSecret, body)
      case 'get_upload':
        return await handleGetUpload(tokenId, tokenSecret, body)
      case 'get_asset':
        return await handleGetAsset(tokenId, tokenSecret, body)
      case 'delete_mux_asset':
        return await handleDeleteMuxAsset(request, tokenId, tokenSecret, body)
      case 'transcribe_file':
        if (!formData) {
          return jsonResponse({ ok: false, error: 'transcribe_file requires multipart/form-data.' }, 400)
        }
        return await handleTranscribeFile(formData)
      default:
        return jsonResponse(
          {
            ok: false,
            error:
              'Unknown action. Use create_direct_upload, get_upload, get_asset, delete_mux_asset, transcribe_file, summarize_transcript, draft_course_metadata, or generate_quiz_bank.',
          },
          400,
        )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Video service request failed.'
    console.error('[mux] unhandled error', e)
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

  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = formatMuxApiErrorMessage(parsed, res.status)
    console.warn('[mux] create_direct_upload Mux HTTP', res.status, err)
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const json = parsed as MuxEnvelope<{ id?: string; url?: string; status?: string }>
  const data = json.data
  if (!data?.id || !data?.url) {
    return jsonResponse({ ok: false, error: 'Video service did not return upload details.' }, 502)
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
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = formatMuxApiErrorMessage(parsed, res.status)
    console.warn('[mux] get_upload Mux HTTP', res.status, err)
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const json = parsed as MuxEnvelope<{
    id?: string
    status?: string
    asset_id?: string
    error?: { type?: string; messages?: string[] }
  }>
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
  const parsed = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (!res.ok) {
    const err = formatMuxApiErrorMessage(parsed, res.status)
    console.warn('[mux] get_asset Mux HTTP', res.status, err)
    return jsonResponse({ ok: false, error: err }, 502)
  }

  const json = parsed as MuxEnvelope<{
    id?: string
    status?: string
    duration?: number
    playback_ids?: Array<{ id?: string; policy?: string }>
    errors?: unknown
  }>
  const data = json.data
  const playbackId = data?.playback_ids?.[0]?.id ?? null
  const durationSeconds =
    typeof data?.duration === 'number' && Number.isFinite(data.duration) && data.duration > 0
      ? data.duration
      : null

  return jsonResponse({
    ok: true,
    assetId: data?.id,
    status: data?.status,
    playbackId,
    playbackIds: data?.playback_ids ?? [],
    durationSeconds,
  })
}

async function courseOwnsMuxAsset(
  courseId: string,
  clerkInstructorId: string,
  assetId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const url = Deno.env.get('SUPABASE_URL')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !serviceKey) {
    return {
      ok: false,
      reason:
        'Server is missing SUPABASE_SERVICE_ROLE_KEY, so instructor ownership cannot be verified. Add the default service role secret to the mux function.',
    }
  }
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.49.1')
  const sb = createClient(url, serviceKey)
  const { data, error } = await sb.from('academy_courses').select('data').eq('id', courseId).maybeSingle()
  if (error) {
    console.warn('[mux] course lookup for delete auth', error.message)
    return { ok: false, reason: 'Could not verify course ownership.' }
  }
  const row = data?.data as Record<string, unknown> | undefined
  if (!row || typeof row !== 'object') {
    return { ok: false, reason: 'Course not found.' }
  }
  const mux = typeof row.muxAssetId === 'string' ? row.muxAssetId.trim() : ''
  const instructor = typeof row.instructorId === 'string' ? row.instructorId.trim() : ''
  if (mux !== assetId) {
    return { ok: false, reason: 'That Mux asset is not linked to this course.' }
  }
  if (!instructor || instructor !== clerkInstructorId) {
    return { ok: false, reason: 'Only the assigned instructor can delete this hosted video.' }
  }
  return { ok: true }
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

async function authorizeMuxAssetDeletion(
  request: Request,
  body: Record<string, unknown>,
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
            'Mux delete is not configured: set CLERK_SECRET_KEY on the mux Edge Function (Supabase → Edge Functions → mux → Secrets).',
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
          error: 'Missing X-Clerk-Session-Token. Sign in with Clerk, then try again.',
        },
        401,
      ),
    }
  }

  let payload: { sub?: string }
  try {
    payload = (await verifyToken(clerkToken, { secretKey: clerkSecret })) as { sub?: string }
  } catch (e) {
    console.warn('[mux] Clerk verifyToken failed', e instanceof Error ? e.message : e)
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Invalid or expired Clerk session.' }, 401),
    }
  }

  const clerkUserId = typeof payload.sub === 'string' ? payload.sub.trim() : ''
  if (!clerkUserId) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'Clerk token missing user id.' }, 401) }
  }

  const clerk = createClerkClient({ secretKey: clerkSecret })
  let user
  try {
    user = await clerk.users.getUser(clerkUserId)
  } catch (e) {
    console.error('[mux] clerk.users.getUser failed', e)
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'Could not load Clerk profile for authorization.' }, 502),
    }
  }

  const primaryId = user.primaryEmailAddressId
  const primaryEmail =
    primaryId && Array.isArray(user.emailAddresses)
      ? user.emailAddresses.find((entry: { id: string; emailAddress?: string | null }) => entry.id === primaryId)
          ?.emailAddress
      : undefined
  const emailLower = (primaryEmail ?? user.emailAddresses?.[0]?.emailAddress ?? '')
    .trim()
    .toLowerCase()

  const superList = (Deno.env.get('ACADEMY_SUPER_ADMIN_EMAILS') ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
  const superSet = new Set(superList)

  const meta = (user.publicMetadata ?? {}) as Record<string, unknown>
  const role = academyRoleFromClerkUser(emailLower, superSet, meta)

  if (role === 'super_admin' || role === 'content_admin') {
    return { ok: true, role }
  }

  if (role === 'instructor') {
    const courseId = typeof body.course_id === 'string' ? body.course_id.trim() : ''
    const assetId = typeof body.asset_id === 'string' ? body.asset_id.trim() : ''
    if (!courseId) {
      return {
        ok: false,
        response: jsonResponse(
          { ok: false, error: 'Instructors must pass course_id when deleting a hosted Mux asset.' },
          403,
        ),
      }
    }
    const own = await courseOwnsMuxAsset(courseId, clerkUserId, assetId)
    if (!own.ok) {
      return { ok: false, response: jsonResponse({ ok: false, error: own.reason }, 403) }
    }
    return { ok: true, role }
  }

  const learnerHint =
    role === 'learner'
      ? ' The SPA can promote you via superAdminEmails in app-settings.json, but this Edge Function only sees Clerk metadata unless you set the mux secret ACADEMY_SUPER_ADMIN_EMAILS to the same comma-separated emails (Supabase Dashboard → Edge Functions → Secrets), or set Clerk user public metadata { "academyRole": "content_admin" } or "super_admin".'
      : ''

  return {
    ok: false,
    response: jsonResponse(
      {
        ok: false,
        error: `Your role (${role}) cannot delete Mux assets here. Allowed: content_admin, super_admin (any asset), or instructor (only if course_id matches a course you own in the database).${learnerHint}`,
      },
      403,
    ),
  }
}

async function handleDeleteMuxAsset(
  request: Request,
  tokenId: string,
  tokenSecret: string,
  body: Record<string, unknown>,
): Promise<Response> {
  const assetId = typeof body.asset_id === 'string' ? body.asset_id.trim() : ''
  if (!assetId) {
    return jsonResponse({ ok: false, error: 'asset_id is required.' }, 400)
  }

  const authz = await authorizeMuxAssetDeletion(request, body)
  if (!authz.ok) {
    return authz.response
  }

  const res = await muxFetch(tokenId, tokenSecret, `/video/v1/assets/${encodeURIComponent(assetId)}`, {
    method: 'DELETE',
  })

  if (res.status === 204 || res.status === 200) {
    return jsonResponse({ ok: true, deleted: true })
  }
  if (res.status === 404) {
    return jsonResponse({ ok: true, deleted: true, note: 'already_deleted' })
  }

  const rawText = await res.text()
  let parsed: Record<string, unknown> = {}
  if (rawText) {
    try {
      const p = JSON.parse(rawText) as unknown
      if (p && typeof p === 'object' && !Array.isArray(p)) parsed = p as Record<string, unknown>
    } catch {
      /* ignore */
    }
  }
  const err = formatMuxApiErrorMessage(parsed, res.status)
  console.warn('[mux] delete_mux_asset Mux HTTP', res.status, err)
  return jsonResponse({ ok: false, error: err }, 502)
}

/** Keep prompt size bounded for latency and cost; transcript is best-effort coverage. */
const SUMMARIZE_TRANSCRIPT_MAX_CHARS = 95_000
/** Keep synchronized with `app/src/types.ts` and `app/src/pages/admin/courseWorkflow.ts`. */
const COURSE_TOPIC_VALUES = [
  'Ethics',
  'Tax',
  'Audit',
  'Financial Reporting',
  'Technology',
  'Leadership',
  'Advisory',
] as const
const DEFAULT_ALLOWED_TOPICS = [...COURSE_TOPIC_VALUES]
const MIN_GENERATED_QUESTIONS = 20
const MAX_GENERATED_QUESTIONS = 60

function clampGeneratedQuestions(value: number): number {
  if (!Number.isFinite(value)) return MIN_GENERATED_QUESTIONS
  return Math.min(MAX_GENERATED_QUESTIONS, Math.max(MIN_GENERATED_QUESTIONS, Math.round(value)))
}

function normalizeAllowedTopics(raw: unknown): string[] {
  if (!Array.isArray(raw) || raw.length === 0) return DEFAULT_ALLOWED_TOPICS
  const allowed = new Set<string>(COURSE_TOPIC_VALUES)
  const normalized = raw
    .map((topic) => (typeof topic === 'string' ? topic.trim() : ''))
    .filter((topic) => topic.length > 0 && allowed.has(topic))
  return normalized.length > 0 ? [...new Set(normalized)] : DEFAULT_ALLOWED_TOPICS
}

type DraftQuestion = {
  prompt: string
  options: string[]
  correctOption: 'a' | 'b' | 'c' | 'd'
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
}

function parseDraftQuestions(raw: unknown): DraftQuestion[] {
  if (!Array.isArray(raw)) return []
  return raw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const typed = entry as Record<string, unknown>
      const prompt = typeof typed.prompt === 'string' ? typed.prompt.trim() : ''
      const optionsRaw = Array.isArray(typed.options) ? typed.options : []
      const options = optionsRaw
        .map((option) => (typeof option === 'string' ? option.trim() : ''))
        .filter((option) => option.length > 0)
      const rawCorrectOption =
        typeof typed.correct_option === 'string'
          ? typed.correct_option
          : typeof typed.correctOption === 'string'
            ? typed.correctOption
            : ''
      const correctOption = rawCorrectOption.trim().toLowerCase()
      const explanation = typeof typed.explanation === 'string' ? typed.explanation.trim() : ''
      const difficulty = typeof typed.difficulty === 'string' ? typed.difficulty.trim().toLowerCase() : ''
      if (!prompt || options.length !== 4 || !['a', 'b', 'c', 'd'].includes(correctOption)) return null
      if (!explanation || !['easy', 'medium', 'hard'].includes(difficulty)) return null
      return {
        prompt,
        options,
        correctOption: correctOption as 'a' | 'b' | 'c' | 'd',
        explanation,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
      }
    })
    .filter((entry): entry is DraftQuestion => Boolean(entry))
}

function dedupeDraftQuestions(questions: DraftQuestion[]): DraftQuestion[] {
  const seen = new Set<string>()
  const next: DraftQuestion[] = []
  for (const question of questions) {
    const key = question.prompt.trim().toLowerCase().replace(/\s+/g, ' ')
    if (!key || seen.has(key)) continue
    seen.add(key)
    next.push(question)
  }
  return next
}

type DraftRequestContext = {
  transcriptPrompt: string
  courseTitle: string
  courseMinutes: number | null
  shownQuestionCount: number | null
  generatedQuestionCount: number | null
  allowedTopics: string[]
}

type CourseMetadataDraft = {
  title: string
  summary: string
  description: string
  category: string
  topic: string
  model: string
}

function resolveOpenAiApiKey(): { ok: true; key: string } | { ok: false; response: Response } {
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) {
    return {
      ok: false,
      response: jsonResponse({ ok: false, error: 'OpenAI is not configured (missing OPENAI_API_KEY).' }, 500),
    }
  }
  return { ok: true, key: openAiApiKey }
}

function parseDraftRequestContext(
  body: Record<string, unknown>,
): { ok: true; context: DraftRequestContext } | { ok: false; response: Response } {
  const rawTranscript = typeof body.transcript === 'string' ? body.transcript.trim() : ''
  if (!rawTranscript) {
    return { ok: false, response: jsonResponse({ ok: false, error: 'transcript is required and must be non-empty.' }, 400) }
  }

  const transcriptPrompt =
    rawTranscript.length > SUMMARIZE_TRANSCRIPT_MAX_CHARS
      ? `${rawTranscript.slice(0, SUMMARIZE_TRANSCRIPT_MAX_CHARS)}\n\n[Transcript truncated for summarization.]`
      : rawTranscript

  const rawQuestionBankSize =
    typeof body.question_bank_size === 'number' && Number.isFinite(body.question_bank_size)
      ? body.question_bank_size
      : null
  const generatedQuestionCount =
    rawQuestionBankSize == null ? null : rawQuestionBankSize <= 0 ? 0 : clampGeneratedQuestions(rawQuestionBankSize)
  const shownQuestionCount =
    typeof body.questions_shown === 'number' && Number.isFinite(body.questions_shown)
      ? Math.max(1, Math.round(body.questions_shown))
      : null
  const courseMinutes =
    typeof body.course_minutes === 'number' && Number.isFinite(body.course_minutes) ? body.course_minutes : null
  const allowedTopics = normalizeAllowedTopics(body.allowed_topics)

  return {
    ok: true,
    context: {
      transcriptPrompt,
      courseTitle: typeof body.course_title === 'string' ? body.course_title.trim() : '',
      courseMinutes,
      shownQuestionCount,
      generatedQuestionCount,
      allowedTopics,
    },
  }
}

async function openAiStructuredJson(options: {
  apiKey: string
  model: string
  temperature: number
  maxTokens: number
  schemaName: string
  schema: Record<string, unknown>
  messages: Array<{ role: 'system' | 'user'; content: string }>
}): Promise<{ ok: true; parsed: Record<string, unknown> } | { ok: false; error: string }> {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: options.model,
      temperature: options.temperature,
      max_tokens: options.maxTokens,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: options.schemaName,
          schema: options.schema,
          strict: true,
        },
      },
      messages: options.messages,
    }),
  })

  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    return { ok: false, error: openAiErrorMessage(json, response.status) }
  }

  const choices = json?.choices
  const first =
    Array.isArray(choices) && choices[0] && typeof choices[0] === 'object'
      ? (choices[0] as Record<string, unknown>)
      : null
  const message =
    first?.message && typeof first.message === 'object' ? (first.message as Record<string, unknown>) : null
  const content = extractAssistantContent(message?.content)
  if (!content) {
    return { ok: false, error: 'OpenAI returned an empty response.' }
  }

  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, error: 'OpenAI response was not a JSON object.' }
    }
    return { ok: true, parsed: parsed as Record<string, unknown> }
  } catch {
    return { ok: false, error: 'OpenAI response was not valid JSON.' }
  }
}

async function generateCourseMetadataDraft(options: {
  apiKey: string
  context: DraftRequestContext
}): Promise<{ ok: true; metadata: CourseMetadataDraft } | { ok: false; error: string }> {
  const allowedTopicsList = options.context.allowedTopics.join(', ')
  const userContent = options.context.courseTitle
    ? `Course title: ${options.context.courseTitle}\n\nVideo transcript(s):\n${options.context.transcriptPrompt}`
    : `Video transcript(s):\n${options.context.transcriptPrompt}`
  const response = await openAiStructuredJson({
    apiKey: options.apiKey,
    model: COURSE_METADATA_MODEL,
    temperature: 0.2,
    maxTokens: 1500,
    schemaName: 'course_metadata_draft',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        title: { type: 'string' },
        summary: { type: 'string' },
        description: { type: 'string' },
        category: { type: 'string' },
        topic: { type: 'string', enum: options.context.allowedTopics },
      },
      required: ['title', 'summary', 'description', 'category', 'topic'],
    },
    messages: [
      {
        role: 'system',
        content:
          'You write draft metadata for adult-learning courses from transcript evidence only. Return valid JSON matching the required schema. Keep claims grounded in transcript evidence only. Summary should be one sentence under 160 characters. Description should be 2-4 short paragraphs in plain prose (no markdown headings or bullets). Choose exactly one topic from the allowed list. Prefer "General" category unless transcript strongly indicates a better category label.',
      },
      {
        role: 'user',
        content: `${userContent}\n\nAllowed topics: ${allowedTopicsList}\n\nCourse minutes: ${
          options.context.courseMinutes ?? 'unknown'
        }\nOutput JSON fields: title, summary, description, category, topic.`,
      },
    ],
  })
  if (!response.ok) return response

  const title = typeof response.parsed.title === 'string' ? response.parsed.title.trim() : ''
  const summary = typeof response.parsed.summary === 'string' ? response.parsed.summary.trim() : ''
  const description = typeof response.parsed.description === 'string' ? response.parsed.description.trim() : ''
  const category = typeof response.parsed.category === 'string' ? response.parsed.category.trim() : ''
  const topicRaw = typeof response.parsed.topic === 'string' ? response.parsed.topic.trim() : ''
  const topic = options.context.allowedTopics.includes(topicRaw) ? topicRaw : ''

  if (!title || !summary || !description || !category || !topic) {
    return { ok: false, error: 'OpenAI metadata response was missing required fields.' }
  }

  return {
    ok: true,
    metadata: {
      title,
      summary,
      description,
      category,
      topic,
      model: COURSE_METADATA_MODEL,
    },
  }
}

async function generateQuizBatch(options: {
  apiKey: string
  context: DraftRequestContext
  generatedQuestionCount: number
  existingPrompts?: string[]
}): Promise<{ ok: true; questions: DraftQuestion[] } | { ok: false; error: string }> {
  const existingPromptText =
    options.existingPrompts && options.existingPrompts.length > 0
      ? `\n\nAvoid rewriting any of these existing prompts:\n${options.existingPrompts
          .slice(0, 40)
          .map((prompt) => `- ${prompt}`)
          .join('\n')}`
      : ''
  const response = await openAiStructuredJson({
    apiKey: options.apiKey,
    model: COURSE_QUIZ_MODEL,
    temperature: 0.15,
    maxTokens: Math.min(12_000, 1800 + options.generatedQuestionCount * 240),
    schemaName: 'quiz_bank_generation',
    schema: {
      type: 'object',
      additionalProperties: false,
      properties: {
        questions: {
          type: 'array',
          minItems: options.generatedQuestionCount,
          maxItems: options.generatedQuestionCount,
          items: {
            type: 'object',
            additionalProperties: false,
            properties: {
              prompt: { type: 'string' },
              options: {
                type: 'array',
                minItems: 4,
                maxItems: 4,
                items: { type: 'string' },
              },
              correct_option: { type: 'string', enum: ['a', 'b', 'c', 'd'] },
              explanation: { type: 'string' },
              difficulty: { type: 'string', enum: ['easy', 'medium', 'hard'] },
            },
            required: ['prompt', 'options', 'correct_option', 'explanation', 'difficulty'],
          },
        },
      },
      required: ['questions'],
    },
    messages: [
      {
        role: 'system',
        content:
          'Generate a professional workplace quiz bank from transcript evidence only. Avoid trivia and near-duplicate questions. Every question must have exactly one correct option and useful distractors.',
      },
      {
        role: 'user',
        content: `Course title: ${options.context.courseTitle || 'Untitled'}\nCourse minutes: ${
          options.context.courseMinutes ?? 'unknown'
        }\nQuestions shown per learner attempt (S): ${options.context.shownQuestionCount ?? 'unspecified'}\nRequired question bank size (G): ${
          options.generatedQuestionCount
        }\nDifficulty mix target: about 25% easy, 50% medium, 25% hard.\n\nTranscript:\n${
          options.context.transcriptPrompt
        }\n\nReturn ONLY JSON with one field: questions. Include exactly G questions with 4 options each and a short explanation.${existingPromptText}`,
      },
    ],
  })
  if (!response.ok) return response

  const questions = parseDraftQuestions(response.parsed.questions)
  if (questions.length === 0) {
    return { ok: false, error: 'Quiz generation returned zero valid questions.' }
  }
  return { ok: true, questions }
}

async function generateQuizBankStrict(options: {
  apiKey: string
  context: DraftRequestContext
  targetCount: number
}): Promise<
  | { ok: true; questions: DraftQuestion[]; model: string }
  | { ok: false; expectedCount: number; actualCount: number; error: string }
> {
  let questions: DraftQuestion[] = []
  let lastError = ''
  const maxAttempts = Math.max(4, Math.ceil(options.targetCount / 10) * 4)

  for (let attempt = 0; attempt < maxAttempts && questions.length < options.targetCount; attempt += 1) {
    const remaining = options.targetCount - questions.length
    const batchSize = Math.min(10, remaining)
    const batch = await generateQuizBatch({
      apiKey: options.apiKey,
      context: options.context,
      generatedQuestionCount: batchSize,
      existingPrompts: questions.map((question) => question.prompt),
    })
    if (!batch.ok) {
      lastError = batch.error
      continue
    }
    questions = dedupeDraftQuestions([...questions, ...batch.questions]).slice(0, options.targetCount)
  }

  if (questions.length !== options.targetCount) {
    const suffix = lastError ? ` Last error: ${lastError}` : ''
    return {
      ok: false,
      expectedCount: options.targetCount,
      actualCount: questions.length,
      error: `OpenAI quiz response count mismatch. Expected ${options.targetCount}, received ${questions.length}.${suffix}`,
    }
  }

  return { ok: true, questions, model: COURSE_QUIZ_MODEL }
}

async function handleDraftCourseMetadata(body: Record<string, unknown>): Promise<Response> {
  const openAi = resolveOpenAiApiKey()
  if (!openAi.ok) return openAi.response

  const parsed = parseDraftRequestContext(body)
  if (!parsed.ok) return parsed.response

  const metadata = await generateCourseMetadataDraft({ apiKey: openAi.key, context: parsed.context })
  if (!metadata.ok) {
    return jsonResponse({ ok: false, error: metadata.error }, 502)
  }

  return jsonResponse({
    ok: true,
    title: metadata.metadata.title,
    summary: metadata.metadata.summary,
    description: metadata.metadata.description,
    category: metadata.metadata.category,
    topic: metadata.metadata.topic,
    model: metadata.metadata.model,
  })
}

async function handleGenerateQuizBank(body: Record<string, unknown>): Promise<Response> {
  const openAi = resolveOpenAiApiKey()
  if (!openAi.ok) return openAi.response

  const parsed = parseDraftRequestContext(body)
  if (!parsed.ok) return parsed.response

  const targetCount = parsed.context.generatedQuestionCount ?? 0
  if (targetCount <= 0) {
    return jsonResponse(
      {
        ok: false,
        error: 'question_bank_size must be provided and greater than 0 for generate_quiz_bank.',
      },
      400,
    )
  }

  const quiz = await generateQuizBankStrict({
    apiKey: openAi.key,
    context: parsed.context,
    targetCount,
  })
  if (!quiz.ok) {
    return jsonResponse(
      {
        ok: false,
        error: quiz.error,
        expectedCount: quiz.expectedCount,
        actualCount: quiz.actualCount,
      },
      502,
    )
  }

  return jsonResponse({
    ok: true,
    questions: quiz.questions,
    questionBankSize: targetCount,
    questionsShown: parsed.context.shownQuestionCount ?? 0,
    model: quiz.model,
  })
}

async function handleSummarizeTranscript(body: Record<string, unknown>): Promise<Response> {
  const openAi = resolveOpenAiApiKey()
  if (!openAi.ok) return openAi.response

  const parsed = parseDraftRequestContext(body)
  if (!parsed.ok) return parsed.response

  const metadata = await generateCourseMetadataDraft({ apiKey: openAi.key, context: parsed.context })
  if (!metadata.ok) {
    return jsonResponse({ ok: false, error: metadata.error }, 502)
  }

  const targetCount = parsed.context.generatedQuestionCount ?? 0
  let questions: DraftQuestion[] = []
  let quizModel: string | null = null

  if (targetCount > 0) {
    const quiz = await generateQuizBankStrict({
      apiKey: openAi.key,
      context: parsed.context,
      targetCount,
    })
    if (!quiz.ok) {
      return jsonResponse(
        {
          ok: false,
          error: quiz.error,
          expectedCount: quiz.expectedCount,
          actualCount: quiz.actualCount,
        },
        502,
      )
    }
    questions = quiz.questions
    quizModel = quiz.model
  }

  return jsonResponse({
    ok: true,
    title: metadata.metadata.title,
    summary: metadata.metadata.summary,
    description: metadata.metadata.description,
    category: metadata.metadata.category,
    topic: metadata.metadata.topic,
    questions,
    questionBankSize: targetCount,
    questionsShown: parsed.context.shownQuestionCount ?? 0,
    model: quizModel ?? metadata.metadata.model,
    metadataModel: metadata.metadata.model,
    quizModel,
  })
}

async function handleTranscribeFile(formData: FormData): Promise<Response> {
  const openAiApiKey = Deno.env.get('OPENAI_API_KEY')
  if (!openAiApiKey) {
    return jsonResponse({ ok: false, error: 'OpenAI is not configured (missing OPENAI_API_KEY).' }, 500)
  }

  const fileValue = formData.get('file')
  if (!(fileValue instanceof File)) {
    return jsonResponse({ ok: false, error: 'file is required and must be a file upload.' }, 400)
  }
  if (fileValue.size === 0) {
    return jsonResponse({ ok: false, error: 'Uploaded file is empty.' }, 400)
  }

  const languageValue = formData.get('language')
  const language = typeof languageValue === 'string' ? languageValue.trim() : ''
  const modelValue = formData.get('model')
  const modelFromRequest = typeof modelValue === 'string' ? modelValue.trim() : ''
  const model = modelFromRequest || Deno.env.get('OPENAI_TRANSCRIBE_MODEL')?.trim() || 'gpt-4o-mini-transcribe'
  const firstAttempt = await openAiTranscribe(openAiApiKey, fileValue, model, language)
  if (firstAttempt.ok) {
    return jsonResponse({
      ok: true,
      text: firstAttempt.text,
      model: firstAttempt.model,
      transcript: firstAttempt.transcript,
    })
  }

  const fallbackModel = Deno.env.get('OPENAI_TRANSCRIBE_FALLBACK_MODEL')?.trim() || 'whisper-1'
  if (shouldRetryTranscriptionWithFallback(firstAttempt.error, model, fallbackModel)) {
    const fallbackAttempt = await openAiTranscribe(openAiApiKey, fileValue, fallbackModel, language)
    if (fallbackAttempt.ok) {
      return jsonResponse({
        ok: true,
        text: fallbackAttempt.text,
        model: fallbackAttempt.model,
        transcript: fallbackAttempt.transcript,
        fallbackFrom: model,
      })
    }
    return jsonResponse(
      {
        ok: false,
        error: `${firstAttempt.error} Retry with fallback model (${fallbackModel}) also failed: ${fallbackAttempt.error}`,
      },
      502,
    )
  }

  return jsonResponse({ ok: false, error: firstAttempt.error }, 502)
}

type OpenAiTranscribeResult =
  | { ok: true; text: string; model: string; transcript: TranscriptPayload }
  | { ok: false; error: string }

type TranscriptCuePayload = {
  startSeconds?: number
  endSeconds?: number
  text: string
}

type TranscriptPayload = {
  sourceText: string
  plainText: string
  segments: TranscriptCuePayload[]
  downloadVersion: number
}

/** Keep synchronized with `COURSE_TRANSCRIPT_DOWNLOAD_VERSION` in `app/src/lib/transcript.ts`. */
const TRANSCRIPT_DOWNLOAD_VERSION = 1

function normalizeTranscriptText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function toFiniteSeconds(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < 0) return 0
  return value
}

function normalizeTranscriptSegments(rawSegments: unknown): TranscriptCuePayload[] {
  if (!Array.isArray(rawSegments)) return []
  return rawSegments
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const typed = entry as Record<string, unknown>
      const text = typeof typed.text === 'string' ? typed.text.trim() : ''
      if (!text) return null
      const startSeconds = toFiniteSeconds(typed.startSeconds ?? typed.start)
      const endSeconds = toFiniteSeconds(typed.endSeconds ?? typed.end)
      return {
        ...(startSeconds != null ? { startSeconds } : {}),
        ...(endSeconds != null ? { endSeconds } : {}),
        text,
      } satisfies TranscriptCuePayload
    })
    .filter((entry): entry is TranscriptCuePayload => Boolean(entry))
}

function fallbackTranscriptSegments(text: string): TranscriptCuePayload[] {
  const normalized = normalizeTranscriptText(text)
  if (!normalized) return []
  const blocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, ' ').trim())
    .filter((block) => block.length > 0)
  return blocks.map((block) => ({ text: block }))
}

function buildTranscriptPayload(text: string, rawSegments: unknown): TranscriptPayload {
  const normalizedText = normalizeTranscriptText(text)
  const segments = normalizeTranscriptSegments(rawSegments)
  return {
    sourceText: normalizedText,
    plainText: normalizedText,
    segments: segments.length > 0 ? segments : fallbackTranscriptSegments(normalizedText),
    downloadVersion: TRANSCRIPT_DOWNLOAD_VERSION,
  }
}

/**
 * Whisper-class models return segment timestamps with `verbose_json`. Newer `gpt-4o-*-transcribe*`
 * models reject `verbose_json` and require `json` or `text` (OpenAI error:
 * "response_format 'verbose_json' is not compatible with model ...").
 */
function openAiTranscriptionResponseFormat(model: string): 'verbose_json' | 'json' {
  const m = model.toLowerCase().trim()
  if (m === 'whisper-1' || m.startsWith('whisper-')) {
    return 'verbose_json'
  }
  return 'json'
}

async function openAiTranscribe(
  apiKey: string,
  file: File,
  model: string,
  language: string,
): Promise<OpenAiTranscribeResult> {
  const payload = new FormData()
  payload.append('model', model)
  payload.append('response_format', openAiTranscriptionResponseFormat(model))
  payload.append('file', file, file.name || 'upload.mp4')
  if (language) payload.append('language', language)

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: payload,
  })
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok) {
    return { ok: false, error: openAiErrorMessage(json, response.status) }
  }

  const text = typeof json?.text === 'string' ? json.text : ''
  if (!text) {
    return { ok: false, error: 'OpenAI returned an empty transcript.' }
  }
  return {
    ok: true,
    text,
    model,
    transcript: buildTranscriptPayload(text, json?.segments),
  }
}

function extractAssistantContent(content: unknown): string {
  if (typeof content === 'string') return content.trim()
  if (!Array.isArray(content)) return ''
  const textParts = content
    .map((item) => {
      if (!item || typeof item !== 'object') return ''
      const typed = item as Record<string, unknown>
      if (typed.type !== 'text') return ''
      return typeof typed.text === 'string' ? typed.text : ''
    })
    .filter((value) => value.length > 0)
  return textParts.join('\n').trim()
}

function openAiErrorMessage(json: Record<string, unknown> | null, status: number): string {
  const err = json?.error
  if (typeof err === 'string' && err.trim()) {
    return err
  }
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as Record<string, unknown>).message
    if (typeof msg === 'string' && msg.trim()) {
      return msg
    }
  }
  return `OpenAI request error (${status}).`
}

function shouldRetryTranscriptionWithFallback(
  message: string,
  primaryModel: string,
  fallbackModel: string,
): boolean {
  if (!message.trim()) return false
  if (primaryModel === fallbackModel) return false
  const normalized = message.toLowerCase()
  return (
    normalized.includes('too large for this model') ||
    normalized.includes('tokens in instructions + audio') ||
    normalized.includes('maximum context length') ||
    (normalized.includes('verbose_json') && normalized.includes('not compatible'))
  )
}

type MuxEnvelope<T> = {
  data?: T
  errors?: Array<{ message?: string; messages?: string[] }>
  error?: string | Record<string, unknown>
}

/** Mux often returns `error: { type, messages: [...] }` or `errors: [{ messages }]`, not a string. */
function formatMuxApiErrorMessage(body: Record<string, unknown>, httpStatus: number): string {
  const errors = body.errors
  if (Array.isArray(errors) && errors.length > 0) {
    const first = errors[0]
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      const o = first as Record<string, unknown>
      if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
      const msgs = o.messages
      if (Array.isArray(msgs)) {
        const text = msgs.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).join(' ')
        if (text.trim()) return text.trim()
      }
    }
  }
  const err = body.error
  if (typeof err === 'string' && err.trim()) return err.trim()
  if (err && typeof err === 'object' && !Array.isArray(err)) {
    const o = err as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    const msgs = o.messages
    if (Array.isArray(msgs)) {
      const text = msgs.filter((m): m is string => typeof m === 'string' && m.trim().length > 0).join(' ')
      if (text.trim()) return text.trim()
    }
    if (typeof o.type === 'string' && o.type.trim()) return o.type.trim()
  }
  return `Video provider error (${httpStatus})`
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
