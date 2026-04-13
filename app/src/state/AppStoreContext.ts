import { createContext } from 'react'
import type {
  AppState,
  Course,
  CourseLevel,
  CoursesSyncStatus,
  CourseStatus,
  CourseTopic,
  Enrollment,
  Invite,
  QuizPolicy,
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

export interface VideoPlaybackUpdateInput {
  positionSecond: number
  durationSeconds: number
  watchedDeltaSeconds: number
  isPlaying: boolean
  paused?: boolean
  resumed?: boolean
  seekViolation?: boolean
  completed?: boolean
}

export type VideoUploadProgress = {
  loaded: number
  total: number
  startedAt: number
}

export type VideoTranscriptionProgress = {
  phase: 'extracting_audio' | 'transcribing'
  extractRatio: number | null
}

export type VideoProcessingProgress = {
  upload?: VideoUploadProgress
  transcription?: VideoTranscriptionProgress
}

export interface CreateCourseInput {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  instructorId?: string
  videoMinutes?: number
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
  markVideoWatched: (courseId: string) => ActionResult
  recordVideoPlayback: (courseId: string, update: VideoPlaybackUpdateInput) => ActionResult
  submitQuizAttempt: (
    courseId: string,
    renderedQuestions: QuizQuestion[],
    answers: Record<string, string>,
  ) => QuizAttempt | null
  updateCourseQuiz: (
    courseId: string,
    questionBank: QuizQuestion[],
    policy: QuizPolicy,
  ) => ActionResult
  deleteCourseQuizQuestion: (courseId: string, questionId: string) => ActionResult
  createCourse: (input: CreateCourseInput) => { ok: true; course: Course } | { ok: false; message: string }
  updateCourseDetails: (courseId: string, input: UpdateCourseInput) => ActionResult
  deleteDraftCourse: (courseId: string) => Promise<ActionResult>
  transitionCourseStatus: (courseId: string, nextStatus: CourseStatus) => ActionResult
  updateCourseVideo: (
    courseId: string,
    mux: Partial<
      Pick<
        Course,
        | 'muxUploadId'
        | 'muxAssetId'
        | 'muxPlaybackId'
        | 'muxStatus'
        | 'muxErrorMessage'
        | 'transcript'
        | 'transcriptText'
        | 'transcriptStatus'
        | 'transcriptErrorMessage'
        | 'videoMinutes'
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
  videoProcessingProgress: Record<string, VideoProcessingProgress>
  setVideoUploadProgress: (
    courseId: string,
    progress: VideoUploadProgress | null,
  ) => void
  setVideoTranscriptionProgress: (
    courseId: string,
    progress: VideoTranscriptionProgress | null,
  ) => void
  clearVideoProcessingProgress: (courseId: string) => void
}

export const AppStoreContext = createContext<AppStoreContextValue | undefined>(undefined)
