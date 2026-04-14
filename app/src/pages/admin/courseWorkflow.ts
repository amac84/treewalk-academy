import { useMemo } from 'react'
import { COURSE_STATUS_LABELS } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { getCourseCPDHours } from '../../lib/cpd'
import {
  COURSE_TOPIC_VALUES,
  type Course,
  type CourseAudience,
  type CourseLevel,
  type CourseStatus,
  type CourseTopic,
  type UserRole,
} from '../../types'

export const ORDERED_STATUSES: CourseStatus[] = ['draft', 'review', 'published']

export const COURSE_TOPICS: CourseTopic[] = [...COURSE_TOPIC_VALUES]

export const COURSE_LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']
export const COURSE_AUDIENCES: CourseAudience[] = ['everyone', 'internal']
export const AUTHOR_ROLES: UserRole[] = ['instructor', 'content_admin', 'super_admin']

export type CourseDetailsDraft = {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  audience: CourseAudience
  instructorId: string
}

/** Default draft fields from a course row (matches admin form shape). */
export function courseDetailsDraftFromCourse(course: {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  audience: CourseAudience
  instructorId: string
}): CourseDetailsDraft {
  return {
    title: course.title,
    summary: course.summary,
    description: course.description,
    category: course.category,
    topic: course.topic,
    level: course.level,
    audience: course.audience,
    instructorId: course.instructorId,
  }
}

/** Same required fields as `updateCourseDetails` after trim. */
export function isCourseDetailsSaveable(draft: CourseDetailsDraft): boolean {
  return (
    draft.title.trim() !== '' &&
    draft.summary.trim() !== '' &&
    draft.description.trim() !== '' &&
    draft.category.trim() !== ''
  )
}

export function courseDetailsDraftDirty(
  draft: CourseDetailsDraft,
  course: Pick<
    Course,
    | 'title'
    | 'summary'
    | 'description'
    | 'category'
    | 'topic'
    | 'level'
    | 'audience'
    | 'instructorId'
  >,
  canAssignInstructor: boolean,
): boolean {
  if (draft.title.trim() !== course.title.trim()) return true
  if (draft.summary.trim() !== course.summary.trim()) return true
  if (draft.description.trim() !== course.description.trim()) return true
  if (draft.category.trim() !== course.category.trim()) return true
  if (draft.topic !== course.topic) return true
  if (draft.level !== course.level) return true
  if (draft.audience !== course.audience) return true
  if (canAssignInstructor && draft.instructorId !== course.instructorId) return true
  return false
}

export function useCourseWorkflowScope() {
  const store = useAppStore()
  const editableCourses = useMemo(() => {
    return store.courses.filter((course) => {
      if (store.currentUserRole === 'super_admin' || store.currentUserRole === 'content_admin') {
        return true
      }
      if (store.currentUserRole === 'instructor') {
        return course.instructorId === store.currentUserId
      }
      return false
    })
  }, [store.courses, store.currentUserRole, store.currentUserId])

  const instructorOptions = useMemo(
    () => store.users.filter((user) => AUTHOR_ROLES.includes(user.role)),
    [store.users],
  )

  const canCreateCourse = AUTHOR_ROLES.includes(store.currentUserRole ?? 'learner')
  const canAssignInstructor = store.currentUserRole === 'content_admin' || store.currentUserRole === 'super_admin'

  return {
    store,
    editableCourses,
    instructorOptions,
    canCreateCourse,
    canAssignInstructor,
  }
}

export function getCourseHours(course: Pick<Course, 'videoMinutes' | 'cpdHoursOverride'>) {
  return getCourseCPDHours(course)
}

export { COURSE_STATUS_LABELS }
