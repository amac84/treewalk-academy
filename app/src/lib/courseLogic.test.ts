import { describe, expect, it } from 'vitest'
import {
  evaluateCompletion,
  getWatchedPercentFromEnrollment,
  scoreQuizAttempt,
} from './courseLogic'
import type { Course, Enrollment } from '../types'

/** Test fixture only — not the app demo seed in `data/mockData.ts`. */
const baseCourse: Course = {
  id: 'course-1',
  title: 'Test course',
  summary: 'summary',
  description: 'description',
  category: 'Ethics',
  topic: 'Ethics',
  level: 'beginner',
  instructorId: 'u-1',
  status: 'published',
  videoMinutes: 60,
  muxStatus: 'idle',
  transcriptStatus: 'idle',
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  quiz: [
    {
      id: 'q1',
      prompt: 'Question 1',
      options: [
        { id: 'a', label: 'A', isCorrect: true },
        { id: 'b', label: 'B', isCorrect: false },
      ],
    },
    {
      id: 'q2',
      prompt: 'Question 2',
      options: [
        { id: 'a', label: 'A', isCorrect: false },
        { id: 'b', label: 'B', isCorrect: true },
      ],
    },
  ],
}

const makeEnrollment = (overrides?: Partial<Enrollment>): Enrollment => ({
  id: 'enr-1',
  userId: 'u-learner',
  courseId: 'course-1',
  enrolledAt: '2026-01-02T00:00:00Z',
  watchedMinutes: 0,
  videoProgress: undefined,
  quizAttempts: [],
  ...overrides,
})

describe('course progress and completion', () => {
  it('derives watched percent from video progress when minutes are not set', () => {
    const watchedPercent = getWatchedPercentFromEnrollment(
      baseCourse,
      makeEnrollment({
        watchedMinutes: 0,
        videoProgress: {
          durationSeconds: 600,
          watchedSeconds: 300,
          furthestSecond: 300,
          lastPositionSecond: 300,
          completed: false,
          pausedCount: 0,
          resumedCount: 0,
          seekViolations: 0,
        },
      }),
    )
    expect(watchedPercent).toBe(50)
  })

  it('does not complete course at 99% watched', () => {
    const enrollment = makeEnrollment({
      watchedMinutes: 59,
      quizAttempts: [
        {
          id: 'qa-1',
          userId: 'u-learner',
          courseId: 'course-1',
          answers: { q1: 'a', q2: 'b' },
          scorePercent: 100,
          passed: true,
          submittedAt: '2026-01-02T10:00:00Z',
          attemptNumber: 1,
          passThreshold: 70,
          renderedQuestions: baseCourse.quiz,
          generatedQuestionCount: 20,
          shownQuestionCount: 2,
        },
      ],
    })
    const result = evaluateCompletion(baseCourse, enrollment)
    expect(result.completed).toBe(false)
    expect(result.watchedPercent).toBe(98)
  })

  it('keeps latest passing attempt as active', () => {
    const enrollment = makeEnrollment({
      watchedMinutes: 60,
      quizAttempts: [
        {
          id: 'qa-1',
          userId: 'u-learner',
          courseId: 'course-1',
          answers: { q1: 'a', q2: 'b' },
          scorePercent: 100,
          passed: true,
          submittedAt: '2026-01-02T10:00:00Z',
          attemptNumber: 1,
          passThreshold: 70,
          renderedQuestions: baseCourse.quiz,
          generatedQuestionCount: 20,
          shownQuestionCount: 2,
        },
        {
          id: 'qa-2',
          userId: 'u-learner',
          courseId: 'course-1',
          answers: { q1: 'b', q2: 'a' },
          scorePercent: 0,
          passed: false,
          submittedAt: '2026-01-02T11:00:00Z',
          attemptNumber: 2,
          passThreshold: 70,
          renderedQuestions: baseCourse.quiz,
          generatedQuestionCount: 20,
          shownQuestionCount: 2,
        },
      ],
    })
    const result = evaluateCompletion(baseCourse, enrollment)
    expect(result.completed).toBe(true)
    expect(result.latestScore).toBe(100)
  })
})

describe('quiz scoring', () => {
  it('scores quiz attempts as percentages', () => {
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'a', q2: 'b' })).toBe(100)
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'a', q2: 'a' })).toBe(50)
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'b', q2: 'a' })).toBe(0)
  })
})
