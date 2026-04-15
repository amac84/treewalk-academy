import {
  LIVE_ATTENDANCE_END_WINDOW_MINUTES,
  LIVE_ATTENDANCE_HEARTBEAT_MAX_DELTA_SECONDS,
  LIVE_ATTENDANCE_REQUIRED_WATCH_RATIO,
} from '../constants'
import type { Completion, LiveOccurrence, LiveOccurrenceAttendance } from '../types'

export type LiveAttendanceQualificationReason =
  | 'watch_threshold_and_end_presence'
  | 'watch_below_threshold'
  | 'not_active_near_end'
  | 'not_ended'

export interface LiveAttendanceQualificationResult {
  qualified: boolean
  reason: LiveAttendanceQualificationReason
  requiredWatchSeconds: number
  watchedSeconds: number
  endAtIso: string
}

function safeDateMs(iso: string, fallbackMs: number): number {
  const ms = Date.parse(iso)
  return Number.isFinite(ms) ? ms : fallbackMs
}

export function getLiveAttendanceRequiredWatchSeconds(expectedMinutes: number): number {
  const expectedSeconds = Math.max(0, Math.round(expectedMinutes * 60))
  return Math.max(1, Math.round(expectedSeconds * LIVE_ATTENDANCE_REQUIRED_WATCH_RATIO))
}

export function getLiveOccurrenceEndAtIso(occurrence: Pick<LiveOccurrence, 'startAt' | 'expectedMinutes'>): string {
  const startMs = safeDateMs(occurrence.startAt, Date.now())
  const expectedMs = Math.max(0, Math.round(occurrence.expectedMinutes * 60 * 1000))
  return new Date(startMs + expectedMs).toISOString()
}

export function clampLiveAttendanceHeartbeatDeltaSeconds(rawDeltaSeconds: number): number {
  if (!Number.isFinite(rawDeltaSeconds) || rawDeltaSeconds <= 0) return 0
  return Math.min(LIVE_ATTENDANCE_HEARTBEAT_MAX_DELTA_SECONDS, Math.round(rawDeltaSeconds))
}

export function evaluateLiveAttendanceQualification(
  occurrence: Pick<LiveOccurrence, 'status' | 'startAt' | 'expectedMinutes'>,
  attendance: Pick<LiveOccurrenceAttendance, 'watchedSeconds' | 'lastActiveAt' | 'attendedAt'>,
): LiveAttendanceQualificationResult {
  const endAtIso = getLiveOccurrenceEndAtIso(occurrence)
  const watchedSeconds = Math.max(0, Math.round(attendance.watchedSeconds ?? 0))
  const requiredWatchSeconds = getLiveAttendanceRequiredWatchSeconds(occurrence.expectedMinutes)

  if (occurrence.status !== 'ended') {
    return {
      qualified: false,
      reason: 'not_ended',
      requiredWatchSeconds,
      watchedSeconds,
      endAtIso,
    }
  }

  if (watchedSeconds < requiredWatchSeconds) {
    return {
      qualified: false,
      reason: 'watch_below_threshold',
      requiredWatchSeconds,
      watchedSeconds,
      endAtIso,
    }
  }

  const endMs = safeDateMs(endAtIso, Date.now())
  const minActiveMs = endMs - LIVE_ATTENDANCE_END_WINDOW_MINUTES * 60 * 1000
  const activityIso = attendance.lastActiveAt ?? attendance.attendedAt
  const activityMs = activityIso ? Date.parse(activityIso) : Number.NaN
  if (!Number.isFinite(activityMs) || activityMs < minActiveMs) {
    return {
      qualified: false,
      reason: 'not_active_near_end',
      requiredWatchSeconds,
      watchedSeconds,
      endAtIso,
    }
  }

  return {
    qualified: true,
    reason: 'watch_threshold_and_end_presence',
    requiredWatchSeconds,
    watchedSeconds,
    endAtIso,
  }
}

export function hasCompletionForCourse(
  completions: Completion[],
  userId: string,
  courseId: string,
): boolean {
  return completions.some((completion) => completion.userId === userId && completion.courseId === courseId)
}
