import {
  extractAudioFromVideoForTranscription,
  isVideoLikeForTranscription,
  type ExtractAudioProgress,
} from './extractAudioForTranscription'
import { ensureMuxSupabaseAccessToken } from './supabaseMuxSession'
import {
  createStructuredTranscriptFromText,
  getTranscriptPlainText,
  normalizeTranscriptCues,
} from './transcript'
import type { SegmentTranscriptData } from '../types'

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

/** Same Supabase project as `VITE_FEEDBACK_FUNCTION_URL` when that URL targets *.supabase.co. */
function supabaseApiOriginFromFeedbackUrl(): string | null {
  const raw = import.meta.env.VITE_FEEDBACK_FUNCTION_URL?.trim()
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
  const explicit = import.meta.env.VITE_MUX_FUNCTION_URL?.trim()
  if (explicit) return explicit
  const base = import.meta.env.VITE_SUPABASE_URL?.trim()
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
  return Boolean(resolvedMuxFunctionUrl())
}

function muxFunctionUrl(): string {
  const url = resolvedMuxFunctionUrl()
  if (!url) {
    throw new Error(
      import.meta.env.DEV
        ? 'Add VITE_SUPABASE_URL (and deploy the mux function) or set VITE_MUX_FUNCTION_URL in app/.env, then restart npm run dev.'
        : 'Video upload is not configured for this site.',
    )
  }
  return url
}

async function authHeaders(): Promise<Headers> {
  const headers = new Headers()
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim()
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

export async function muxEdgePost(body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const headers = await jsonHeadersWithAuth()
  if (!headers.get('Authorization')) {
    throw new Error(
      import.meta.env.DEV
        ? 'Video upload needs a Supabase user JWT. For seeded demo roles: enable Anonymous sign-in (Supabase Auth → Providers), set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then reload. (Advanced: MUX_ALLOW_UNAUTHENTICATED on a private dev backend only.)'
        : 'You must be signed in to upload or process video. If you use demo or invite logins, enable Anonymous sign-in in Supabase and redeploy unless VITE_SUPABASE_MUX_ANON_FALLBACK=false.',
    )
  }

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
      `Video service error (${response.status})`
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
          : normalized.downloadVersion,
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
        : 'You must be signed in to run transcription. Enable Anonymous sign-in in Supabase for demo/invite pilots unless VITE_SUPABASE_MUX_ANON_FALLBACK=false.',
    )
  }
  const form = new FormData()
  form.append('action', 'transcribe_file')
  form.append('file', prepared, prepared.name)
  const model = import.meta.env.VITE_OPENAI_TRANSCRIBE_MODEL?.trim()
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
