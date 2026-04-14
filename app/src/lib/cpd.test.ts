import { afterEach, describe, expect, it } from 'vitest'
import type { Course, TranscriptEntry } from '../types'
import { __setAppSettingsForTests } from './appSettings'
import { calculateCpdHours, resolveCpdProviderForTranscriptEntry } from './cpd'

function minimalTranscript(overrides: Partial<TranscriptEntry> = {}): TranscriptEntry {
  return {
    id: 'tr-1',
    userId: 'u-1',
    courseId: 'course-1',
    courseTitle: 'Test course',
    completedAt: '2026-01-01T00:00:00.000Z',
    cpdHours: 1,
    certificateId: 'cert-1',
    verificationCode: 'TW-ABC',
    providerName: 'Stored Provider',
    quizAttemptId: 'att-1',
    passThreshold: 70,
    activityWatchedMinutes: 60,
    ...overrides,
  }
}

function minimalCourse(overrides: Partial<Course> = {}): Course {
  return {
    id: 'course-1',
    title: 'Test course',
    summary: '',
    description: '',
    category: 'General',
    topic: 'Leadership',
    level: 'beginner',
    audience: 'internal',
    instructorId: 'ins-1',
    status: 'published',
    videoMinutes: 60,
    version: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    quiz: [],
    ...overrides,
  }
}

describe('calculateCpdHours', () => {
  it('rounds 60 minutes to 1.0 hour', () => {
    expect(calculateCpdHours(60)).toBe(1)
  })

  it('rounds to nearest quarter hour as required by PRD', () => {
    expect(calculateCpdHours(50)).toBe(0.75)
    expect(calculateCpdHours(80)).toBe(1.25)
    expect(calculateCpdHours(90)).toBe(1.5)
  })

  it('supports very short and very long courses', () => {
    expect(calculateCpdHours(5)).toBe(0)
    expect(calculateCpdHours(300)).toBe(5)
  })
})

describe('resolveCpdProviderForTranscriptEntry', () => {
  afterEach(() => {
    __setAppSettingsForTests()
  })

  it('prefers cpdProviderName on the current course over the stored transcript value', () => {
    const entry = minimalTranscript({ providerName: 'Treewalk Academy' })
    const courses = [minimalCourse({ cpdProviderName: 'Treewalk Consulting Inc.' })]
    expect(resolveCpdProviderForTranscriptEntry(entry, courses)).toBe('Treewalk Consulting Inc.')
  })

  it('falls back to the transcript row when the course has no cpdProviderName', () => {
    const entry = minimalTranscript({ providerName: 'Stored Provider' })
    const courses = [minimalCourse()]
    expect(resolveCpdProviderForTranscriptEntry(entry, courses)).toBe('Stored Provider')
  })

  it('uses app default when the course is missing and the transcript provider is empty', () => {
    __setAppSettingsForTests({ cpdProviderName: 'Default From Settings' })
    const entry = minimalTranscript({ providerName: '  ' })
    expect(resolveCpdProviderForTranscriptEntry(entry, [])).toBe('Default From Settings')
  })
})
