import { describe, expect, it } from 'vitest'
import { learnerCanAccessCourse, learnerCanAccessCourseAudience } from './courseAccess'
import type { Course, User } from '../types'

const baseUser = (scope: User['accessScope']): User => ({
  id: 'u-1',
  name: 'Test',
  email: scope === 'internal' ? 'a@treewalk.test' : 'a@example.com',
  role: 'learner',
  accessScope: scope,
  status: 'active',
  invitedAt: '2026-01-01T00:00:00Z',
  joinedAt: '2026-01-01T00:00:00Z',
})

const baseCourse = (audience: Course['audience']): Course => ({
  id: 'c-1',
  title: 'T',
  summary: 's',
  description: 'd',
  category: 'General',
  topic: 'Technology',
  level: 'beginner',
  audience,
  instructorId: 'u-i',
  status: 'published',
  videoMinutes: 10,
  version: 1,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  quiz: [],
})

describe('courseAccess', () => {
  it('allows everyone courses for any scope', () => {
    expect(learnerCanAccessCourseAudience('external', 'everyone')).toBe(true)
    expect(learnerCanAccessCourseAudience('internal', 'everyone')).toBe(true)
  })

  it('restricts internal catalog rows to internal users', () => {
    expect(learnerCanAccessCourseAudience('external', 'internal')).toBe(false)
    expect(learnerCanAccessCourseAudience('internal', 'internal')).toBe(true)
  })

  it('combines user + course', () => {
    expect(learnerCanAccessCourse(baseUser('external'), baseCourse('internal'))).toBe(false)
    expect(learnerCanAccessCourse(baseUser('internal'), baseCourse('internal'))).toBe(true)
    expect(learnerCanAccessCourse(baseUser('external'), baseCourse('everyone'))).toBe(true)
  })
})
