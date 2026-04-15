import {
  extractAudioFromVideoForTranscription,
  isVideoLikeForTranscription,
  type ExtractAudioProgress,
} from './extractAudioForTranscription'
import { ensureMuxSupabaseAccessToken } from './supabaseMuxSession'
import { hasSupabaseBrowserEnv } from './supabaseClient'
import {
  COURSE_TRANSCRIPT_DOWNLOAD_VERSION,
  createStructuredTranscriptFromText,
  getTranscriptPlainText,
  normalizeTranscriptCues,
} from './transcript'
import type { SegmentTranscriptData } from '../types'
import { getAppSettings } from './appSettings'

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export type { ExtractAudioProgress }

/** OpenAI `audio/transcriptions` hard limit; Edge payloads should stay small too. */
export const OPENAI_TRANSCRIPTION_MAX_BYTES = 25 * 1024 * 1024

export function isFileTooLargeForOpenAiTranscription(file: File): boolean {
  return file.size > OPENAI_TRANSCRIPTION_MAX_BYTES
}

export function transcribeFileTooLargeMessage(file: File): string {
  const mb = (file.size / (1024 * 1024)).toFixed(1)
  return `The audio prepared for transcription is about ${mb} MB. The service accepts at most 25 MB per request. Try a shorter recording, export at a lower quality, or paste a transcript manually in Draft prep.`
}

async function prepareFileForTranscription(
  file: File,
  onExtractProgress?: (p: ExtractAudioProgress) => void,
): Promise<File> {
  if (!isVideoLikeForTranscription(file)) {
    return file
  }
  return extractAudioFromVideoForTranscription(file, { onProgress: onExtractProgress })
}

/** Same Supabase project as `feedbackFunctionUrl` when that URL targets *.supabase.co. */
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

/** Resolves the video Edge Function URL: explicit env wins, else same Supabase project as URL envs. */
function resolvedMuxFunctionUrl(): string | null {
  const settings = getAppSettings()
  const explicit = settings.muxFunctionUrl
  if (explicit) return explicit
  const base = settings.supabaseUrl
  if (base) {
    return `${base.replace(/\/$/, '')}/functions/v1/mux`
  }
  const fromFeedback = supabaseApiOriginFromFeedbackUrl()
  if (fromFeedback) {
    return `${fromFeedback}/functions/v1/mux`
  }
  return null
}

/** True when the SPA can call the video upload Edge Function (direct upload + transcription). */
export function isMuxFunctionConfigured(): boolean {
  return Boolean(resolvedMuxFunctionUrl() && hasSupabaseBrowserEnv())
}

function muxFunctionUrl(): string {
  const url = resolvedMuxFunctionUrl()
  if (!url) {
    throw new Error(
      import.meta.env.DEV
        ? 'Add supabaseUrl (or muxFunctionUrl) to app/public/app-settings.json, then restart npm run dev.'
        : 'Video upload is not configured for this site.',
    )
  }
  return url
}

async function authHeaders(): Promise<Headers> {
  const headers = new Headers()
  const anonKey = getAppSettings().supabaseAnonKey
  if (anonKey) {
    headers.set('apikey', anonKey)
    headers.set('X-Client-Info', 'treewalk-academy-mux')
  }

  const token = await ensureMuxSupabaseAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return headers
}

async function jsonHeadersWithAuth(): Promise<Headers> {
  const headers = await authHeaders()
  headers.set('Content-Type', 'application/json')
  return headers
}

function looksLikeHtmlBody(text: string): boolean {
  return /^\s*</.test(text)
}

/** Read JSON POST response; on errors, prefer server `error` / `message` or a clear status hint. */
function muxWireErrorToString(raw: unknown): string {
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const o = raw as Record<string, unknown>
    if (typeof o.message === 'string' && o.message.trim()) return o.message.trim()
    const msgs = o.messages
    if (Array.isArray(msgs)) {
      const text = msgs
        .filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
        .join(' ')
      if (text.trim()) return text.trim()
    }
    if (typeof o.type === 'string' && o.type.trim()) return o.type.trim()
  }
  return ''
}

function messageFromMuxJsonResponse(
  status: number,
  json: Record<string, unknown> | null,
  rawText: string,
): string {
  const err =
    muxWireErrorToString(json?.error) ||
    (typeof json?.message === 'string' && json.message.trim()) ||
    ''
  if (err) return err

  if (status === 502 || status === 503 || status === 504) {
    return (
      'The video service did not respond in time or returned an error. Wait a moment and try again. ' +
      'If this keeps happening, confirm the mux Edge Function is deployed and Mux credentials (MUX_TOKEN_ID / MUX_TOKEN_SECRET) are set in Supabase secrets, then check Supabase → Edge Functions → mux logs.'
    )
  }

  const trimmed = rawText.trim()
  if (trimmed && trimmed.length < 500 && !looksLikeHtmlBody(trimmed)) {
    return trimmed
  }
  return `Video service error (${status})`
}

export async function muxEdgePost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await jsonHeadersWithAuth()
  if (!headers.get('Authorization')) {
    const missingAnon = !hasSupabaseBrowserEnv()
    throw new Error(
      import.meta.env.DEV
        ? missingAnon
          ? 'Video upload needs supabaseUrl or feedbackFunctionUrl plus supabaseAnonKey in app/public/app-settings.json. Anonymous sign-in must be enabled in Supabase for seeded demo roles.'
          : 'Video upload needs a Supabase user JWT. Enable Anonymous sign-in (Supabase Auth → Providers), then reload. (Advanced: MUX_ALLOW_UNAUTHENTICATED on a private dev backend only.)'
        : missingAnon
          ? 'Video upload is missing the public Supabase settings for this deployment. Add them to the app settings file, redeploy, then try again.'
          : 'You must be signed in to upload or process video. Anonymous sign-in is enabled in Supabase but no JWT was created — set supabaseMuxAnonFallback to false only for strict real-auth deploys; otherwise check the browser console.',
    )
  }

  const response = await fetch(muxFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  let json: Record<string, unknown> | null = null
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>
      }
    } catch {
      /* non-JSON body (e.g. gateway HTML) */
    }
  }

  if (!response.ok) {
    throw new Error(messageFromMuxJsonResponse(response.status, json, rawText))
  }
  return json ?? {}
}

/**
 * Permanently deletes a Mux asset (frees hosted quota). Requires Clerk session JWT on the Edge function
 * (`CLERK_SECRET_KEY` + `X-Clerk-Session-Token`); content_admin / super_admin may delete any asset;
 * instructors must pass `courseId` and own the course in `academy_courses`.
 */
export async function deleteMuxAsset(options: {
  assetId: string
  courseId?: string
  clerkSessionToken: string
}): Promise<void> {
  const token = options.clerkSessionToken.trim()
  if (!token) {
    throw new Error('Clerk session is required to delete video from Mux.')
  }
  const headers = await jsonHeadersWithAuth()
  if (!headers.get('Authorization')) {
    const missingAnon = !hasSupabaseBrowserEnv()
    throw new Error(
      missingAnon
        ? 'Video service needs Supabase settings and a user session before Mux delete.'
        : 'Video service needs a Supabase user JWT before Mux delete.',
    )
  }
  headers.set('X-Clerk-Session-Token', token)

  const body: Record<string, unknown> = {
    action: 'delete_mux_asset',
    asset_id: options.assetId.trim(),
  }
  if (options.courseId?.trim()) {
    body.course_id = options.courseId.trim()
  }

  const response = await fetch(muxFunctionUrl(), {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })

  const rawText = await response.text()
  let json: Record<string, unknown> | null = null
  if (rawText) {
    try {
      const parsed = JSON.parse(rawText) as unknown
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        json = parsed as Record<string, unknown>
      }
    } catch {
      /* ignore */
    }
  }

  if (!response.ok) {
    throw new Error(messageFromMuxJsonResponse(response.status, json, rawText))
  }
  if (json?.ok !== true) {
    const msg =
      muxWireErrorToString(json?.error) ||
      (typeof json?.message === 'string' && json.message.trim()) ||
      'Mux did not confirm deletion.'
    throw new Error(msg)
  }
}

export async function createMuxDirectUpload(corsOrigin: string): Promise<{ uploadId: string; uploadUrl: string }> {
  const json = await muxEdgePost({
    action: 'create_direct_upload',
    cors_origin: corsOrigin,
  })
  if (json.ok !== true || typeof json.uploadId !== 'string' || typeof json.uploadUrl !== 'string') {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not start the upload. Try again.')
  }
  return { uploadId: json.uploadId, uploadUrl: json.uploadUrl }
}

export async function getMuxUpload(uploadId: string): Promise<{
  status?: string
  assetId: string | null
}> {
  const json = await muxEdgePost({ action: 'get_upload', upload_id: uploadId })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not check upload status.')
  }
  const assetId = typeof json.assetId === 'string' ? json.assetId : null
  return {
    status: typeof json.status === 'string' ? json.status : undefined,
    assetId,
  }
}

/** Whole minutes for catalog / progress (minimum 1 minute). */
export function muxDurationSecondsToMinutes(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 1
  return Math.max(1, Math.round(seconds / 60))
}

export async function getMuxAsset(assetId: string): Promise<{
  status?: string
  playbackId: string | null
  durationSeconds: number | null
}> {
  const json = await muxEdgePost({ action: 'get_asset', asset_id: assetId })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not read video processing status.')
  }
  const playbackId = typeof json.playbackId === 'string' ? json.playbackId : null
  const rawDuration = json.durationSeconds
  const durationSeconds =
    typeof rawDuration === 'number' && Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : null
  return {
    status: typeof json.status === 'string' ? json.status : undefined,
    playbackId,
    durationSeconds,
  }
}

export type MuxLiveLatencyMode = 'low' | 'standard'

export async function createMuxLiveStream(options?: {
  title?: string
  latencyMode?: MuxLiveLatencyMode
  reconnectWindowSeconds?: number
  passthrough?: string
}): Promise<{
  liveStreamId: string
  playbackId: string | null
  streamKey: string | null
  status?: string
}> {
  const json = await muxEdgePost({
    action: 'create_live_stream',
    title: options?.title ?? '',
    latency_mode: options?.latencyMode ?? 'low',
    reconnect_window_seconds: options?.reconnectWindowSeconds ?? 60,
    passthrough: options?.passthrough ?? '',
  })
  if (json.ok !== true || typeof json.liveStreamId !== 'string') {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not create a live stream.')
  }
  return {
    liveStreamId: json.liveStreamId,
    playbackId: typeof json.playbackId === 'string' ? json.playbackId : null,
    streamKey: typeof json.streamKey === 'string' ? json.streamKey : null,
    status: typeof json.status === 'string' ? json.status : undefined,
  }
}

export async function getMuxLiveStream(liveStreamId: string): Promise<{
  liveStreamId: string
  status?: string
  playbackId: string | null
  recentAssetId: string | null
}> {
  const json = await muxEdgePost({ action: 'get_live_stream', live_stream_id: liveStreamId })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not read live stream status.')
  }
  return {
    liveStreamId:
      typeof json.liveStreamId === 'string' && json.liveStreamId.trim()
        ? json.liveStreamId
        : liveStreamId,
    status: typeof json.status === 'string' ? json.status : undefined,
    playbackId: typeof json.playbackId === 'string' ? json.playbackId : null,
    recentAssetId: typeof json.recentAssetId === 'string' ? json.recentAssetId : null,
  }
}

export type MuxLiveStreamSummary = {
  liveStreamId: string
  status?: string
  playbackId: string | null
  recentAssetId: string | null
  createdAt?: string
}

export async function listMuxLiveStreams(limit = 20): Promise<MuxLiveStreamSummary[]> {
  const json = await muxEdgePost({ action: 'list_live_streams', limit })
  if (json.ok !== true || !Array.isArray(json.streams)) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not load live streams.')
  }
  const streams: MuxLiveStreamSummary[] = []
  for (const entry of json.streams) {
    if (!entry || typeof entry !== 'object') continue
    const typed = entry as Record<string, unknown>
    const liveStreamId = typeof typed.liveStreamId === 'string' ? typed.liveStreamId.trim() : ''
    if (!liveStreamId) continue
    streams.push({
      liveStreamId,
      status: typeof typed.status === 'string' ? typed.status : undefined,
      playbackId: typeof typed.playbackId === 'string' ? typed.playbackId : null,
      recentAssetId: typeof typed.recentAssetId === 'string' ? typed.recentAssetId : null,
      createdAt: typeof typed.createdAt === 'string' ? typed.createdAt : undefined,
    })
  }
  return streams
}

export async function getOrCreateMuxRehearsalStream(): Promise<{
  liveStreamId: string
  playbackId: string | null
  streamKey: string | null
}> {
  const json = await muxEdgePost({ action: 'get_or_create_rehearsal_stream' })
  if (json.ok !== true || typeof json.liveStreamId !== 'string') {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not provision rehearsal stream.')
  }
  return {
    liveStreamId: json.liveStreamId,
    playbackId: typeof json.playbackId === 'string' ? json.playbackId : null,
    streamKey: typeof json.streamKey === 'string' ? json.streamKey : null,
  }
}

export type MuxByteUploadProgress = {
  loaded: number
  total: number
}

/**
 * PUT the file to the provider’s signed upload URL. Uses XMLHttpRequest so we can report byte progress
 * (the Fetch API does not expose upload progress).
 */
export function putVideoToMuxUpload(
  uploadUrl: string,
  file: File,
  options?: { onProgress?: (progress: MuxByteUploadProgress) => void },
): Promise<void> {
  const totalBytes = file.size > 0 ? file.size : 0

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', uploadUrl)
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream')

    xhr.upload.onprogress = (ev) => {
      const total =
        ev.lengthComputable && ev.total > 0 ? ev.total : totalBytes > 0 ? totalBytes : ev.loaded || 0
      options?.onProgress?.({ loaded: ev.loaded, total })
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        if (totalBytes > 0) {
          options?.onProgress?.({ loaded: totalBytes, total: totalBytes })
        }
        resolve()
      } else {
        reject(new Error(`Video upload failed (${xhr.status}).`))
      }
    }
    xhr.onerror = () => reject(new Error('Video upload failed (network error).'))
    xhr.onabort = () => reject(new Error('Upload cancelled.'))

    options?.onProgress?.({ loaded: 0, total: totalBytes })
    xhr.send(file)
  })
}

export type TranscribeMediaOptions = {
  language?: string
  /** Fired while ffmpeg.wasm extracts audio from video (ratio 0–1). */
  onExtractProgress?: (p: ExtractAudioProgress) => void
  /** High-level stage updates for dedicated transcription UI. */
  onPhaseChange?: (phase: TranscriptionPhase) => void
}

export type TranscriptionPhase = 'extracting_audio' | 'transcribing'

function parseStructuredTranscriptFromResponse(
  json: Record<string, unknown>,
  fallbackText: string,
): SegmentTranscriptData {
  const transcriptRaw = json.transcript
  if (transcriptRaw && typeof transcriptRaw === 'object' && !Array.isArray(transcriptRaw)) {
    const typed = transcriptRaw as Record<string, unknown>
    const sourceText =
      typeof typed.plainText === 'string'
        ? typed.plainText
        : typeof typed.sourceText === 'string'
          ? typed.sourceText
          : fallbackText
    const normalized = createStructuredTranscriptFromText({
      text: sourceText,
      cues: typed.segments,
    })
    return {
      ...normalized,
      downloadVersion:
        typeof typed.downloadVersion === 'number' && Number.isFinite(typed.downloadVersion)
          ? typed.downloadVersion
          : COURSE_TRANSCRIPT_DOWNLOAD_VERSION,
    }
  }
  return createStructuredTranscriptFromText({
    text: fallbackText,
    cues: normalizeTranscriptCues(json.segments),
  })
}

export async function transcribeVideoFile(
  file: File,
  options?: TranscribeMediaOptions | string,
): Promise<{ text: string; model?: string; transcript: SegmentTranscriptData }> {
  const normalized: TranscribeMediaOptions =
    typeof options === 'string' ? { language: options } : (options ?? {})

  if (isVideoLikeForTranscription(file)) {
    normalized.onPhaseChange?.('extracting_audio')
  }
  const prepared = await prepareFileForTranscription(file, normalized.onExtractProgress)

  if (isFileTooLargeForOpenAiTranscription(prepared)) {
    throw new Error(transcribeFileTooLargeMessage(prepared))
  }

  const headers = await authHeaders()
  if (!headers.get('Authorization')) {
    throw new Error(
      import.meta.env.DEV
        ? 'Transcription needs a Supabase user JWT. Enable Anonymous sign-in in Supabase for local demo roles, or use a real account.'
        : 'You must be signed in to run transcription. Enable Anonymous sign-in in Supabase for demo/invite pilots unless supabaseMuxAnonFallback is false.',
    )
  }
  const form = new FormData()
  form.append('action', 'transcribe_file')
  form.append('file', prepared, prepared.name)
  const model = getAppSettings().openAiTranscribeModel
  if (model) {
    form.append('model', model)
  }
  if (normalized.language?.trim()) {
    form.append('language', normalized.language.trim())
  }

  normalized.onPhaseChange?.('transcribing')
  const response = await fetch(muxFunctionUrl(), {
    method: 'POST',
    headers,
    body: form,
  })
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null
  if (!response.ok || json?.ok !== true || typeof json?.text !== 'string') {
    const fromBody = typeof json?.error === 'string' ? json.error : ''
    let msg = fromBody || `Transcription request failed (${response.status}).`
    // Supabase Edge: 546 = WORKER_LIMIT (memory, CPU, or request too large for the worker).
    if (response.status === 546 && !fromBody) {
      msg =
        'Transcription could not finish — the file may be too large or the server was busy. Try a shorter recording or try again in a few minutes.'
    }
    throw new Error(msg)
  }
  const text = typeof json.text === 'string' ? json.text : ''
  return {
    text,
    model: typeof json.model === 'string' ? json.model : undefined,
    transcript: parseStructuredTranscriptFromResponse(json, text),
  }
}

/** Builds transcript text for AI summary prompts. */
export function buildTranscriptSummaryText(input: {
  title?: string
  transcript?: SegmentTranscriptData
  transcriptText?: string
  durationMinutes?: number
}): string {
  const plainText = getTranscriptPlainText(input).trim()
  if (!plainText) return ''
  return input.title?.trim() ? `## ${input.title.trim()}\n\n${plainText}` : plainText
}

export type DraftedCourseMetadata = {
  title: string
  summary: string
  description: string
  category: string
  topic: string
  model?: string
}

export type DraftedQuizQuestion = {
  prompt: string
  options: [string, string, string, string]
  correctOption: 'a' | 'b' | 'c' | 'd'
  explanation: string
  difficulty: 'easy' | 'medium' | 'hard'
}

export type DraftedCoursePackage = DraftedCourseMetadata & {
  questions: DraftedQuizQuestion[]
  questionBankSize: number
  questionsShown: number
}

export type DraftedQuizBank = {
  questions: DraftedQuizQuestion[]
  questionBankSize: number
  questionsShown: number
  model?: string
}

function parseDraftedQuizQuestions(raw: unknown): DraftedQuizQuestion[] {
  const questionsRaw = Array.isArray(raw) ? raw : []
  return questionsRaw
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const typed = entry as Record<string, unknown>
      const prompt = typeof typed.prompt === 'string' ? typed.prompt.trim() : ''
      const options = Array.isArray(typed.options)
        ? typed.options.map((item) => (typeof item === 'string' ? item.trim() : ''))
        : []
      // Accept both legacy and current wire keys to stay compatible with Edge function updates.
      const rawCorrectOption =
        typeof typed.correctOption === 'string'
          ? typed.correctOption
          : typeof typed.correct_option === 'string'
            ? typed.correct_option
            : ''
      const correctOption = rawCorrectOption.trim().toLowerCase()
      const explanation = typeof typed.explanation === 'string' ? typed.explanation.trim() : ''
      const difficulty = typeof typed.difficulty === 'string' ? typed.difficulty.trim().toLowerCase() : ''
      if (
        !prompt ||
        options.length !== 4 ||
        !['a', 'b', 'c', 'd'].includes(correctOption) ||
        !explanation ||
        !['easy', 'medium', 'hard'].includes(difficulty)
      ) {
        return null
      }
      return {
        prompt,
        options: options as [string, string, string, string],
        correctOption: correctOption as 'a' | 'b' | 'c' | 'd',
        explanation,
        difficulty: difficulty as 'easy' | 'medium' | 'hard',
      }
    })
    .filter((entry): entry is DraftedQuizQuestion => Boolean(entry))
}

function baseDraftPayload(options: {
  transcript: string
  courseTitle?: string
  allowedTopics?: string[]
  courseMinutes?: number
  questionBankSize?: number
  questionsShown?: number
}): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    transcript: options.transcript.trim(),
  }
  const title = options.courseTitle?.trim()
  if (title) {
    payload.course_title = title
  }
  if (options.allowedTopics?.length) {
    payload.allowed_topics = options.allowedTopics
  }
  if (typeof options.courseMinutes === 'number' && Number.isFinite(options.courseMinutes)) {
    payload.course_minutes = options.courseMinutes
  }
  if (typeof options.questionBankSize === 'number' && Number.isFinite(options.questionBankSize)) {
    payload.question_bank_size = options.questionBankSize
  }
  if (typeof options.questionsShown === 'number' && Number.isFinite(options.questionsShown)) {
    payload.questions_shown = options.questionsShown
  }
  return payload
}

/**
 * Backward-compatible wrapper that drafts metadata and quiz bank from transcript content.
 */
export async function draftCoursePackageFromTranscript(options: {
  transcript: string
  courseTitle?: string
  allowedTopics?: string[]
  courseMinutes?: number
  questionBankSize?: number
  questionsShown?: number
}): Promise<DraftedCoursePackage> {
  const metadata = await draftCourseMetadataFromTranscript(options)
  const quiz = await draftQuizBankFromTranscript(options)
  return {
    ...metadata,
    questions: quiz.questions,
    questionBankSize: quiz.questionBankSize,
    questionsShown: quiz.questionsShown,
    model: quiz.model ?? metadata.model,
  }
}

export async function draftCourseMetadataFromTranscript(options: {
  transcript: string
  courseTitle?: string
  allowedTopics?: string[]
  courseMinutes?: number
}): Promise<DraftedCourseMetadata> {
  const transcript = options.transcript.trim()
  if (!transcript) {
    throw new Error('Need transcript text before generating metadata.')
  }
  const payload: Record<string, unknown> = {
    action: 'draft_course_metadata',
    ...baseDraftPayload({
      transcript,
      courseTitle: options.courseTitle,
      allowedTopics: options.allowedTopics,
      courseMinutes: options.courseMinutes,
    }),
  }
  const json = await muxEdgePost(payload)
  if (
    json.ok !== true ||
    typeof json.title !== 'string' ||
    typeof json.summary !== 'string' ||
    typeof json.description !== 'string' ||
    typeof json.category !== 'string' ||
    typeof json.topic !== 'string'
  ) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not generate draft metadata.')
  }
  return {
    title: json.title.trim(),
    summary: json.summary.trim(),
    description: json.description.trim(),
    category: json.category.trim(),
    topic: json.topic.trim(),
    model: typeof json.model === 'string' ? json.model : undefined,
  }
}

export async function draftQuizBankFromTranscript(options: {
  transcript: string
  courseTitle?: string
  allowedTopics?: string[]
  courseMinutes?: number
  questionBankSize?: number
  questionsShown?: number
}): Promise<DraftedQuizBank> {
  const transcript = options.transcript.trim()
  if (!transcript) {
    throw new Error('Need transcript text before generating quiz questions.')
  }
  const requestedCount =
    typeof options.questionBankSize === 'number' && Number.isFinite(options.questionBankSize)
      ? Math.max(0, Math.round(options.questionBankSize))
      : 0
  if (requestedCount === 0) {
    return {
      questions: [],
      questionBankSize: 0,
      questionsShown:
        typeof options.questionsShown === 'number' && Number.isFinite(options.questionsShown)
          ? Math.max(0, Math.round(options.questionsShown))
          : 0,
    }
  }
  const json = await muxEdgePost({
    action: 'generate_quiz_bank',
    ...baseDraftPayload({
      transcript,
      courseTitle: options.courseTitle,
      allowedTopics: options.allowedTopics,
      courseMinutes: options.courseMinutes,
      questionBankSize: requestedCount,
      questionsShown: options.questionsShown,
    }),
  })
  if (json.ok !== true) {
    throw new Error(typeof json.error === 'string' ? json.error : 'Could not generate quiz bank.')
  }
  const questions = parseDraftedQuizQuestions(json.questions)
  const expectedCount = typeof json.questionBankSize === 'number' ? json.questionBankSize : requestedCount
  if (questions.length !== expectedCount) {
    throw new Error(`Quiz generation returned ${questions.length} valid questions (expected ${expectedCount}).`)
  }
  return {
    questions,
    questionBankSize: expectedCount,
    questionsShown: typeof json.questionsShown === 'number' ? json.questionsShown : 0,
    model: typeof json.model === 'string' ? json.model : undefined,
  }
}

export async function summarizeTranscriptToCourseDescription(options: {
  transcript: string
  courseTitle?: string
}): Promise<{ description: string; model?: string }> {
  const metadata = await draftCourseMetadataFromTranscript(options)
  return { description: metadata.description, model: metadata.model }
}

export async function waitForMuxPlaybackId(uploadId: string): Promise<{
  assetId: string
  playbackId: string
  durationSeconds: number | null
}> {
  let assetId: string | null = null
  for (let i = 0; i < 90; i++) {
    const u = await getMuxUpload(uploadId)
    if (u.status === 'errored') {
      throw new Error('The upload failed on the server.')
    }
    if (u.assetId) {
      assetId = u.assetId
      break
    }
    await sleep(2000)
  }
  if (!assetId) {
    throw new Error('Timed out waiting for the server to accept the upload.')
  }

  let playbackIdWithoutDuration: string | null = null
  for (let i = 0; i < 120; i++) {
    const a = await getMuxAsset(assetId)
    if (a.status === 'errored') {
      throw new Error('Video processing failed on the server.')
    }
    if (a.playbackId) {
      // Mux can expose a playback ID before duration metadata is ready.
      // Keep polling so new drafts do not keep the 15-minute fallback.
      if (a.durationSeconds != null) {
        return { assetId, playbackId: a.playbackId, durationSeconds: a.durationSeconds }
      }
      playbackIdWithoutDuration = a.playbackId
      if (a.status === 'ready') {
        return { assetId, playbackId: a.playbackId, durationSeconds: null }
      }
    }
    await sleep(2000)
  }

  if (playbackIdWithoutDuration) {
    return { assetId, playbackId: playbackIdWithoutDuration, durationSeconds: null }
  }

  throw new Error('Timed out waiting for video encoding to finish — try again in a moment or refresh the page.')
}
