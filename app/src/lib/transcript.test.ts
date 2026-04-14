import { describe, expect, it } from 'vitest'
import type { Course } from '../types'
import {
  buildCourseTranscriptDownload,
  buildCourseTranscriptPlainText,
  formatTranscriptTimestamp,
  readTranscriptData,
} from './transcript'

const baseCourse: Course = {
  id: 'course-1',
  title: 'Transcript Course',
  summary: 'summary',
  description: 'description',
  category: 'General',
  topic: 'Technology',
  level: 'beginner',
  audience: 'everyone',
  instructorId: 'u-1',
  status: 'published',
  videoMinutes: 30,
  transcriptText: 'Legacy line one.\n\nLegacy line two.',
  transcriptStatus: 'ready',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  quiz: [],
}

describe('transcript helpers', () => {
  it('normalizes legacy transcript text into cue blocks', () => {
    const transcript = readTranscriptData({
      transcriptText: baseCourse.transcriptText,
      durationMinutes: baseCourse.videoMinutes,
    })
    expect(transcript?.plainText).toContain('Legacy line one.')
    expect(transcript?.segments.length).toBeGreaterThan(1)
  })

  it('builds plain-text export for the course video', () => {
    const plainText = buildCourseTranscriptPlainText(baseCourse)
    expect(plainText).toContain('Legacy line one.')
  })

  it('builds JSON transcript bundle with cue data', () => {
    const courseWithStructuredTranscript: Course = {
      ...baseCourse,
      transcript: {
        sourceText: 'Segmented line',
        plainText: 'Segmented line',
        downloadVersion: 1,
        segments: [{ startSeconds: 4, endSeconds: 8, text: 'Segmented line' }],
      },
    }
    const payload = buildCourseTranscriptDownload(courseWithStructuredTranscript)
    expect(payload.course.courseId).toBe(courseWithStructuredTranscript.id)
    expect(payload.video.hasTranscript).toBe(true)
    expect(payload.video.cues[0]?.startSeconds).toBe(4)
  })

  it('formats timestamps for transcript labels', () => {
    expect(formatTranscriptTimestamp(61)).toBe('01:01')
    expect(formatTranscriptTimestamp(3661)).toBe('01:01:01')
  })
})
