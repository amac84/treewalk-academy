import { REQUIRED_PASSING_SCORE, WATCH_PROGRESS_COMPLETE } from '../constants'
import type {
  Course,
  Enrollment,
  QuizAttempt,
  WeeklyEngagementSummary,
} from '../types'

export interface CompletionEvaluation {
  watchedPercent: number
  quizPassed: boolean
  latestScore: number
  latestPassedAttemptId?: string
  completed: boolean
}

export function calculateCourseProgress(
  watchedSegmentCount: number,
  totalSegmentCount: number,
): number {
  if (totalSegmentCount <= 0) return 0
  return Math.max(
    0,
    Math.min(
      WATCH_PROGRESS_COMPLETE,
      Math.round((watchedSegmentCount / totalSegmentCount) * WATCH_PROGRESS_COMPLETE),
    ),
  )
}

export function getWatchedPercentFromEnrollment(
  course: Course,
  enrollment: Pick<Enrollment, 'watchedSegmentIds'>,
): number {
  return calculateCourseProgress(
    enrollment.watchedSegmentIds.length,
    course.segments.length,
  )
}

export function getLatestAttempt(attempts: QuizAttempt[]): QuizAttempt | undefined {
  return attempts
    .slice()
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0]
}

export function getLatestPassedAttempt(
  attempts: QuizAttempt[],
  passScore = REQUIRED_PASSING_SCORE,
): QuizAttempt | undefined {
  return attempts
    .filter((attempt) => attempt.scorePercent >= passScore)
    .sort((a, b) => Date.parse(b.submittedAt) - Date.parse(a.submittedAt))[0]
}

export function evaluateCompletion(
  course: Course,
  enrollment: Pick<Enrollment, 'watchedSegmentIds' | 'quizAttempts'>,
): CompletionEvaluation {
  const watchedPercent = getWatchedPercentFromEnrollment(course, enrollment)
  const latestPassedAttempt = getLatestPassedAttempt(enrollment.quizAttempts)
  const latestScore = latestPassedAttempt?.scorePercent ?? 0
  const quizPassed = Boolean(latestPassedAttempt)
  const completed = watchedPercent >= WATCH_PROGRESS_COMPLETE && quizPassed

  return {
    watchedPercent,
    quizPassed,
    latestScore,
    latestPassedAttemptId: latestPassedAttempt?.id,
    completed,
  }
}

export function scoreQuizAttempt(
  quiz: Course['quiz'],
  answers: Record<string, string>,
): number {
  if (quiz.length === 0) return 0
  const correctCount = quiz.reduce((count, question) => {
    const picked = answers[question.id]
    const correct = question.options.find((option) => option.isCorrect)
    return picked && correct && picked === correct.id ? count + 1 : count
  }, 0)
  return Math.round((correctCount / quiz.length) * 100)
}

export function canMarkSegmentWatched(
  course: Course,
  watchedSegmentIds: string[],
  segmentId: string,
): { allowed: boolean; message?: string } {
  const segment = course.segments.find((item) => item.id === segmentId)
  if (!segment) return { allowed: false, message: 'Segment not found.' }
  const highestWatchedOrder = course.segments
    .filter((item) => watchedSegmentIds.includes(item.id))
    .reduce((max, item) => Math.max(max, item.order), 0)

  if (segment.order > highestWatchedOrder + 1) {
    return {
      allowed: false,
      message:
        'No skipping allowed. Complete earlier segments before jumping ahead.',
    }
  }
  return { allowed: true }
}

export function toDateLabel(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export function calculateWeeklyEngagementSummary(
  enrollments: Enrollment[],
): WeeklyEngagementSummary {
  const activeUsers = [...new Set(enrollments.map((item) => item.userId))]
  const activeCourses = [...new Set(enrollments.map((item) => item.courseId))]
  return { activeUsers, activeCourses }
}
