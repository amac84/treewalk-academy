import type { Course, CourseAudience, User, UserAccessScope } from '../types'

export function learnerCanAccessCourseAudience(
  accessScope: UserAccessScope,
  audience: CourseAudience,
): boolean {
  if (audience === 'everyone') return true
  return accessScope === 'internal'
}

export function learnerCanAccessCourse(user: User, course: Course): boolean {
  return learnerCanAccessCourseAudience(user.accessScope, course.audience)
}
