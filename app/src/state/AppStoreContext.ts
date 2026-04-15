import { createContext } from 'react'
import type {
  AppState,
  Course,
  CourseAudience,
  CourseLevel,
  CoursesSyncStatus,
  LiveOccurrence,
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
  audience?: CourseAudience
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
  audience: CourseAudience
  instructorId?: string
}

export interface CreateLiveOccurrenceInput {
  title: string
  description: string
  startAt: string
  expectedMinutes: number
  audience: CourseAudience
  presenterUserIds?: string[]
}

export interface AppStoreContextValue extends AppState {
  state: AppState
  currentUserId: string
  currentUser: User | null
  currentUserRole: UserRole | null
  setCurrentUser: (userId: string) => void
  /** Replaces or clears the signed-in user (Clerk → academy profile). Passing null signs out locally. */
  syncAuthUser: (user: User | null) => void
  issueInvite: (email: string, role: UserRole) => Invite
  inviteUser: (email: string, fullName: string, role: UserRole) => Invite
  sendInviteEmail: (
    inviteId: string,
    options?: { clerkSessionToken?: string | null; signUpUrl?: string | null; invite?: Invite },
  ) => Promise<ActionResult>
  /** Removes a pending invite so its code can no longer be used. */
  deletePendingInvite: (inviteId: string) => void
  acceptInvite: (code: string) => { ok: true; user: User } | { ok: false; error: string }
  suspendUser: (userId: string, suspended?: boolean) => void
  /** Removes the user from the local roster and clears their learner runtime in this workspace (demo / app state). */
  deleteUser: (userId: string) => void
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
  deleteDraftCourse: (
    courseId: string,
    options?: { clerkSessionToken?: string | null },
  ) => Promise<ActionResult>
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
  createLiveOccurrence: (
    input: CreateLiveOccurrenceInput,
  ) => Promise<{ ok: true; occurrence: LiveOccurrence } | { ok: false; message: string }>
  syncLiveOccurrenceStatus: (occurrenceId: string) => Promise<ActionResult>
  provisionLiveRehearsalStream: () => Promise<ActionResult>
  markLiveOccurrenceAttendance: (occurrenceId: string, source?: 'live_manual' | 'replay') => void
  startLiveOccurrenceWatch: (occurrenceId: string) => void
  heartbeatLiveOccurrenceWatch: (occurrenceId: string, deltaSeconds: number) => void
  stopLiveOccurrenceWatch: (occurrenceId: string) => void
  finalizeLiveOccurrenceAttendance: (occurrenceId: string) => void
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
