import { describe, expect, it } from 'vitest'
import {
  calculateCourseProgress,
  canMarkSegmentWatched,
  evaluateCompletion,
  scoreQuizAttempt,
} from './courseLogic'
import type { Course, Enrollment } from '../types'

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
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  segments: [
    { id: 's1', title: 's1', durationMinutes: 20, order: 1 },
    { id: 's2', title: 's2', durationMinutes: 20, order: 2 },
    { id: 's3', title: 's3', durationMinutes: 20, order: 3 },
  ],
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
  watchedSegmentIds: [],
  watchedMinutes: 0,
  quizAttempts: [],
  ...overrides,
})

describe('course progress and completion', () => {
  it('calculates percentage correctly from segment counts', () => {
    expect(calculateCourseProgress(0, 3)).toBe(0)
    expect(calculateCourseProgress(1, 3)).toBe(33)
    expect(calculateCourseProgress(2, 3)).toBe(67)
    expect(calculateCourseProgress(3, 3)).toBe(100)
  })

  it('does not complete course at 99% watched', () => {
    const enrollment = makeEnrollment({
      watchedSegmentIds: ['s1', 's2'],
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
        },
      ],
    })
    const result = evaluateCompletion(baseCourse, enrollment)
    expect(result.completed).toBe(false)
    expect(result.watchedPercent).toBe(67)
  })

  it('keeps latest passing attempt as active', () => {
    const enrollment = makeEnrollment({
      watchedSegmentIds: ['s1', 's2', 's3'],
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
        },
      ],
    })
    const result = evaluateCompletion(baseCourse, enrollment)
    expect(result.completed).toBe(true)
    expect(result.latestScore).toBe(100)
  })
})

describe('quiz and no-skip enforcement', () => {
  it('scores quiz attempts as percentages', () => {
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'a', q2: 'b' })).toBe(100)
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'a', q2: 'a' })).toBe(50)
    expect(scoreQuizAttempt(baseCourse.quiz, { q1: 'b', q2: 'a' })).toBe(0)
  })

  it('prevents skipping ahead of next segment', () => {
    const blocked = canMarkSegmentWatched(baseCourse, ['s1'], 's3')
    expect(blocked.allowed).toBe(false)

    const allowed = canMarkSegmentWatched(baseCourse, ['s1'], 's2')
    expect(allowed.allowed).toBe(true)
  })
})
