export type CoursesSyncStatus = 'local_only' | 'loading' | 'synced' | 'error'

export type UserRole =
  | 'learner'
  | 'instructor'
  | 'content_admin'
  | 'hr_admin'
  | 'super_admin'

export type UserStatus = 'active' | 'suspended'
export type InviteStatus = 'pending' | 'accepted' | 'revoked'
export type CourseStatus = 'draft' | 'review' | 'published'
export type CourseLevel = 'beginner' | 'intermediate' | 'advanced'
export type CourseTopic =
  | 'Ethics'
  | 'Tax'
  | 'Audit'
  | 'Financial Reporting'
  | 'Technology'
  | 'Leadership'
  | 'Advisory'

export interface User {
  id: string
  name: string
  email: string
  role: UserRole
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
  cpdHoursOverride?: number | null
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
}

export interface CpdLedgerEntry {
  id: string
  userId: string
  courseId: string
  completionId: string
  hoursAwarded: number
  createdAt: string
}

export interface Webinar {
  id: string
  title: string
  description: string
  startAt: string
  teamsJoinUrl: string
  status: 'upcoming' | 'completed'
  convertedCourseId?: string | null
  provider: 'Microsoft Teams'
  externalEventId: string
  attendeeIds: string[]
}

export interface WebinarAttendance {
  id: string
  webinarId: string
  userId: string
  attendedAt: string
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

export interface AppState {
  users: User[]
  invites: Invite[]
  courses: Course[]
  enrollments: Enrollment[]
  progress: Record<string, Progress>
  completions: Completion[]
  certificates: Certificate[]
  cpdLedger: CpdLedgerEntry[]
  webinars: Webinar[]
  webinarAttendances: WebinarAttendance[]
  auditEvents: AuditEvent[]
  transcript: TranscriptEntry[]
  learningActivityLog: LearningActivityEvent[]
}
