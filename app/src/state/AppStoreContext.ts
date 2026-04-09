import { createContext } from 'react'
import type {
  AppState,
  Course,
  CourseLevel,
  CourseSegment,
  CoursesSyncStatus,
  CourseStatus,
  CourseTopic,
  Enrollment,
  Invite,
  QuizQuestion,
  QuizAttempt,
  User,
  UserRole,
} from '../types'
import type { evaluateCompletion } from '../lib/courseLogic'

interface ActionResult {
  ok: boolean
  message?: string
}

export interface CreateCourseInput {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  instructorId?: string
  segments: Array<Pick<CourseSegment, 'title' | 'durationMinutes'>>
  quiz?: QuizQuestion[]
}

export interface UpdateCourseInput {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  instructorId?: string
}

export interface AppStoreContextValue extends AppState {
  state: AppState
  currentUserId: string
  currentUser: User | null
  currentUserRole: UserRole | null
  setCurrentUser: (userId: string) => void
  issueInvite: (email: string, role: UserRole) => Invite
  inviteUser: (email: string, fullName: string, role: UserRole) => Invite
  acceptInvite: (code: string) => { ok: true; user: User } | { ok: false; error: string }
  suspendUser: (userId: string, suspended?: boolean) => void
  enrollInCourse: (courseId: string) => ActionResult
  markSegmentWatched: (courseId: string, segmentId: string) => ActionResult
  submitQuizAttempt: (courseId: string, answers: Record<string, string>) => QuizAttempt | null
  createCourse: (input: CreateCourseInput) => { ok: true; course: Course } | { ok: false; message: string }
  addCourseSegment: (
    courseId: string,
    segment: Pick<CourseSegment, 'title' | 'durationMinutes'>,
  ) => ActionResult
  updateCourseDetails: (courseId: string, input: UpdateCourseInput) => ActionResult
  transitionCourseStatus: (courseId: string, nextStatus: CourseStatus) => ActionResult
  updateCourseSegmentMux: (
    courseId: string,
    segmentId: string,
    mux: Partial<
      Pick<
        CourseSegment,
        | 'muxUploadId'
        | 'muxAssetId'
        | 'muxPlaybackId'
        | 'muxStatus'
        | 'muxErrorMessage'
        | 'transcriptText'
        | 'transcriptStatus'
        | 'transcriptErrorMessage'
      >
    >,
  ) => void
  toggleWebinarAttendance: (webinarId: string) => void
  getCourseReadiness: (courseId: string, userId?: string) => ReturnType<typeof evaluateCompletion>
  getActiveEnrollment: (userId: string, courseId: string) => Enrollment | null
  transcriptForCurrentUser: AppState['transcript']
  coursesSyncStatus: CoursesSyncStatus
  coursesSyncMessage: string | null
  clearCoursesSyncMessage: () => void
}

export const AppStoreContext = createContext<AppStoreContextValue | undefined>(undefined)
