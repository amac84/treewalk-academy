import { describe, expect, it } from 'vitest'
import { mockInitialState } from '../data/mockData'
import type { TranscriptEntry, User } from '../types'
import { migrateLearnerRuntimeForClerkLogin, normalizeLearnerProfiles } from './clerkRuntimeMigration'

describe('normalizeLearnerProfiles', () => {
  it('filters invalid entries', () => {
    expect(normalizeLearnerProfiles(undefined)).toEqual([])
    expect(
      normalizeLearnerProfiles([
        { userId: 'u-1', email: 'a@b.com' },
        { userId: '', email: 'x@y.com' },
        { userId: 'u-2', email: 'not-an-email' },
      ]),
    ).toEqual([{ userId: 'u-1', email: 'a@b.com' }])
  })
})

describe('migrateLearnerRuntimeForClerkLogin', () => {
  const clerk: User = {
    id: 'clerk_abc',
    name: 'Alex',
    email: 'alex@treewalk.com',
    role: 'learner',
    accessScope: 'internal',
    status: 'active',
    invitedAt: new Date().toISOString(),
    joinedAt: new Date().toISOString(),
  }

  const transcriptRow = (userId: string): TranscriptEntry => ({
    id: 'tr-1',
    userId,
    courseId: 'c-1',
    courseTitle: 'Course',
    completedAt: new Date().toISOString(),
    cpdHours: 1,
    certificateId: 'cert-1',
    verificationCode: 'TW-X',
    providerName: 'P',
    quizAttemptId: 'qa-1',
    passThreshold: 70,
    activityWatchedMinutes: 60,
  })

  it('remaps transcript via learnerProfiles email match', () => {
    const state = {
      ...mockInitialState,
      learnerProfiles: [{ userId: 'u-invite-1', email: 'alex@treewalk.com' }],
      transcript: [transcriptRow('u-invite-1')],
    }
    const next = migrateLearnerRuntimeForClerkLogin(state, clerk)
    expect(next.transcript[0]?.userId).toBe('clerk_abc')
    expect(next.learnerProfiles.some((p) => p.userId === 'clerk_abc')).toBe(true)
  })

  it('is idempotent', () => {
    const state = {
      ...mockInitialState,
      learnerProfiles: [{ userId: 'u-invite-1', email: 'alex@treewalk.com' }],
      transcript: [transcriptRow('u-invite-1')],
    }
    const once = migrateLearnerRuntimeForClerkLogin(state, clerk)
    const twice = migrateLearnerRuntimeForClerkLogin(once, clerk)
    expect(twice).toEqual(once)
  })

  it('returns unchanged when no legacy ids match', () => {
    const state = {
      ...mockInitialState,
      learnerProfiles: [],
      transcript: [transcriptRow('someone-else')],
    }
    const next = migrateLearnerRuntimeForClerkLogin(state, clerk)
    expect(next).toBe(state)
  })
})
