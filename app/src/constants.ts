import type { CourseAudience, CourseStatus } from './types'

export const REQUIRED_PASSING_SCORE = 70
export const PASS_SCORE_PERCENTAGE = REQUIRED_PASSING_SCORE
export const WATCH_PROGRESS_COMPLETE = 100
export const CPD_QUARTER_HOUR_INCREMENT = 0.25
export const RETENTION_WINDOW_YEARS = 3
export const QUIZ_MAX_SCORE = 100

export const COURSE_STATUS_LABELS: Record<CourseStatus, string> = {
  draft: 'Draft',
  review: 'In review',
  published: 'Published',
}

export const COURSE_AUDIENCE_LABELS: Record<CourseAudience, string> = {
  internal: 'Internal use',
  everyone: 'Everyone',
}
