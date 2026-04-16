export type CoursesSyncStatus = 'local_only' | 'loading' | 'synced' | 'error'

export type UserRole =
  | 'learner'
  | 'instructor'
  | 'content_admin'
  | 'hr_admin'
  | 'super_admin'

/** Treewalk-address users vs external learners (see Clerk + email domain config). */
export type UserAccessScope = 'internal' | 'external'

export type UserStatus = 'active' | 'suspended'
export type InviteStatus = 'pending' | 'accepted' | 'revoked'
export type CourseStatus = 'draft' | 'review' | 'published'
/** Who the course is intended for: firm-only vs open to all learners. */
export type CourseAudience = 'internal' | 'everyone'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type CourseTopic =
  | 'Ethics'
  | 'Tax'
  | 'Audit'
  | 'Financial Reporting'
  | 'Technology'
  | 'Leadership'
  | 'Advisory'

/** Runtime values for forms and AI allow-lists; keep synced with mux Edge defaults. */
export const COURSE_TOPIC_VALUES = [
  'Ethics',
  'Tax',
  'Audit',
  'Financial Reporting',
  'Technology',
  'Leadership',
  'Advisory',
] as const satisfies readonly CourseTopic[]

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
  accessScope: UserAccessScope
  status: UserStatus
  invitedAt: string
  joinedAt: string
}

export interface Invite {
  id: string
  email: string
  role: UserRole
  code: string
  status: InviteStatus
  createdByUserId: string
  createdAt: string
  acceptedAt?: string
  emailDeliveryStatus?: 'pending' | 'sent' | 'failed'
  emailSentAt?: string
  emailDeliveryError?: string
}

export type MuxVideoStatus = 'idle' | 'uploading' | 'processing' | 'ready' | 'error'
export type VideoTranscriptStatus = 'idle' | 'processing' | 'ready' | 'error'

export interface SegmentTranscriptCue {
  startSeconds?: number
  endSeconds?: number
  text: string
}

export interface SegmentTranscriptData {
  sourceText: string
  plainText: string
  segments: SegmentTranscriptCue[]
  downloadVersion: number
}

export interface QuizOption {
  id: string
  label: string
  isCorrect: boolean
}

export type QuizDifficulty = 'easy' | 'medium' | 'hard'

export interface QuizQuestion {
  id: string
  prompt: string
  options: QuizOption[]
  explanation?: string
  difficulty?: QuizDifficulty
}

export interface QuizPolicy {
  passThreshold: number
  shownQuestionCount: number
  generatedQuestionCount: number
  minutesBasis: number
  generatedAt: string
  sourceModel?: string
}

export type CoursePackageRuntimeMode = 'single_sco' | 'multi_sco'
export type CoursePackageMediaDelivery = 'stream' | 'packaged_file'

/**
 * Export-facing metadata for future SCORM/package generation.
 * This remains authored content metadata and should not include learner runtime evidence.
 */
export interface CoursePackageProfile {
  schemaVersion: number
  locale: string
  runtimeMode: CoursePackageRuntimeMode
  mediaDelivery: CoursePackageMediaDelivery
  manifestIdentifier?: string
}

export interface CoursePackageActivity {
  id: string
  title: string
  type: 'video_assessment' | 'resource'
  required: boolean
}

export interface VideoWatchProgress {
  durationSeconds: number
  watchedSeconds: number
  furthestSecond: number
  lastPositionSecond: number
  completed: boolean
  pausedCount: number
  resumedCount: number
  seekViolations: number
  lastUpdatedAt?: string
}

export interface Course {
  id: string
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  audience: CourseAudience
  instructorId: string
  status: CourseStatus
  videoMinutes: number
  /** Set after a successful direct video upload + processing. */
  muxUploadId?: string
  muxAssetId?: string
  muxPlaybackId?: string
  muxStatus?: MuxVideoStatus
  muxErrorMessage?: string
  transcript?: SegmentTranscriptData
  transcriptText?: string
  transcriptStatus?: VideoTranscriptStatus
  transcriptErrorMessage?: string
  packageProfile?: CoursePackageProfile
  activityOutline?: CoursePackageActivity[]
  cpdHoursOverride?: number | null
  /**
   * CPD / certificate provider for this course when set (e.g. legal entity).
   * Persisted in `academy_courses.data`; falls back to app `cpdProviderName` when absent.
   */
  cpdProviderName?: string | null
  version: number
  createdAt: string
  updatedAt: string
  publishedAt?: string
  quiz: QuizQuestion[]
  quizPolicy?: QuizPolicy
}

export interface QuizAttempt {
  id: string
  userId: string
  courseId: string
  answers: Record<string, string>
  scorePercent: number
  passed: boolean
  submittedAt: string
  attemptNumber: number
  passThreshold: number
  renderedQuestions: QuizQuestion[]
  generatedQuestionCount: number
  shownQuestionCount: number
}

export interface Enrollment {
  id: string
  userId: string
  courseId: string
  enrolledAt: string
  completedAt?: string
  certificateId?: string
  watchedMinutes: number
  videoProgress?: VideoWatchProgress
  quizAttempts: QuizAttempt[]
}

export interface Progress {
  userId: string
  courseId: string
  watchedMinutes: number
  lastWatchedAt?: string
}

export interface Certificate {
  id: string
  userId: string
  courseId: string
  verificationCode: string
  issuedAt: string
  providerName: string
  courseTitle: string
  durationHours: number
  completionDate: string
  quizAttemptId: string
  passThreshold: number
  awardMethod?: 'quiz_completion' | 'live_attendance'
}

export interface Completion {
  id: string
  userId: string
  courseId: string
  completionDate: string
  cpdHours: number
  quizAttemptId: string
  certificateId: string
  courseVersion: number
  awardMethod?: 'quiz_completion' | 'live_attendance'
}

export interface CpdLedgerEntry {
  id: string
  userId: string
  courseId: string
  completionId: string
  hoursAwarded: number
  createdAt: string
}

export type LiveOccurrenceStatus = 'scheduled' | 'live' | 'ended'
export type LiveOccurrenceConversionStatus =
  | 'scheduled'
  | 'live'
  | 'ended'
  | 'asset_ready'
  | 'draft_created'
  | 'failed'

export interface LiveOccurrence {
  id: string
  title: string
  description: string
  startAt: string
  expectedMinutes: number
  status: LiveOccurrenceStatus
  conversionStatus: LiveOccurrenceConversionStatus
  audience: CourseAudience
  createdByUserId: string
  presenterUserIds: string[]
  attendeeIds: string[]
  muxLiveStreamId?: string
  muxPlaybackId?: string
  muxStreamKey?: string
  muxAssetId?: string
  resultingCourseId?: string | null
  muxErrorMessage?: string
}

export interface LiveOccurrenceAttendance {
  id: string
  occurrenceId: string
  userId: string
  attendedAt: string
  source: 'live_auto' | 'live_manual' | 'replay'
  joinedAt?: string
  lastActiveAt?: string
  watchedSeconds?: number
  qualified?: boolean
  qualifiedAt?: string
  qualificationReason?:
    | 'watch_threshold_and_end_presence'
    | 'watch_below_threshold'
    | 'not_active_near_end'
    | 'not_ended'
    | 'manual_marked'
}

export type LiveChatMessageKind = 'question' | 'chat'
export type LiveChatClassificationSource = 'auto' | 'user_override'
export type LiveChatConnectionStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface LiveChatMessage {
  id: string
  occurrenceId: string
  userId: string
  userNameSnapshot: string
  body: string
  messageKind: LiveChatMessageKind
  classificationSource: LiveChatClassificationSource
  questionScore: number
  isDeleted: boolean
  createdAt: string
  updatedAt: string
}

export interface LiveRehearsalStream {
  id: string
  title: string
  guidance: string
  muxLiveStreamId?: string
  muxPlaybackId?: string
  muxStreamKey?: string
  updatedAt: string
}

export interface AuditEvent {
  id: string
  actorUserId: string
  action: string
  targetType: string
  targetId: string
  createdAt: string
  metadata?: Record<string, string | number | boolean>
}

export interface CompletionStatus {
  isComplete: boolean
  watchedPercent: number
  quizPassed: boolean
  latestScore: number
}

export interface CourseReadiness {
  completed: boolean
  watchedPercent: number
  quizPassed: boolean
  latestScore: number
}

export interface CourseProgressSummary {
  watchedPercent: number
  watchedMinutes: number
  totalMinutes: number
}

export interface WeeklyEngagementSummary {
  activeUsers: string[]
  activeCourses: string[]
}

export interface TranscriptEntry {
  id: string
  userId: string
  courseId: string
  courseTitle: string
  completedAt: string
  cpdHours: number
  certificateId: string
  verificationCode: string
  providerName: string
  quizAttemptId: string
  passThreshold: number
  activityWatchedMinutes: number
  awardMethod?: 'quiz_completion' | 'live_attendance'
}

export interface LearningActivityEvent {
  id: string
  userId: string
  courseId: string
  type: 'heartbeat' | 'pause' | 'resume' | 'seek_violation' | 'video_complete'
  at: string
  positionSecond: number
  watchedSeconds: number
}

/** Persisted with learner runtime so invite / pre-Clerk ids can be remapped after Clerk sign-in. */
export interface LearnerProfileStub {
  userId: string
  email: string
}

export interface AppState {
  users: User[]
  invites: Invite[]
  courses: Course[]
  /**
   * Course IDs removed from the shared catalog by an author (persisted with learner runtime).
   * Prevents seed/mock courses from reappearing after a successful DB delete.
   */
  removedCatalogCourseIds: string[]
  /** Maps academy user ids to email for Clerk migration (not all users stay in `users` after reload). */
  learnerProfiles: LearnerProfileStub[]
  enrollments: Enrollment[]
  progress: Record<string, Progress>
  completions: Completion[]
  certificates: Certificate[]
  cpdLedger: CpdLedgerEntry[]
  liveOccurrences: LiveOccurrence[]
  liveOccurrenceAttendances: LiveOccurrenceAttendance[]
  liveRehearsal: LiveRehearsalStream | null
  auditEvents: AuditEvent[]
  transcript: TranscriptEntry[]
  learningActivityLog: LearningActivityEvent[]
}
