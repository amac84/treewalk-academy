import type { Course, SegmentTranscriptCue, SegmentTranscriptData } from '../types'

export const COURSE_TRANSCRIPT_DOWNLOAD_VERSION = 1

const EMPTY_TIMESTAMP = ''

function toNormalizedText(value: string): string {
  return value.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim()
}

function toFiniteSeconds(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < 0) return 0
  return value
}

function splitTextBlocks(text: string): string[] {
  const normalized = toNormalizedText(text)
  if (!normalized) return []

  const paragraphBlocks = normalized
    .split(/\n{2,}/)
    .map((block) => block.replace(/\n+/g, ' ').trim())
    .filter((block) => block.length > 0)
  if (paragraphBlocks.length > 1) return paragraphBlocks

  return normalized
    .split(/(?<=[.!?])\s+/)
    .map((block) => block.trim())
    .filter((block) => block.length > 0)
}

export function normalizeTranscriptCues(rawCues: unknown): SegmentTranscriptCue[] {
  if (!Array.isArray(rawCues)) return []
  return rawCues
    .map((entry) => {
      if (!entry || typeof entry !== 'object') return null
      const cue = entry as Record<string, unknown>
      const text = typeof cue.text === 'string' ? cue.text.trim() : ''
      if (!text) return null
      const startSeconds = toFiniteSeconds(cue.startSeconds ?? cue.start)
      const endSeconds = toFiniteSeconds(cue.endSeconds ?? cue.end)
      return {
        ...(startSeconds != null ? { startSeconds } : {}),
        ...(endSeconds != null ? { endSeconds } : {}),
        text,
      } satisfies SegmentTranscriptCue
    })
    .filter((entry): entry is SegmentTranscriptCue => Boolean(entry))
}

function approximateCuesFromText(text: string, durationMinutes?: number): SegmentTranscriptCue[] {
  const blocks = splitTextBlocks(text)
  if (blocks.length === 0) return []

  const durationSeconds =
    typeof durationMinutes === 'number' && Number.isFinite(durationMinutes) && durationMinutes > 0
      ? Math.round(durationMinutes * 60)
      : null

  return blocks.map((block, index) => {
    if (!durationSeconds || blocks.length === 1) {
      return { text: block }
    }
    const startSeconds = Math.round((index / blocks.length) * durationSeconds)
    const endSeconds = Math.round(((index + 1) / blocks.length) * durationSeconds)
    return {
      startSeconds,
      endSeconds: Math.max(startSeconds, endSeconds),
      text: block,
    }
  })
}

export function createStructuredTranscriptFromText(options: {
  text: string
  cues?: unknown
  durationMinutes?: number
}): SegmentTranscriptData {
  const plainText = toNormalizedText(options.text)
  const providedCues = normalizeTranscriptCues(options.cues)
  const segments =
    providedCues.length > 0 ? providedCues : approximateCuesFromText(plainText, options.durationMinutes)

  return {
    sourceText: plainText,
    plainText,
    segments,
    downloadVersion: COURSE_TRANSCRIPT_DOWNLOAD_VERSION,
  }
}

type TranscriptSource = {
  transcript?: SegmentTranscriptData
  transcriptText?: string
  durationMinutes?: number
}

export function readTranscriptData(source: TranscriptSource): SegmentTranscriptData | null {
  const legacyText = toNormalizedText(source.transcriptText ?? '')
  const stored = source.transcript
  if (stored) {
    const storedText = toNormalizedText(stored.plainText || stored.sourceText || legacyText)
    if (storedText) {
      const normalized = createStructuredTranscriptFromText({
        text: storedText,
        cues: stored.segments,
        durationMinutes: source.durationMinutes,
      })
      return {
        ...normalized,
        downloadVersion:
          typeof stored.downloadVersion === 'number' && Number.isFinite(stored.downloadVersion)
            ? stored.downloadVersion
            : COURSE_TRANSCRIPT_DOWNLOAD_VERSION,
      }
    }
  }

  if (!legacyText) return null
  return createStructuredTranscriptFromText({
    text: legacyText,
    durationMinutes: source.durationMinutes,
  })
}

export function getTranscriptPlainText(source: TranscriptSource): string {
  return readTranscriptData(source)?.plainText ?? ''
}

export function formatTranscriptTimestamp(seconds?: number): string {
  if (seconds == null || !Number.isFinite(seconds)) return EMPTY_TIMESTAMP
  const total = Math.max(0, Math.round(seconds))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
  }
  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
}

export type CourseTranscriptDownload = {
  schemaVersion: number
  generatedAt: string
  course: {
    courseId: string
    title: string
    videoMinutes: number
  }
  video: {
    hasTranscript: boolean
    plainText: string
    cues: SegmentTranscriptCue[]
  }
}

export function buildCourseTranscriptDownload(course: Course): CourseTranscriptDownload {
  const transcript = readTranscriptData({
    transcript: course.transcript,
    transcriptText: course.transcriptText,
    durationMinutes: course.videoMinutes,
  })
  return {
    schemaVersion: COURSE_TRANSCRIPT_DOWNLOAD_VERSION,
    generatedAt: new Date().toISOString(),
    course: {
      courseId: course.id,
      title: course.title,
      videoMinutes: course.videoMinutes,
    },
    video: {
      hasTranscript: Boolean(transcript?.plainText),
      plainText: transcript?.plainText ?? '',
      cues: transcript?.segments ?? [],
    },
  }
}

export function buildCourseTranscriptPlainText(course: Course): string {
  return getTranscriptPlainText({
    transcript: course.transcript,
    transcriptText: course.transcriptText,
    durationMinutes: course.videoMinutes,
  })
}
