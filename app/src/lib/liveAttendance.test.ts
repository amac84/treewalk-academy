import { describe, expect, it } from 'vitest'
import type { Completion, LiveOccurrenceAttendance } from '../types'
import {
  clampLiveAttendanceHeartbeatDeltaSeconds,
  evaluateLiveAttendanceQualification,
  getLiveAttendanceRequiredWatchSeconds,
  hasCompletionForCourse,
} from './liveAttendance'

const occurrence = {
  status: 'ended' as const,
  startAt: '2026-04-14T15:00:00.000Z',
  expectedMinutes: 60,
}

function baseAttendance(overrides: Partial<LiveOccurrenceAttendance> = {}) {
  return {
    id: 'la-1',
    occurrenceId: 'live-1',
    userId: 'u-1',
    attendedAt: '2026-04-14T16:00:00.000Z',
    source: 'live_auto' as const,
    watchedSeconds: 3240,
    lastActiveAt: '2026-04-14T15:58:30.000Z',
    ...overrides,
  }
}

describe('liveAttendance qualification', () => {
  it('qualifies when watch threshold and end-window activity are met', () => {
    const result = evaluateLiveAttendanceQualification(occurrence, baseAttendance())
    expect(result.qualified).toBe(true)
    expect(result.reason).toBe('watch_threshold_and_end_presence')
    expect(result.requiredWatchSeconds).toBe(getLiveAttendanceRequiredWatchSeconds(occurrence.expectedMinutes))
  })

  it('fails when watched seconds are below threshold', () => {
    const result = evaluateLiveAttendanceQualification(
      occurrence,
      baseAttendance({ watchedSeconds: getLiveAttendanceRequiredWatchSeconds(60) - 1 }),
    )
    expect(result.qualified).toBe(false)
    expect(result.reason).toBe('watch_below_threshold')
  })

  it('fails when learner is not active within final five minutes', () => {
    const result = evaluateLiveAttendanceQualification(
      occurrence,
      baseAttendance({ lastActiveAt: '2026-04-14T15:54:59.000Z' }),
    )
    expect(result.qualified).toBe(false)
    expect(result.reason).toBe('not_active_near_end')
  })

  it('clamps heartbeat deltas to prevent over-counting', () => {
    expect(clampLiveAttendanceHeartbeatDeltaSeconds(-3)).toBe(0)
    expect(clampLiveAttendanceHeartbeatDeltaSeconds(9.7)).toBe(10)
    expect(clampLiveAttendanceHeartbeatDeltaSeconds(999)).toBe(20)
  })
})

describe('completion idempotency helper', () => {
  it('detects existing course completion for user', () => {
    const completions: Completion[] = [
      {
        id: 'comp-1',
        userId: 'u-1',
        courseId: 'course-1',
        completionDate: '2026-04-14T16:00:00.000Z',
        cpdHours: 1,
        quizAttemptId: 'qa-1',
        certificateId: 'cert-1',
        courseVersion: 2,
      },
    ]
    expect(hasCompletionForCourse(completions, 'u-1', 'course-1')).toBe(true)
    expect(hasCompletionForCourse(completions, 'u-2', 'course-1')).toBe(false)
  })
})
