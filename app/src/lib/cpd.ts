import { CPD_QUARTER_HOUR_INCREMENT } from '../constants'
import type { Course, TranscriptEntry } from '../types'
import { getCpdProviderName } from './appSettings'

type CourseLikeForCpd = {
  videoMinutes: number
  cpdHoursOverride?: number | null
}

export const calculateCPDHours = (videoMinutes: number): number => {
  if (!Number.isFinite(videoMinutes) || videoMinutes <= 0) {
    return 0
  }

  const rawHours = videoMinutes / 60
  const quarterUnits = Math.round(rawHours / CPD_QUARTER_HOUR_INCREMENT)

  return quarterUnits * CPD_QUARTER_HOUR_INCREMENT
}

export const calculateCpdHours = calculateCPDHours

export const getCourseCPDHours = (course: CourseLikeForCpd): number =>
  course.cpdHoursOverride ?? calculateCPDHours(course.videoMinutes)

export function formatCpdHours(hours: number): string {
  return `${hours.toFixed(2)} CPD hours`
}

/**
 * Provider shown on transcript, CSV export, and PDF certificates. Prefers the
 * current course document (`cpdProviderName` from catalog) so re-downloads stay
 * aligned with Supabase after provider updates, then the stored transcript row.
 */
export function resolveCpdProviderForTranscriptEntry(
  entry: TranscriptEntry,
  courses: readonly Course[],
): string {
  const course = courses.find((c) => c.id === entry.courseId)
  const fromCourse = course?.cpdProviderName?.trim()
  if (fromCourse) return fromCourse
  const fromEntry = entry.providerName?.trim()
  if (fromEntry) return fromEntry
  return getCpdProviderName()
}
