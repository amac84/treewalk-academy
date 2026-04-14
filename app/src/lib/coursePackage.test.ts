import { describe, expect, it } from 'vitest'
import type { Course } from '../types'
import { buildCoursePackageExport, COURSE_PACKAGE_EXPORT_SCHEMA_VERSION } from './coursePackage'

const baseCourse: Course = {
  id: 'course-1',
  title: 'Tax Risk Signals',
  summary: 'Spot practical tax risk signals.',
  description: 'A practical overview of common risk patterns and controls.',
  category: 'Tax',
  topic: 'Tax',
  level: 'intermediate',
  audience: 'everyone',
  instructorId: 'u-instructor-1',
  status: 'published',
  videoMinutes: 40,
  muxAssetId: 'asset-1',
  muxPlaybackId: 'playback-1',
  transcript: {
    sourceText: 'First line.\nSecond line.',
    plainText: 'First line.\nSecond line.',
    segments: [
      { startSeconds: 0, endSeconds: 5, text: 'First line.' },
      { startSeconds: 5, endSeconds: 10, text: 'Second line.' },
    ],
    downloadVersion: 1,
  },
  version: 3,
  createdAt: '2026-04-01T00:00:00Z',
  updatedAt: '2026-04-02T00:00:00Z',
  publishedAt: '2026-04-03T00:00:00Z',
  quiz: [
    {
      id: 'q-1',
      prompt: 'Which control reduces tax filing risk?',
      options: [
        { id: 'q-1-o-1', label: 'No review process', isCorrect: false },
        { id: 'q-1-o-2', label: 'Dual review checklist', isCorrect: true },
        { id: 'q-1-o-3', label: 'Skip reconciliations', isCorrect: false },
        { id: 'q-1-o-4', label: 'Ignore thresholds', isCorrect: false },
      ],
      explanation: 'Dual review reduces omissions and classification errors.',
      difficulty: 'medium',
    },
  ],
}

describe('buildCoursePackageExport', () => {
  it('creates a versioned authored package shape', () => {
    const payload = buildCoursePackageExport(baseCourse)
    expect(payload.schemaVersion).toBe(COURSE_PACKAGE_EXPORT_SCHEMA_VERSION)
    expect(payload.course.courseId).toBe(baseCourse.id)
    expect(payload.media.transcript.hasTranscript).toBe(true)
    expect(payload.assessment.questions).toHaveLength(1)
  })

  it('applies export defaults when package profile is missing', () => {
    const payload = buildCoursePackageExport({ ...baseCourse, packageProfile: undefined, activityOutline: undefined })
    expect(payload.profile.runtimeMode).toBe('single_sco')
    expect(payload.profile.mediaDelivery).toBe('stream')
    expect(payload.profile.locale).toBe('en-US')
    expect(payload.profile.manifestIdentifier).toBe(baseCourse.id)
    expect(payload.outline[0]?.id).toContain(baseCourse.id)
  })

  it('preserves explicit package profile and activity outline values', () => {
    const payload = buildCoursePackageExport({
      ...baseCourse,
      packageProfile: {
        schemaVersion: 2,
        locale: 'en-CA',
        runtimeMode: 'multi_sco',
        mediaDelivery: 'packaged_file',
        manifestIdentifier: 'tax-risk-v3',
      },
      activityOutline: [
        { id: 'module-1', title: 'Tax risk overview', type: 'video_assessment', required: true },
        { id: 'module-2', title: 'Reference worksheet', type: 'resource', required: false },
      ],
    })

    expect(payload.profile.schemaVersion).toBe(2)
    expect(payload.profile.runtimeMode).toBe('multi_sco')
    expect(payload.profile.mediaDelivery).toBe('packaged_file')
    expect(payload.profile.manifestIdentifier).toBe('tax-risk-v3')
    expect(payload.outline).toHaveLength(2)
  })
})
