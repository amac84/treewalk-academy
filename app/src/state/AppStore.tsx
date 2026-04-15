import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  LIVE_ATTENDANCE_HEARTBEAT_MAX_DELTA_SECONDS,
  LIVE_ATTENDANCE_REQUIRED_WATCH_RATIO,
} from '../constants'
import { getCpdProviderName } from '../lib/appSettings'
import { mockInitialState } from '../data/mockData'
import {
  deleteCourseFromSupabase,
  loadLearnerRuntimeStateFromSupabase,
  loadCoursesFromSupabase,
  persistLearnerRuntimeState,
  persistCourseToSupabase,
} from '../lib/coursePersistence'
import { getCourseCPDHours } from '../lib/cpd'
import {
  clampLiveAttendanceHeartbeatDeltaSeconds,
  evaluateLiveAttendanceQualification,
  hasCompletionForCourse,
} from '../lib/liveAttendance'
import { buildQuizPolicy, ensureQuizPolicy } from '../lib/quizPolicy'
import { learnerCanAccessCourse } from '../lib/courseAccess'
import { migrateLearnerRuntimeForClerkLogin, normalizeLearnerProfiles } from '../lib/clerkRuntimeMigration'
import { getClerkPublishableKey } from '../lib/clerkEnv'
import { isInviteFunctionConfigured, sendInviteEmailViaEdge } from '../lib/inviteEdge'
import {
  createMuxLiveStream,
  deleteMuxAsset,
  getMuxAsset,
  getMuxLiveStream,
  getOrCreateMuxRehearsalStream,
  isMuxFunctionConfigured,
  muxDurationSecondsToMinutes,
} from '../lib/muxEdge'
import { getSupabaseBrowserClient, hasSupabaseBrowserEnv } from '../lib/supabaseClient'
import { syncSupabaseSessionForAuthorRole } from '../lib/supabaseMuxSession'
import { accessScopeFromEmail } from '../lib/treewalkEmail'
import {
  evaluateCompletion,
  getWatchedPercentFromEnrollment,
  getLatestPassedAttempt,
  scoreQuizAttempt,
} from '../lib/courseLogic'
import type {
  AppState,
  Course,
  CourseAudience,
  CourseLevel,
  LiveOccurrence,
  CoursesSyncStatus,
  CourseStatus,
  CourseTopic,
  Enrollment,
  Invite,
  LearningActivityEvent,
  QuizPolicy,
  QuizQuestion,
  VideoWatchProgress,
  QuizAttempt,
  User,
  UserRole,
} from '../types'
import {
  AppStoreContext,
  type AppStoreContextValue,
  type CreateLiveOccurrenceInput,
  type CreateCourseInput,
  type VideoPlaybackUpdateInput,
  type VideoTranscriptionProgress,
  type VideoUploadProgress,
  type UpdateCourseInput,
} from './AppStoreContext'

interface ActionResult {
  ok: boolean
  message?: string
}

const createCode = () =>
  `INV-${Math.random().toString(36).slice(2, 8).toUpperCase()}`

const createId = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`

function sanitizeLiveDataForRuntime(state: AppState): Pick<AppState, 'liveOccurrences' | 'liveRehearsal'> {
  return {
    liveOccurrences: state.liveOccurrences.map((occurrence) => ({
      ...occurrence,
      muxStreamKey: undefined,
    })),
    liveRehearsal: state.liveRehearsal
      ? {
          ...state.liveRehearsal,
          muxStreamKey: undefined,
        }
      : null,
  }
}

const toRuntimeState = (state: AppState) => ({
  enrollments: state.enrollments,
  progress: state.progress,
  completions: state.completions,
  certificates: state.certificates,
  cpdLedger: state.cpdLedger,
  transcript: state.transcript,
  learningActivityLog: state.learningActivityLog,
  learnerProfiles: state.learnerProfiles,
  ...sanitizeLiveDataForRuntime(state),
  liveOccurrenceAttendances: state.liveOccurrenceAttendances,
  removedCatalogCourseIds: state.removedCatalogCourseIds,
})

function normalizeRemovedCatalogCourseIdsFromRuntime(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const item of raw) {
    if (typeof item === 'string' && item.trim()) out.add(item.trim())
  }
  return [...out]
}

function normalizeLiveOccurrencesFromRuntime(raw: unknown): AppState['liveOccurrences'] {
  if (!Array.isArray(raw)) return []
  const occurrences: LiveOccurrence[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const typed = entry as Record<string, unknown>
    const id = typeof typed.id === 'string' ? typed.id.trim() : ''
    const title = typeof typed.title === 'string' ? typed.title.trim() : ''
    if (!id || !title) continue
    const statusRaw = typeof typed.status === 'string' ? typed.status : ''
    const status: LiveOccurrence['status'] =
      statusRaw === 'live' || statusRaw === 'ended' ? statusRaw : 'scheduled'
    const conversionRaw = typeof typed.conversionStatus === 'string' ? typed.conversionStatus : ''
    const conversionStatus: LiveOccurrence['conversionStatus'] =
      conversionRaw === 'live'
        || conversionRaw === 'ended'
        || conversionRaw === 'asset_ready'
        || conversionRaw === 'draft_created'
        || conversionRaw === 'failed'
        ? conversionRaw
        : 'scheduled'
    const normalized: LiveOccurrence = {
      id,
      title,
      description: typeof typed.description === 'string' ? typed.description : '',
      startAt: typeof typed.startAt === 'string' ? typed.startAt : new Date().toISOString(),
      expectedMinutes:
        typeof typed.expectedMinutes === 'number' && Number.isFinite(typed.expectedMinutes)
          ? Math.max(1, Math.round(typed.expectedMinutes))
          : 60,
      status,
      conversionStatus,
      audience: typed.audience === 'internal' ? 'internal' : 'everyone',
      createdByUserId: typeof typed.createdByUserId === 'string' ? typed.createdByUserId : '',
      presenterUserIds: Array.isArray(typed.presenterUserIds)
        ? typed.presenterUserIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      attendeeIds: Array.isArray(typed.attendeeIds)
        ? typed.attendeeIds.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
        : [],
      ...(typeof typed.muxLiveStreamId === 'string' ? { muxLiveStreamId: typed.muxLiveStreamId } : {}),
      ...(typeof typed.muxPlaybackId === 'string' ? { muxPlaybackId: typed.muxPlaybackId } : {}),
      ...(typeof typed.muxAssetId === 'string' ? { muxAssetId: typed.muxAssetId } : {}),
      ...(typeof typed.resultingCourseId === 'string' || typed.resultingCourseId === null
        ? { resultingCourseId: typed.resultingCourseId as string | null }
        : {}),
      ...(typeof typed.muxErrorMessage === 'string' ? { muxErrorMessage: typed.muxErrorMessage } : {}),
    }
    occurrences.push(normalized)
  }
  return occurrences
}

function normalizeLiveOccurrenceAttendancesFromRuntime(raw: unknown): AppState['liveOccurrenceAttendances'] {
  if (!Array.isArray(raw)) return []
  const attendances: AppState['liveOccurrenceAttendances'] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const typed = entry as Record<string, unknown>
    const id = typeof typed.id === 'string' ? typed.id.trim() : ''
    const occurrenceId = typeof typed.occurrenceId === 'string' ? typed.occurrenceId.trim() : ''
    const userId = typeof typed.userId === 'string' ? typed.userId.trim() : ''
    if (!id || !occurrenceId || !userId) continue
    const sourceRaw = typeof typed.source === 'string' ? typed.source : ''
    const source: AppState['liveOccurrenceAttendances'][number]['source'] =
      sourceRaw === 'replay'
        ? 'replay'
        : sourceRaw === 'live_auto'
          ? 'live_auto'
          : sourceRaw === 'live_manual'
            ? 'live_manual'
            : 'live_manual'
    const attendedAt = typeof typed.attendedAt === 'string' ? typed.attendedAt : new Date().toISOString()
    const watchedSeconds =
      typeof typed.watchedSeconds === 'number' && Number.isFinite(typed.watchedSeconds)
        ? Math.max(0, Math.round(typed.watchedSeconds))
        : 0
    const qualified = typeof typed.qualified === 'boolean' ? typed.qualified : true
    const qualificationReasonRaw =
      typeof typed.qualificationReason === 'string' ? typed.qualificationReason : ''
    const qualificationReason =
      qualificationReasonRaw === 'watch_threshold_and_end_presence'
      || qualificationReasonRaw === 'watch_below_threshold'
      || qualificationReasonRaw === 'not_active_near_end'
      || qualificationReasonRaw === 'not_ended'
      || qualificationReasonRaw === 'manual_marked'
        ? qualificationReasonRaw
        : qualified
          ? 'manual_marked'
          : 'not_ended'
    attendances.push({
      id,
      occurrenceId,
      userId,
      attendedAt,
      source,
      joinedAt: typeof typed.joinedAt === 'string' ? typed.joinedAt : attendedAt,
      lastActiveAt: typeof typed.lastActiveAt === 'string' ? typed.lastActiveAt : attendedAt,
      watchedSeconds,
      qualified,
      qualifiedAt: typeof typed.qualifiedAt === 'string' ? typed.qualifiedAt : qualified ? attendedAt : undefined,
      qualificationReason,
    })
  }
  return attendances
}

function normalizeLiveRehearsalFromRuntime(raw: unknown): AppState['liveRehearsal'] {
  if (!raw || typeof raw !== 'object') return null
  const typed = raw as Record<string, unknown>
  const id = typeof typed.id === 'string' ? typed.id.trim() : ''
  const title = typeof typed.title === 'string' ? typed.title.trim() : ''
  if (!id || !title) return null
  return {
    id,
    title,
    guidance: typeof typed.guidance === 'string' ? typed.guidance : '',
    muxLiveStreamId: typeof typed.muxLiveStreamId === 'string' ? typed.muxLiveStreamId : undefined,
    muxPlaybackId: typeof typed.muxPlaybackId === 'string' ? typed.muxPlaybackId : undefined,
    updatedAt: typeof typed.updatedAt === 'string' ? typed.updatedAt : new Date().toISOString(),
  }
}

const createQuestionId = (courseId: string, index: number) => `${courseId}-q-${index + 1}`
const createQuestionOptionId = (questionIndex: number, optionIndex: number) =>
  `q${questionIndex + 1}-o${optionIndex + 1}`

const MAX_HEARTBEAT_DELTA_SECONDS = 12
const MAX_POSITION_ADVANCE_SECONDS = 20
const COURSE_PACKAGE_SCHEMA_VERSION = 1
const DEFAULT_EXPORT_LOCALE = 'en-US'

const ensureEnrollmentVideoProgress = (
  enrollment: Enrollment,
  durationSeconds: number,
): VideoWatchProgress => {
  const existing = enrollment.videoProgress
  if (existing) return existing
  return {
    durationSeconds,
    watchedSeconds: 0,
    furthestSecond: 0,
    lastPositionSecond: 0,
    completed: false,
    pausedCount: 0,
    resumedCount: 0,
    seekViolations: 0,
  }
}

/** Who may attach or replace hosted course video (matches AdminCoursesPage visibility). */
const canManageCourseMux = (role: UserRole | null, course: Course, userId: string): boolean => {
  if (!role) return false
  if (role === 'super_admin' || role === 'content_admin') return true
  if (role === 'instructor') return course.instructorId === userId
  return false
}

const canAuthorCourses = (role: UserRole | null): boolean =>
  role === 'instructor' || role === 'content_admin' || role === 'super_admin'

const canManageLiveEvents = (role: UserRole | null): boolean => canAuthorCourses(role)

const canConfigureRehearsal = (role: UserRole | null): boolean =>
  role === 'content_admin' || role === 'super_admin'

const normalizeCourseAudience = (value: unknown): CourseAudience =>
  value === 'internal' ? 'internal' : 'everyone'

const sanitizeCourseDetails = (input: UpdateCourseInput): Omit<UpdateCourseInput, 'instructorId'> & { instructorId?: string } => ({
  title: input.title.trim(),
  summary: input.summary.trim(),
  description: input.description.trim(),
  category: input.category.trim(),
  topic: input.topic as CourseTopic,
  level: input.level as CourseLevel,
  audience: normalizeCourseAudience(input.audience),
  instructorId: input.instructorId?.trim(),
})

const canTransitionCourseStatus = (
  role: UserRole | null,
  currentStatus: CourseStatus,
  nextStatus: CourseStatus,
  isOwner: boolean,
): boolean => {
  if (!role) return false
  if (role === 'super_admin') return true

  if (role === 'content_admin') {
    return (
      (currentStatus === 'draft' && nextStatus === 'review') ||
      (currentStatus === 'review' && nextStatus === 'published') ||
      (currentStatus === 'published' && nextStatus === 'review') ||
      (currentStatus === 'review' && nextStatus === 'draft')
    )
  }

  if (role === 'instructor' && isOwner) {
    return currentStatus === 'draft' && nextStatus === 'review'
  }

  return false
}

export const AppStoreProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<AppState>(mockInitialState)
  const [currentUserId, setCurrentUserId] = useState<string>(() =>
    getClerkPublishableKey() ? '' : 'u-learner-1',
  )
  const [videoProcessingProgress, setVideoProcessingProgress] = useState<
    AppStoreContextValue['videoProcessingProgress']
  >({})
  const [coursesSyncStatus, setCoursesSyncStatus] = useState<CoursesSyncStatus>(() =>
    getSupabaseBrowserClient() ? 'loading' : 'local_only',
  )
  const [coursesSyncMessage, setCoursesSyncMessage] = useState<string | null>(null)

  const clearCoursesSyncMessage = useCallback(() => setCoursesSyncMessage(null), [])

  const setVideoUploadProgress = useCallback(
    (courseId: string, progress: VideoUploadProgress | null) => {
      setVideoProcessingProgress((prev) => {
        const key = courseId
        const existing = prev[key]
        const next = {
          ...(existing ?? {}),
          ...(progress ? { upload: progress } : {}),
        }
        if (!progress) {
          delete next.upload
        }
        if (!next.upload && !next.transcription) {
          if (!(key in prev)) return prev
          const rest = { ...prev }
          delete rest[key]
          return rest
        }
        return { ...prev, [key]: next }
      })
    },
    [],
  )

  const setVideoTranscriptionProgress = useCallback(
    (courseId: string, progress: VideoTranscriptionProgress | null) => {
      setVideoProcessingProgress((prev) => {
        const key = courseId
        const existing = prev[key]
        const next = {
          ...(existing ?? {}),
          ...(progress ? { transcription: progress } : {}),
        }
        if (!progress) {
          delete next.transcription
        }
        if (!next.upload && !next.transcription) {
          if (!(key in prev)) return prev
          const rest = { ...prev }
          delete rest[key]
          return rest
        }
        return { ...prev, [key]: next }
      })
    },
    [],
  )

  const clearVideoProcessingProgress = useCallback((courseId: string) => {
    const key = courseId
    setVideoProcessingProgress((prev) => {
      if (!(key in prev)) return prev
      const rest = { ...prev }
      delete rest[key]
      return rest
    })
  }, [])

  useEffect(() => {
    if (!getSupabaseBrowserClient()) {
      return
    }

    let cancelled = false
    void (async () => {
      setCoursesSyncStatus('loading')
      try {
        const runtime = await loadLearnerRuntimeStateFromSupabase()
        if (cancelled) return
        const removedCatalogCourseIds = normalizeRemovedCatalogCourseIdsFromRuntime(
          runtime?.removedCatalogCourseIds,
        )
        const merged = await loadCoursesFromSupabase(mockInitialState.courses, {
          removedCatalogCourseIds,
        })
        if (cancelled) return
        const runtimeEnrollments = runtime?.enrollments
        setState((s) => ({
          ...s,
          courses: merged,
          removedCatalogCourseIds,
          enrollments: runtimeEnrollments ?? s.enrollments,
          progress: runtime?.progress ?? s.progress,
          completions: runtime?.completions ?? s.completions,
          certificates: runtime?.certificates ?? s.certificates,
          cpdLedger: runtime?.cpdLedger ?? s.cpdLedger,
          transcript: runtime?.transcript ?? s.transcript,
          learningActivityLog: runtime?.learningActivityLog ?? s.learningActivityLog,
          learnerProfiles: normalizeLearnerProfiles(runtime?.learnerProfiles ?? s.learnerProfiles),
          liveOccurrences:
            runtime?.liveOccurrences != null
              ? normalizeLiveOccurrencesFromRuntime(runtime.liveOccurrences)
              : s.liveOccurrences,
          liveOccurrenceAttendances:
            runtime?.liveOccurrenceAttendances != null
              ? normalizeLiveOccurrenceAttendancesFromRuntime(runtime.liveOccurrenceAttendances)
              : s.liveOccurrenceAttendances,
          liveRehearsal:
            runtime?.liveRehearsal != null
              ? normalizeLiveRehearsalFromRuntime(runtime.liveRehearsal)
              : s.liveRehearsal,
        }))
        setCoursesSyncStatus('synced')
        setCoursesSyncMessage(null)
      } catch (e) {
        if (cancelled) return
        setCoursesSyncStatus('error')
        setCoursesSyncMessage(e instanceof Error ? e.message : 'Could not load the shared course catalog.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!getSupabaseBrowserClient() || coursesSyncStatus === 'loading') return
    void persistLearnerRuntimeState(toRuntimeState(state)).then((result) => {
      if (!result.ok) {
        setCoursesSyncMessage(`Could not save learner records: ${result.message}`)
      }
    })
  }, [
    state.enrollments,
    state.progress,
    state.completions,
    state.certificates,
    state.cpdLedger,
    state.transcript,
    state.learningActivityLog,
    state.liveOccurrences,
    state.liveOccurrenceAttendances,
    state.liveRehearsal,
    state.removedCatalogCourseIds,
    coursesSyncStatus,
  ])

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === currentUserId) ?? null,
    [state.users, currentUserId],
  )
  const currentUserRole = currentUser?.role ?? null

  const syncAuthUser = useCallback((user: User | null) => {
    if (!user) {
      setCurrentUserId('')
      return
    }
    const profileStub = { userId: user.id, email: user.email.trim() }
    setState((prev) => {
      const nextProfiles = prev.learnerProfiles.some((p) => p.userId === user.id)
        ? prev.learnerProfiles.map((p) => (p.userId === user.id ? profileStub : p))
        : [...prev.learnerProfiles, profileStub]
      const withUser: AppState = {
        ...prev,
        users: prev.users.some((u) => u.id === user.id)
          ? prev.users.map((u) => (u.id === user.id ? user : u))
          : [...prev.users, user],
        learnerProfiles: nextProfiles,
      }
      return migrateLearnerRuntimeForClerkLogin(withUser, user)
    })
    setCurrentUserId(user.id)
  }, [])

  useEffect(() => {
    if (!getSupabaseBrowserClient()) return
    void syncSupabaseSessionForAuthorRole(currentUserRole)
  }, [currentUserRole])

  /** Supabase may load shared runtime after Clerk; remap legacy ids once catalog + Clerk user are both ready. */
  useEffect(() => {
    if (coursesSyncStatus !== 'synced') return
    if (!getClerkPublishableKey()) return
    if (!currentUser?.email?.trim()) return
    setState((prev) => migrateLearnerRuntimeForClerkLogin(prev, currentUser))
  }, [coursesSyncStatus, currentUser?.id, currentUser?.email])

  const getActiveEnrollment = useCallback(
    (userId: string, courseId: string): Enrollment | null =>
      state.enrollments.find((enrollment) => enrollment.userId === userId && enrollment.courseId === courseId) ??
      null,
    [state.enrollments],
  )

  const getCourseReadiness = useCallback(
    (courseId: string, userId = currentUserId) => {
      const course = state.courses.find((item) => item.id === courseId)
      const enrollment = getActiveEnrollment(userId, courseId)
      if (!course || !enrollment) {
        return {
          completed: false,
          watchedPercent: 0,
          quizPassed: false,
          latestScore: 0,
        }
      }
      return evaluateCompletion(course, enrollment)
    },
    [state.courses, getActiveEnrollment, currentUserId],
  )

  const appendCompletionArtifacts = useCallback(
    (draft: AppState, enrollment: Enrollment) => {
      const course = draft.courses.find((item) => item.id === enrollment.courseId)
      if (!course) return draft

      const readiness = evaluateCompletion(course, enrollment)
      if (!readiness.completed) return draft

      const completionExists = draft.completions.some(
        (completion) =>
          completion.userId === enrollment.userId && completion.courseId === enrollment.courseId,
      )
      if (completionExists) return draft

      const latestAttempt = getLatestPassedAttempt(enrollment.quizAttempts)
      if (!latestAttempt) return draft

      const cpdProviderName = course.cpdProviderName?.trim() || getCpdProviderName()

      const certificateId = createId('cert')
      const completionId = createId('comp')
      const now = new Date().toISOString()
      const cpdHours = getCourseCPDHours(course)
      const verificationCode = `TW-${Math.random().toString(36).slice(2, 10).toUpperCase()}`

      return {
        ...draft,
        completions: [
          ...draft.completions,
          {
            id: completionId,
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            completionDate: now,
            cpdHours,
            quizAttemptId: latestAttempt.id,
            certificateId,
            courseVersion: course.version,
            awardMethod: 'quiz_completion' as const,
          },
        ],
        certificates: [
          ...draft.certificates,
          {
            id: certificateId,
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            verificationCode,
            issuedAt: now,
            providerName: cpdProviderName,
            courseTitle: course.title,
            durationHours: cpdHours,
            completionDate: now,
            quizAttemptId: latestAttempt.id,
            passThreshold: latestAttempt.passThreshold,
            awardMethod: 'quiz_completion' as const,
          },
        ],
        cpdLedger: [
          ...draft.cpdLedger,
          {
            id: createId('cpd'),
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            completionId,
            hoursAwarded: cpdHours,
            createdAt: now,
          },
        ],
        transcript: [
          ...draft.transcript,
          {
            id: createId('tr'),
            userId: enrollment.userId,
            courseId: enrollment.courseId,
            courseTitle: course.title,
            completedAt: now,
            cpdHours,
            certificateId,
            verificationCode,
            providerName: cpdProviderName,
            quizAttemptId: latestAttempt.id,
            passThreshold: latestAttempt.passThreshold,
            activityWatchedMinutes: enrollment.watchedMinutes,
            awardMethod: 'quiz_completion' as const,
          },
        ],
        enrollments: draft.enrollments.map((item) =>
          item.id === enrollment.id
            ? { ...item, completedAt: now, certificateId }
            : item,
        ),
      }
    },
    [],
  )

  const issueInvite = useCallback((email: string, role: UserRole): Invite => {
    if (currentUserRole !== 'hr_admin' && currentUserRole !== 'super_admin') {
      throw new Error('Only HR Admin or Super Admin can issue invites.')
    }

    const invite: Invite = {
      id: createId('inv'),
      email,
      role,
      code: createCode(),
      status: 'pending',
      emailDeliveryStatus: 'pending',
      createdByUserId: currentUserId,
      createdAt: new Date().toISOString(),
    }

    setState((prev) => ({ ...prev, invites: [invite, ...prev.invites] }))
    return invite
  }, [currentUserId, currentUserRole])

  const inviteUser = useCallback(
    (email: string, _fullName: string, role: UserRole): Invite => issueInvite(email, role),
    [issueInvite],
  )

  const sendInviteEmail = useCallback(
    async (
      inviteId: string,
      options?: { clerkSessionToken?: string | null; signUpUrl?: string | null; invite?: Invite },
    ): Promise<ActionResult> => {
      if (currentUserRole !== 'hr_admin' && currentUserRole !== 'super_admin') {
        return { ok: false, message: 'Only HR Admin or Super Admin can send invite emails.' }
      }
      const inviteFromState = state.invites.find((entry) => entry.id === inviteId)
      const invite = inviteFromState ?? options?.invite
      if (!invite) {
        return { ok: false, message: 'Invite not found.' }
      }
      if (invite.status !== 'pending') {
        return { ok: false, message: 'Only pending invites can be emailed.' }
      }
      if (!isInviteFunctionConfigured()) {
        return {
          ok: false,
          message:
            'Invite email is not configured. Set supabaseUrl (or feedbackFunctionUrl) and deploy the invite-user Edge Function.',
        }
      }
      const token = options?.clerkSessionToken?.trim()
      if (!token) {
        return {
          ok: false,
          message: 'Could not verify your Clerk session. Sign in again, then resend the invite.',
        }
      }

      try {
        await sendInviteEmailViaEdge({
          email: invite.email,
          role: invite.role,
          inviteCode: invite.code,
          clerkSessionToken: token,
          signUpUrl: options?.signUpUrl,
        })
        const now = new Date().toISOString()
        setState((prev) => ({
          ...prev,
          invites: prev.invites.map((entry) =>
            entry.id === inviteId
              ? {
                  ...entry,
                  emailDeliveryStatus: 'sent',
                  emailSentAt: now,
                  emailDeliveryError: undefined,
                }
              : entry,
          ),
        }))
        return { ok: true }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Could not send invite email.'
        setState((prev) => ({
          ...prev,
          invites: prev.invites.map((entry) =>
            entry.id === inviteId
              ? {
                  ...entry,
                  emailDeliveryStatus: 'failed',
                  emailDeliveryError: message,
                }
              : entry,
          ),
        }))
        return { ok: false, message }
      }
    },
    [currentUserRole, state.invites],
  )

  const deletePendingInvite = useCallback(
    (inviteId: string) => {
      if (currentUserRole !== 'hr_admin' && currentUserRole !== 'super_admin') return
      setState((prev) => {
        const target = prev.invites.find((i) => i.id === inviteId)
        if (!target || target.status !== 'pending') return prev
        return { ...prev, invites: prev.invites.filter((i) => i.id !== inviteId) }
      })
    },
    [currentUserRole],
  )

  const acceptInvite = useCallback(
    (code: string): { ok: true; user: User } | { ok: false; error: string } => {
      const normalized = code.trim().toUpperCase()
      let result: { ok: true; user: User } | { ok: false; error: string } = {
        ok: false,
        error: 'Invite code not found or no longer valid.',
      }

      setState((prev) => {
        const invite = prev.invites.find(
          (entry) => entry.code.toUpperCase() === normalized && entry.status === 'pending',
        )

        if (!invite) {
          return prev
        }

        const now = new Date().toISOString()
        const existing = prev.users.find((user) => user.email.toLowerCase() === invite.email.toLowerCase())

        const user: User = existing
          ? {
              ...existing,
              accessScope: existing.accessScope ?? accessScopeFromEmail(existing.email),
            }
          : {
              id: createId('u'),
              name: invite.email.split('@')[0] ?? invite.email,
              email: invite.email,
              role: invite.role,
              accessScope: accessScopeFromEmail(invite.email),
              status: 'active',
              invitedAt: invite.createdAt,
              joinedAt: now,
            }

        result = { ok: true, user }
        setCurrentUserId(user.id)

        const profileStub = { userId: user.id, email: user.email.trim() }
        const nextLearnerProfiles = prev.learnerProfiles.some((p) => p.userId === user.id)
          ? prev.learnerProfiles.map((p) => (p.userId === user.id ? profileStub : p))
          : [...prev.learnerProfiles, profileStub]

        return {
          ...prev,
          invites: prev.invites.map((entry) =>
            entry.id === invite.id ? { ...entry, status: 'accepted', acceptedAt: now } : entry,
          ),
          users: existing
            ? prev.users.map((u) => (u.id === existing.id ? user : u))
            : [...prev.users, user],
          learnerProfiles: nextLearnerProfiles,
        }
      })

      return result
    },
    [],
  )

  const suspendUser = useCallback(
    (userId: string, suspended = true) => {
      if (currentUserRole !== 'hr_admin' && currentUserRole !== 'super_admin') return
      setState((prev) => ({
        ...prev,
        users: prev.users.map((user) =>
          user.id === userId ? { ...user, status: suspended ? 'suspended' : 'active' } : user,
        ),
      }))
    },
    [currentUserRole],
  )

  const deleteUser = useCallback(
    (userId: string) => {
      if (currentUserRole !== 'hr_admin' && currentUserRole !== 'super_admin') return
      if (userId === currentUserId) return

      setState((prev) => {
        const target = prev.users.find((u) => u.id === userId)
        if (!target) return prev

        const emailLower = target.email.toLowerCase()
        const nextProgress = { ...prev.progress }
        for (const key of Object.keys(nextProgress)) {
          const entry = nextProgress[key]
          if (!entry) continue
          if (entry.userId === userId || key.startsWith(`${userId}::`)) {
            delete nextProgress[key]
          }
        }

        return {
          ...prev,
          users: prev.users.filter((u) => u.id !== userId),
          learnerProfiles: prev.learnerProfiles.filter((p) => p.userId !== userId),
          enrollments: prev.enrollments.filter((e) => e.userId !== userId),
          progress: nextProgress,
          completions: prev.completions.filter((c) => c.userId !== userId),
          certificates: prev.certificates.filter((c) => c.userId !== userId),
          cpdLedger: prev.cpdLedger.filter((c) => c.userId !== userId),
          transcript: prev.transcript.filter((t) => t.userId !== userId),
          learningActivityLog: prev.learningActivityLog.filter((a) => a.userId !== userId),
          liveOccurrenceAttendances: prev.liveOccurrenceAttendances.filter((w) => w.userId !== userId),
          liveOccurrences: prev.liveOccurrences.map((w) => ({
            ...w,
            attendeeIds: w.attendeeIds.filter((id) => id !== userId),
          })),
          invites: prev.invites.filter((inv) => inv.email.toLowerCase() !== emailLower),
          auditEvents: prev.auditEvents.filter((e) => e.actorUserId !== userId),
        }
      })
    },
    [currentUserRole, currentUserId],
  )

  const enrollInCourse = useCallback(
    (courseId: string): ActionResult => {
      if (!currentUser) return { ok: false, message: 'Please sign in.' }
      if (currentUser.status === 'suspended') return { ok: false, message: 'Account suspended.' }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (course.status !== 'published' && currentUser.role === 'learner') {
        return { ok: false, message: 'Course is not published.' }
      }
      if (currentUser.role === 'learner' && !learnerCanAccessCourse(currentUser, course)) {
        return {
          ok: false,
          message: 'This course is available to Treewalk team members only.',
        }
      }

      const existing = getActiveEnrollment(currentUser.id, courseId)
      if (existing) return { ok: true }

      const enrollment: Enrollment = {
        id: createId('enr'),
        userId: currentUser.id,
        courseId,
        enrolledAt: new Date().toISOString(),
        watchedMinutes: 0,
        quizAttempts: [],
      }

      setState((prev) => ({ ...prev, enrollments: [...prev.enrollments, enrollment] }))
      return { ok: true }
    },
    [currentUser, state.courses, getActiveEnrollment],
  )

  const recordVideoPlayback = useCallback(
    (courseId: string, update: VideoPlaybackUpdateInput): ActionResult => {
      if (!currentUser) return { ok: false, message: 'Please sign in.' }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }

      const enrollment = getActiveEnrollment(currentUser.id, courseId)
      if (!enrollment) return { ok: false, message: 'Enroll first.' }
      if (currentUser.role === 'learner' && !learnerCanAccessCourse(currentUser, course)) {
        return { ok: false, message: 'This course is available to Treewalk team members only.' }
      }

      const nowIso = new Date().toISOString()
      const boundedPosition = Math.max(0, Math.round(update.positionSecond || 0))
      const boundedDelta = Math.max(0, Math.round(update.watchedDeltaSeconds || 0))

      setState((prev) => {
        const targetEnrollment = prev.enrollments.find((item) => item.id === enrollment.id)
        if (!targetEnrollment) return prev

        const durationSeconds = Math.max(1, Math.round(update.durationSeconds || course.videoMinutes * 60 || 1))
        const currentProgress = ensureEnrollmentVideoProgress(targetEnrollment, durationSeconds)
        const previousPosition = currentProgress.lastPositionSecond
        const positionJump = Math.max(0, boundedPosition - previousPosition)
        const suspiciousDelta = !update.completed && boundedDelta > MAX_HEARTBEAT_DELTA_SECONDS
        const suspiciousJump = !update.completed && positionJump > MAX_POSITION_ADVANCE_SECONDS
        const inferredSeekViolation = Boolean(update.seekViolation || suspiciousDelta || suspiciousJump)
        const acceptedDelta = update.completed
          ? boundedDelta
          : Math.min(boundedDelta, MAX_HEARTBEAT_DELTA_SECONDS)
        const nextWatchedSeconds = Math.min(durationSeconds, currentProgress.watchedSeconds + acceptedDelta)
        const nextFurthest = Math.max(
          currentProgress.furthestSecond,
          Math.min(durationSeconds, boundedPosition),
        )
        const completionThresholdSeconds = Math.max(1, Math.floor(durationSeconds * 0.99))
        const completedByWatch = nextWatchedSeconds >= completionThresholdSeconds
        const completionByExplicitSignal =
          Boolean(update.completed) &&
          nextFurthest >= completionThresholdSeconds &&
          nextWatchedSeconds >= Math.max(1, Math.floor(durationSeconds * 0.9))
        const completed = currentProgress.completed || completedByWatch || completionByExplicitSignal

        const nextVideoProgress: VideoWatchProgress = {
          ...currentProgress,
          durationSeconds,
          watchedSeconds: nextWatchedSeconds,
          furthestSecond: nextFurthest,
          lastPositionSecond: Math.min(durationSeconds, boundedPosition),
          completed,
          pausedCount: currentProgress.pausedCount + (update.paused ? 1 : 0),
          resumedCount: currentProgress.resumedCount + (update.resumed ? 1 : 0),
          seekViolations: currentProgress.seekViolations + (inferredSeekViolation ? 1 : 0),
          lastUpdatedAt: nowIso,
        }

        const watchedMinutes = Math.min(course.videoMinutes, Math.round((nextWatchedSeconds / 60) * 100) / 100)

        const nextEnrollments = prev.enrollments.map((item) =>
          item.id === targetEnrollment.id
            ? {
                ...item,
                videoProgress: nextVideoProgress,
                watchedMinutes,
              }
            : item,
        )
        const updated = nextEnrollments.find((item) => item.id === targetEnrollment.id)
        if (!updated) return prev

        const progressKey = `${currentUser.id}::${courseId}`
        const nextProgress = {
          ...prev.progress,
          [progressKey]: {
            userId: currentUser.id,
            courseId,
            watchedMinutes: updated.watchedMinutes,
            lastWatchedAt: nowIso,
          },
        }

        const eventType: LearningActivityEvent['type'] = update.seekViolation
          || inferredSeekViolation
          ? 'seek_violation'
          : update.paused
            ? 'pause'
            : update.resumed
              ? 'resume'
              : completed && !currentProgress.completed
                ? 'video_complete'
                : 'heartbeat'

        const nextActivityLog = [
          ...prev.learningActivityLog,
          {
            id: createId('act'),
            userId: currentUser.id,
            courseId,
            type: eventType,
            at: nowIso,
            positionSecond: nextVideoProgress.lastPositionSecond,
            watchedSeconds: nextVideoProgress.watchedSeconds,
          },
        ]

        const draft = {
          ...prev,
          enrollments: nextEnrollments,
          progress: nextProgress,
          learningActivityLog: nextActivityLog,
        }
        return appendCompletionArtifacts(draft, updated)
      })

      return { ok: true }
    },
    [currentUser, state.courses, getActiveEnrollment, appendCompletionArtifacts],
  )

  const markVideoWatched = useCallback(
    (courseId: string): ActionResult => {
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      const durationSeconds = Math.max(1, Math.round(course.videoMinutes * 60))
      return recordVideoPlayback(courseId, {
        positionSecond: durationSeconds,
        durationSeconds,
        watchedDeltaSeconds: durationSeconds,
        isPlaying: false,
        completed: true,
      })
    },
    [state.courses, recordVideoPlayback],
  )

  const submitQuizAttempt = useCallback(
    (
      courseId: string,
      renderedQuestions: QuizQuestion[],
      answers: Record<string, string>,
    ): QuizAttempt | null => {
      if (!currentUser) return null
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return null

      const enrollment = getActiveEnrollment(currentUser.id, courseId)
      if (!enrollment) return null
      if (currentUser.role === 'learner' && !learnerCanAccessCourse(currentUser, course)) {
        return null
      }
      const watchedPercent = getWatchedPercentFromEnrollment(course, enrollment)
      if (watchedPercent < 100) return null

      const policy = ensureQuizPolicy(course)
      const attemptsQuestions = renderedQuestions.length > 0 ? renderedQuestions : course.quiz

      let created: QuizAttempt | null = null

      setState((prev) => {
        const targetEnrollment = prev.enrollments.find((item) => item.id === enrollment.id)
        if (!targetEnrollment) return prev

        const score = scoreQuizAttempt(attemptsQuestions, answers)
        const attempt: QuizAttempt = {
          id: createId('qa'),
          userId: currentUser.id,
          courseId,
          answers,
          scorePercent: score,
          passed: score >= policy.passThreshold,
          submittedAt: new Date().toISOString(),
          attemptNumber: targetEnrollment.quizAttempts.length + 1,
          passThreshold: policy.passThreshold,
          renderedQuestions: attemptsQuestions,
          generatedQuestionCount: policy.generatedQuestionCount,
          shownQuestionCount: attemptsQuestions.length,
        }
        created = attempt

        const nextEnrollments = prev.enrollments.map((item) =>
          item.id === targetEnrollment.id
            ? { ...item, quizAttempts: [...item.quizAttempts, attempt] }
            : item,
        )

        const updated = nextEnrollments.find((item) => item.id === targetEnrollment.id)
        if (!updated) return prev
        return appendCompletionArtifacts({ ...prev, enrollments: nextEnrollments }, updated)
      })

      return created
    },
    [currentUser, state.courses, getActiveEnrollment, appendCompletionArtifacts],
  )

  const updateCourseQuiz = useCallback(
    (courseId: string, questionBank: QuizQuestion[], policy: QuizPolicy): ActionResult => {
      if (!currentUser || !currentUserRole) return { ok: false, message: 'Please sign in.' }
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (!canManageCourseMux(currentUserRole, course, currentUser.id)) {
        return { ok: false, message: 'You do not have permission to edit this course.' }
      }
      const now = new Date().toISOString()
      const normalizedQuestions = questionBank.map((question, questionIndex) => {
        const options = question.options.slice(0, 4).map((option, optionIndex) => ({
          ...option,
          id: option.id || createQuestionOptionId(questionIndex, optionIndex),
          label: option.label.trim(),
        }))
        const hasCorrect = options.some((option) => option.isCorrect)
        return {
          ...question,
          id: question.id || createQuestionId(courseId, questionIndex),
          prompt: question.prompt.trim(),
          options: hasCorrect
            ? options
            : options.map((option, optionIndex) => ({ ...option, isCorrect: optionIndex === 0 })),
        }
      })
      const nextCourse: Course = {
        ...course,
        updatedAt: now,
        quiz: normalizedQuestions,
        quizPolicy: {
          ...policy,
          generatedAt: policy.generatedAt || now,
          generatedQuestionCount: Math.max(normalizedQuestions.length, policy.generatedQuestionCount),
          shownQuestionCount: Math.min(
            Math.max(1, normalizedQuestions.length),
            Math.max(1, policy.shownQuestionCount),
          ),
          passThreshold: policy.passThreshold,
        },
      }
      setState((prev) => ({
        ...prev,
        courses: prev.courses.map((entry) => (entry.id === courseId ? nextCourse : entry)),
      }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(nextCourse).then((r) => {
            if (!r.ok) setCoursesSyncMessage(`Could not save this course: ${r.message}`)
        })
      }
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
  )

  const deleteCourseQuizQuestion = useCallback(
    (courseId: string, questionId: string): ActionResult => {
      if (!currentUser || !currentUserRole) return { ok: false, message: 'Please sign in.' }
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (!canManageCourseMux(currentUserRole, course, currentUser.id)) {
        return { ok: false, message: 'You do not have permission to edit this course.' }
      }
      const policy = ensureQuizPolicy(course)
      const minRequired = Math.max(policy.shownQuestionCount, 6)
      const nextQuiz = course.quiz.filter((question) => question.id !== questionId)
      if (nextQuiz.length < minRequired) {
        return {
          ok: false,
          message: `Cannot drop below ${minRequired} questions. Regenerate or reduce shown question policy first.`,
        }
      }

      const nextCourse: Course = {
        ...course,
        updatedAt: new Date().toISOString(),
        quiz: nextQuiz,
        quizPolicy: {
          ...policy,
          generatedQuestionCount: Math.max(nextQuiz.length, policy.generatedQuestionCount),
          shownQuestionCount: Math.min(policy.shownQuestionCount, nextQuiz.length),
        },
      }
      setState((prev) => ({
        ...prev,
        courses: prev.courses.map((entry) => (entry.id === courseId ? nextCourse : entry)),
      }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(nextCourse).then((r) => {
            if (!r.ok) setCoursesSyncMessage(`Could not save this course: ${r.message}`)
        })
      }
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
  )

  const createCourse = useCallback(
    (input: CreateCourseInput): { ok: true; course: Course } | { ok: false; message: string } => {
      if (!currentUser || !canAuthorCourses(currentUserRole)) {
        return { ok: false, message: 'You do not have permission to create courses.' }
      }

      const title = input.title.trim()
      if (!title) return { ok: false, message: 'Course title is required.' }

      const now = new Date().toISOString()
      const totalMinutes = Math.max(1, Math.round(input.videoMinutes ?? 15))
      const courseId = createId('crs')

      const course: Course = {
        id: courseId,
        title,
        summary: input.summary.trim() || 'New course',
        description: input.description.trim() || input.summary.trim() || title,
        category: input.category.trim() || 'General',
        topic: input.topic,
        level: input.level,
        audience: normalizeCourseAudience(input.audience),
        instructorId:
          currentUser.role === 'instructor'
            ? currentUser.id
            : input.instructorId?.trim() || currentUser.id,
        status: 'draft',
        videoMinutes: totalMinutes,
        cpdHoursOverride: null,
        version: 1,
        createdAt: now,
        updatedAt: now,
        muxStatus: 'idle',
        transcriptStatus: 'idle',
        packageProfile: {
          schemaVersion: COURSE_PACKAGE_SCHEMA_VERSION,
          locale: DEFAULT_EXPORT_LOCALE,
          runtimeMode: 'single_sco',
          mediaDelivery: 'stream',
          manifestIdentifier: courseId,
        },
        quiz: input.quiz ?? [],
        quizPolicy: buildQuizPolicy(totalMinutes),
      }

      setState((prev) => ({ ...prev, courses: [course, ...prev.courses] }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(course).then((r) => {
          if (!r.ok) {
            setCoursesSyncMessage(`Could not save this course: ${r.message}`)
          }
        })
      }
      return { ok: true, course }
    },
    [currentUser, currentUserRole],
  )

  const updateCourseDetails = useCallback(
    (courseId: string, input: UpdateCourseInput): ActionResult => {
      if (!currentUser || !currentUserRole) {
        return { ok: false, message: 'Please sign in.' }
      }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (!canManageCourseMux(currentUserRole, course, currentUser.id)) {
        return { ok: false, message: 'You do not have permission to edit this course.' }
      }

      const next = sanitizeCourseDetails(input)
      if (!next.title) return { ok: false, message: 'Course title is required.' }
      if (!next.summary) return { ok: false, message: 'Course summary is required.' }
      if (!next.description) return { ok: false, message: 'Course description is required.' }
      if (!next.category) return { ok: false, message: 'Course category is required.' }

      const now = new Date().toISOString()
      const nextInstructorId =
        currentUserRole === 'content_admin' || currentUserRole === 'super_admin'
          ? next.instructorId || course.instructorId
          : course.instructorId
      const nextCourse: Course = {
        ...course,
        title: next.title,
        summary: next.summary,
        description: next.description,
        category: next.category,
        topic: next.topic,
        level: next.level,
        audience: next.audience,
        instructorId: nextInstructorId,
        updatedAt: now,
      }

      setState((prev) => ({
        ...prev,
        courses: prev.courses.map((entry) => (entry.id === courseId ? nextCourse : entry)),
      }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(nextCourse).then((r) => {
          if (!r.ok) {
            setCoursesSyncMessage(`Could not save this course: ${r.message}`)
          }
        })
      }
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
  )

  const deleteDraftCourse = useCallback(
    async (courseId: string, options?: { clerkSessionToken?: string | null }): Promise<ActionResult> => {
      if (!currentUser || !currentUserRole) {
        return { ok: false, message: 'Please sign in.' }
      }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (course.status !== 'draft') {
        return { ok: false, message: 'Only draft courses can be deleted here.' }
      }
      if (!canManageCourseMux(currentUserRole, course, currentUser.id)) {
        return { ok: false, message: 'You do not have permission to delete this course.' }
      }

      const muxAssetId = course.muxAssetId?.trim()
      if (muxAssetId && getClerkPublishableKey() && isMuxFunctionConfigured()) {
        const clerkToken = options?.clerkSessionToken?.trim()
        if (!clerkToken) {
          return {
            ok: false,
            message:
              'This draft has hosted video. Stay signed in with Clerk, then try again so Mux can delete the file and free your quota.',
          }
        }
        try {
          await deleteMuxAsset({
            assetId: muxAssetId,
            courseId: course.id,
            clerkSessionToken: clerkToken,
          })
        } catch (e) {
          const msg = e instanceof Error ? e.message : 'Could not delete video from Mux.'
          setCoursesSyncMessage(msg)
          return { ok: false, message: msg }
        }
      }

      if (hasSupabaseBrowserEnv()) {
        const remote = await deleteCourseFromSupabase(courseId)
        if (!remote.ok) {
          setCoursesSyncMessage(`Could not delete this course: ${remote.message}`)
          return { ok: false, message: remote.message }
        }
      }

      setVideoProcessingProgress((prev) => {
        if (!(courseId in prev)) return prev
        const rest = { ...prev }
        delete rest[courseId]
        return rest
      })

      setState((prev) => ({
        ...prev,
        courses: prev.courses.filter((c) => c.id !== courseId),
        removedCatalogCourseIds: [...new Set([...prev.removedCatalogCourseIds, courseId])],
      }))
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
  )

  const updateCourseVideo = useCallback(
    (
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
    ) => {
      setState((prev) => {
        const course = prev.courses.find((c) => c.id === courseId)
        if (!course) return prev
        if (!canManageCourseMux(currentUserRole, course, currentUserId)) return prev
        const now = new Date().toISOString()
        const nextCourse: Course = {
          ...course,
          ...mux,
          updatedAt: now,
          videoMinutes: Math.max(1, Math.round(mux.videoMinutes ?? course.videoMinutes)),
        }
        if (getSupabaseBrowserClient()) {
          void persistCourseToSupabase(nextCourse).then((r) => {
            if (!r.ok) {
              setCoursesSyncMessage(`Could not save this course: ${r.message}`)
            }
          })
        }
        return {
          ...prev,
          courses: prev.courses.map((c) => (c.id === courseId ? nextCourse : c)),
        }
      })
    },
    [currentUserRole, currentUserId],
  )

  const transitionCourseStatus = useCallback(
    (courseId: string, nextStatus: CourseStatus): ActionResult => {
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course || !currentUserRole || !currentUser) {
        return { ok: false, message: 'Course transition not allowed.' }
      }
      const allowed = canTransitionCourseStatus(
        currentUserRole,
        course.status,
        nextStatus,
        course.instructorId === currentUser.id,
      )
      if (!allowed) {
        return { ok: false, message: 'You do not have permission for this transition.' }
      }

      setState((prev) => {
        const entry = prev.courses.find((c) => c.id === courseId)
        if (!entry) return prev
        const now = new Date().toISOString()
        const nextCourse: Course = {
          ...entry,
          status: nextStatus,
          publishedAt: nextStatus === 'published' ? now : entry.publishedAt,
          updatedAt: now,
        }
        if (getSupabaseBrowserClient()) {
          void persistCourseToSupabase(nextCourse).then((r) => {
            if (!r.ok) {
              setCoursesSyncMessage(`Could not save this course: ${r.message}`)
            }
          })
        }
        return {
          ...prev,
          courses: prev.courses.map((c) => (c.id === courseId ? nextCourse : c)),
        }
      })
      return { ok: true }
    },
    [state.courses, currentUserRole, currentUser],
  )

  const appendLiveAttendanceArtifacts = useCallback(
    (draft: AppState, occurrence: LiveOccurrence, attendance: AppState['liveOccurrenceAttendances'][number]) => {
      const courseId = occurrence.resultingCourseId?.trim()
      if (!courseId) return draft
      const course = draft.courses.find((item) => item.id === courseId)
      if (!course) return draft
      if (hasCompletionForCourse(draft.completions, attendance.userId, courseId)) return draft

      const now = new Date().toISOString()
      const cpdProviderName = course.cpdProviderName?.trim() || getCpdProviderName()
      const cpdHours = getCourseCPDHours(course) || getCourseCPDHours({ videoMinutes: occurrence.expectedMinutes })
      const completionDate = attendance.qualifiedAt ?? attendance.attendedAt ?? now
      const attendanceThresholdPercent = Math.round(LIVE_ATTENDANCE_REQUIRED_WATCH_RATIO * 100)
      const liveAttemptId = `qa-live-${occurrence.id}-${attendance.userId}`
      const watchedMinutes = Math.max(course.videoMinutes, occurrence.expectedMinutes)
      const existingEnrollment = draft.enrollments.find(
        (item) => item.userId === attendance.userId && item.courseId === courseId,
      )
      const enrollmentId = existingEnrollment?.id ?? createId('enr')
      const enrollmentAttemptExists = existingEnrollment?.quizAttempts.some((attempt) => attempt.id === liveAttemptId)
      const nextAttempts = enrollmentAttemptExists
        ? existingEnrollment?.quizAttempts ?? []
        : [
            ...(existingEnrollment?.quizAttempts ?? []),
            {
              id: liveAttemptId,
              userId: attendance.userId,
              courseId,
              answers: {},
              scorePercent: 100,
              passed: true,
              submittedAt: completionDate,
              attemptNumber: (existingEnrollment?.quizAttempts.length ?? 0) + 1,
              passThreshold: attendanceThresholdPercent,
              renderedQuestions: [],
              generatedQuestionCount: 0,
              shownQuestionCount: 0,
            },
          ]

      const certificateId = createId('cert')
      const completionId = createId('comp')
      const verificationCode = `TW-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
      const nextEnrollment: Enrollment = {
        id: enrollmentId,
        userId: attendance.userId,
        courseId,
        enrolledAt: existingEnrollment?.enrolledAt ?? completionDate,
        watchedMinutes: Math.max(existingEnrollment?.watchedMinutes ?? 0, watchedMinutes),
        quizAttempts: nextAttempts,
        completedAt: completionDate,
        certificateId,
      }

      return {
        ...draft,
        completions: [
          ...draft.completions,
          {
            id: completionId,
            userId: attendance.userId,
            courseId,
            completionDate,
            cpdHours,
            quizAttemptId: liveAttemptId,
            certificateId,
            courseVersion: course.version,
            awardMethod: 'live_attendance' as const,
          },
        ],
        certificates: [
          ...draft.certificates,
          {
            id: certificateId,
            userId: attendance.userId,
            courseId,
            verificationCode,
            issuedAt: completionDate,
            providerName: cpdProviderName,
            courseTitle: course.title,
            durationHours: cpdHours,
            completionDate,
            quizAttemptId: liveAttemptId,
            passThreshold: attendanceThresholdPercent,
            awardMethod: 'live_attendance' as const,
          },
        ],
        cpdLedger: [
          ...draft.cpdLedger,
          {
            id: createId('cpd'),
            userId: attendance.userId,
            courseId,
            completionId,
            hoursAwarded: cpdHours,
            createdAt: completionDate,
          },
        ],
        transcript: [
          ...draft.transcript,
          {
            id: createId('tr'),
            userId: attendance.userId,
            courseId,
            courseTitle: course.title,
            completedAt: completionDate,
            cpdHours,
            certificateId,
            verificationCode,
            providerName: cpdProviderName,
            quizAttemptId: liveAttemptId,
            passThreshold: attendanceThresholdPercent,
            activityWatchedMinutes: Math.max(0, Math.round((attendance.watchedSeconds ?? 0) / 60)),
            awardMethod: 'live_attendance' as const,
          },
        ],
        enrollments: existingEnrollment
          ? draft.enrollments.map((item) => (item.id === existingEnrollment.id ? nextEnrollment : item))
          : [...draft.enrollments, nextEnrollment],
      }
    },
    [],
  )

  const appendLiveAttendanceArtifactsForOccurrence = useCallback(
    (draft: AppState, occurrenceId: string): AppState => {
      const occurrence = draft.liveOccurrences.find((item) => item.id === occurrenceId)
      if (!occurrence) return draft
      if (!occurrence.resultingCourseId) return draft
      const qualifiedAttendances = draft.liveOccurrenceAttendances.filter(
        (item) => item.occurrenceId === occurrenceId && item.qualified && item.source !== 'replay',
      )
      return qualifiedAttendances.reduce<AppState>(
        (next, attendance) => appendLiveAttendanceArtifacts(next, occurrence, attendance),
        draft,
      )
    },
    [appendLiveAttendanceArtifacts],
  )

  const finalizeLiveOccurrenceAttendanceInDraft = useCallback(
    (draft: AppState, occurrenceId: string, userId?: string): AppState => {
      const occurrence = draft.liveOccurrences.find((item) => item.id === occurrenceId)
      if (!occurrence) return draft
      let changed = false
      const now = new Date().toISOString()
      const nextAttendances = draft.liveOccurrenceAttendances.map((item) => {
        if (item.occurrenceId !== occurrenceId) return item
        if (userId && item.userId !== userId) return item
        if (item.source === 'replay') return item

        const evaluation = evaluateLiveAttendanceQualification(occurrence, item)
        const nextQualified = evaluation.qualified
        const nextQualifiedAt = nextQualified ? item.qualifiedAt ?? now : undefined
        const nextAttendedAt = nextQualified ? item.attendedAt || nextQualifiedAt || now : item.attendedAt
        const nextReason = nextQualified ? 'watch_threshold_and_end_presence' : evaluation.reason
        const unchanged =
          (item.qualified ?? false) === nextQualified
          && item.qualifiedAt === nextQualifiedAt
          && item.attendedAt === nextAttendedAt
          && item.qualificationReason === nextReason
        if (unchanged) return item
        changed = true
        return {
          ...item,
          qualified: nextQualified,
          qualifiedAt: nextQualifiedAt,
          attendedAt: nextAttendedAt,
          qualificationReason: nextReason,
        }
      })

      if (!changed) return appendLiveAttendanceArtifactsForOccurrence(draft, occurrenceId)

      const attendeeIds = nextAttendances
        .filter((item) => item.occurrenceId === occurrenceId && item.qualified)
        .map((item) => item.userId)
      const dedupedAttendeeIds = [...new Set(attendeeIds)]
      const nextDraft: AppState = {
        ...draft,
        liveOccurrenceAttendances: nextAttendances,
        liveOccurrences: draft.liveOccurrences.map((item) =>
          item.id === occurrenceId ? { ...item, attendeeIds: dedupedAttendeeIds } : item,
        ),
      }
      return appendLiveAttendanceArtifactsForOccurrence(nextDraft, occurrenceId)
    },
    [appendLiveAttendanceArtifactsForOccurrence],
  )

  const markLiveOccurrenceAttendance = useCallback(
    (occurrenceId: string, source: 'live_manual' | 'replay' = 'live_manual') => {
      if (!currentUser) return
      setState((prev) => {
        const occurrence = prev.liveOccurrences.find((item) => item.id === occurrenceId)
        if (!occurrence) return prev
        const now = new Date().toISOString()
        const existing = prev.liveOccurrenceAttendances.find(
          (item) => item.occurrenceId === occurrenceId && item.userId === currentUser.id,
        )
        const nextAttendance: AppState['liveOccurrenceAttendances'][number] = existing
          ? {
              ...existing,
              attendedAt: existing.attendedAt || now,
              source,
              joinedAt: existing.joinedAt ?? now,
              lastActiveAt: now,
              watchedSeconds: Math.max(
                existing.watchedSeconds ?? 0,
                Math.max(1, Math.round(occurrence.expectedMinutes * 60)),
              ),
              qualified: true,
              qualifiedAt: existing.qualifiedAt ?? now,
              qualificationReason: 'manual_marked' as const,
            }
          : {
              id: createId('la'),
              occurrenceId,
              userId: currentUser.id,
              attendedAt: now,
              source,
              joinedAt: now,
              lastActiveAt: now,
              watchedSeconds: Math.max(1, Math.round(occurrence.expectedMinutes * 60)),
              qualified: true,
              qualifiedAt: now,
              qualificationReason: 'manual_marked' as const,
            }
        const nextAttendances = existing
          ? prev.liveOccurrenceAttendances.map((item) => (item.id === existing.id ? nextAttendance : item))
          : [...prev.liveOccurrenceAttendances, nextAttendance]
        const nextDraft: AppState = {
          ...prev,
          liveOccurrenceAttendances: nextAttendances,
          liveOccurrences: prev.liveOccurrences.map((item) =>
            item.id === occurrenceId
              ? { ...item, attendeeIds: [...new Set([...item.attendeeIds, currentUser.id])] }
              : item,
          ),
        }
        return appendLiveAttendanceArtifactsForOccurrence(nextDraft, occurrenceId)
      })
    },
    [currentUser, appendLiveAttendanceArtifactsForOccurrence],
  )

  const startLiveOccurrenceWatch = useCallback(
    (occurrenceId: string) => {
      if (!currentUser) return
      setState((prev) => {
        const occurrence = prev.liveOccurrences.find((item) => item.id === occurrenceId)
        if (!occurrence) return prev
        const now = new Date().toISOString()
        const existing = prev.liveOccurrenceAttendances.find(
          (item) => item.occurrenceId === occurrenceId && item.userId === currentUser.id,
        )
        const source: AppState['liveOccurrenceAttendances'][number]['source'] =
          existing?.source === 'live_manual' ? 'live_manual' : 'live_auto'
        const nextAttendance: AppState['liveOccurrenceAttendances'][number] = existing
          ? {
              ...existing,
              source,
              joinedAt: existing.joinedAt ?? now,
              lastActiveAt: now,
              watchedSeconds: Math.max(0, existing.watchedSeconds ?? 0),
              qualificationReason: existing.qualificationReason ?? 'not_ended',
            }
          : {
              id: createId('la'),
              occurrenceId,
              userId: currentUser.id,
              attendedAt: now,
              source: 'live_auto' as const,
              joinedAt: now,
              lastActiveAt: now,
              watchedSeconds: 0,
              qualified: false,
              qualificationReason: 'not_ended' as const,
            }
        const nextAttendances = existing
          ? prev.liveOccurrenceAttendances.map((item) => (item.id === existing.id ? nextAttendance : item))
          : [...prev.liveOccurrenceAttendances, nextAttendance]
        const nextDraft: AppState = {
          ...prev,
          liveOccurrenceAttendances: nextAttendances,
          liveOccurrences: prev.liveOccurrences.map((item) =>
            item.id === occurrenceId
              ? { ...item, attendeeIds: [...new Set([...item.attendeeIds, currentUser.id])] }
              : item,
          ),
        }
        return occurrence.status === 'ended'
          ? finalizeLiveOccurrenceAttendanceInDraft(nextDraft, occurrenceId, currentUser.id)
          : nextDraft
      })
    },
    [currentUser, finalizeLiveOccurrenceAttendanceInDraft],
  )

  const heartbeatLiveOccurrenceWatch = useCallback(
    (occurrenceId: string, deltaSeconds: number) => {
      if (!currentUser) return
      const boundedDelta = clampLiveAttendanceHeartbeatDeltaSeconds(
        Math.min(deltaSeconds, LIVE_ATTENDANCE_HEARTBEAT_MAX_DELTA_SECONDS),
      )
      if (boundedDelta <= 0) return
      setState((prev) => {
        const occurrence = prev.liveOccurrences.find((item) => item.id === occurrenceId)
        if (!occurrence) return prev
        const now = new Date().toISOString()
        const existing = prev.liveOccurrenceAttendances.find(
          (item) => item.occurrenceId === occurrenceId && item.userId === currentUser.id,
        )
        const base: AppState['liveOccurrenceAttendances'][number] = existing ?? {
          id: createId('la'),
          occurrenceId,
          userId: currentUser.id,
          attendedAt: now,
          source: 'live_auto' as const,
          joinedAt: now,
          watchedSeconds: 0,
          qualified: false,
          qualificationReason: 'not_ended' as const,
        }
        const nextAttendance: AppState['liveOccurrenceAttendances'][number] = {
          ...base,
          source: base.source === 'live_manual' ? 'live_manual' : 'live_auto',
          lastActiveAt: now,
          watchedSeconds: Math.max(0, (base.watchedSeconds ?? 0) + boundedDelta),
        }
        const nextAttendances = existing
          ? prev.liveOccurrenceAttendances.map((item) => (item.id === existing.id ? nextAttendance : item))
          : [...prev.liveOccurrenceAttendances, nextAttendance]
        const nextDraft: AppState = {
          ...prev,
          liveOccurrenceAttendances: nextAttendances,
          liveOccurrences: prev.liveOccurrences.map((item) =>
            item.id === occurrenceId
              ? { ...item, attendeeIds: [...new Set([...item.attendeeIds, currentUser.id])] }
              : item,
          ),
        }
        return occurrence.status === 'ended'
          ? finalizeLiveOccurrenceAttendanceInDraft(nextDraft, occurrenceId, currentUser.id)
          : nextDraft
      })
    },
    [currentUser, finalizeLiveOccurrenceAttendanceInDraft],
  )

  const stopLiveOccurrenceWatch = useCallback(
    (occurrenceId: string) => {
      if (!currentUser) return
      setState((prev) => {
        const occurrence = prev.liveOccurrences.find((item) => item.id === occurrenceId)
        if (!occurrence) return prev
        const existing = prev.liveOccurrenceAttendances.find(
          (item) => item.occurrenceId === occurrenceId && item.userId === currentUser.id,
        )
        if (!existing) return prev
        const now = new Date().toISOString()
        const nextDraft: AppState = {
          ...prev,
          liveOccurrenceAttendances: prev.liveOccurrenceAttendances.map((item) =>
            item.id === existing.id ? { ...item, lastActiveAt: now } : item,
          ),
        }
        return occurrence.status === 'ended'
          ? finalizeLiveOccurrenceAttendanceInDraft(nextDraft, occurrenceId, currentUser.id)
          : nextDraft
      })
    },
    [currentUser, finalizeLiveOccurrenceAttendanceInDraft],
  )

  const finalizeLiveOccurrenceAttendance = useCallback(
    (occurrenceId: string) => {
      if (!currentUser) return
      setState((prev) => finalizeLiveOccurrenceAttendanceInDraft(prev, occurrenceId, currentUser.id))
    },
    [currentUser, finalizeLiveOccurrenceAttendanceInDraft],
  )

  const createLiveOccurrence = useCallback(
    async (
      input: CreateLiveOccurrenceInput,
    ): Promise<{ ok: true; occurrence: LiveOccurrence } | { ok: false; message: string }> => {
      if (!currentUser || !canManageLiveEvents(currentUserRole)) {
        return { ok: false, message: 'You do not have permission to schedule live events.' }
      }
      const title = input.title.trim()
      if (!title) return { ok: false, message: 'Live session title is required.' }
      const startAtIso = input.startAt ? new Date(input.startAt).toISOString() : ''
      if (!startAtIso || Number.isNaN(Date.parse(startAtIso))) {
        return { ok: false, message: 'A valid start date/time is required.' }
      }
      const expectedMinutes = Math.max(30, Math.round(input.expectedMinutes || 60))
      const occurrenceId = createId('live')
      const fallbackLiveStreamId = `local-${occurrenceId}`
      let muxLiveStreamId = fallbackLiveStreamId
      let muxPlaybackId: string | undefined
      let muxStreamKey: string | undefined
      let streamError: string | undefined
      if (isMuxFunctionConfigured()) {
        try {
          const created = await createMuxLiveStream({
            title,
            latencyMode: 'low',
            reconnectWindowSeconds: 90,
            passthrough: `live_occurrence:${occurrenceId}`,
          })
          muxLiveStreamId = created.liveStreamId
          muxPlaybackId = created.playbackId ?? undefined
          muxStreamKey = created.streamKey ?? undefined
        } catch (e) {
          streamError = e instanceof Error ? e.message : 'Could not provision a Mux live stream.'
        }
      }

      const occurrence: LiveOccurrence = {
        id: occurrenceId,
        title,
        description: input.description.trim(),
        startAt: startAtIso,
        expectedMinutes,
        status: 'scheduled',
        conversionStatus: streamError ? 'failed' : 'scheduled',
        audience: input.audience,
        createdByUserId: currentUser.id,
        presenterUserIds: input.presenterUserIds?.length ? input.presenterUserIds : [currentUser.id],
        attendeeIds: [],
        muxLiveStreamId,
        muxPlaybackId,
        muxStreamKey,
        resultingCourseId: null,
        muxErrorMessage: streamError,
      }
      setState((prev) => ({
        ...prev,
        liveOccurrences: [...prev.liveOccurrences, occurrence].sort((a, b) => a.startAt.localeCompare(b.startAt)),
      }))
      return { ok: true, occurrence }
    },
    [currentUser, currentUserRole],
  )

  const syncLiveOccurrenceStatus = useCallback(
    async (occurrenceId: string): Promise<ActionResult> => {
      const occurrence = state.liveOccurrences.find((item) => item.id === occurrenceId)
      if (!occurrence) return { ok: false, message: 'Live occurrence not found.' }
      if (!occurrence.muxLiveStreamId || occurrence.muxLiveStreamId.startsWith('local-')) {
        return { ok: false, message: 'This occurrence has no live stream assigned yet.' }
      }
      try {
        const live = await getMuxLiveStream(occurrence.muxLiveStreamId)
        const statusRaw = (live.status ?? '').toLowerCase()
        const nextStatus: LiveOccurrence['status'] =
          statusRaw === 'active' ? 'live' : live.recentAssetId ? 'ended' : 'scheduled'
        const nextConversion: LiveOccurrence['conversionStatus'] =
          statusRaw === 'active'
            ? 'live'
            : live.recentAssetId
              ? occurrence.resultingCourseId
                ? 'draft_created'
                : 'asset_ready'
              : 'scheduled'

        let assetPlaybackId = live.playbackId
        let expectedMinutes = occurrence.expectedMinutes
        if (live.recentAssetId) {
          const asset = await getMuxAsset(live.recentAssetId)
          if (asset.playbackId) {
            assetPlaybackId = asset.playbackId
          }
          if (asset.durationSeconds != null) {
            expectedMinutes = muxDurationSecondsToMinutes(asset.durationSeconds)
          }
        }
        setState((prev) => {
          const nextDraft: AppState = {
            ...prev,
            liveOccurrences: prev.liveOccurrences.map((item) =>
              item.id === occurrenceId
                ? {
                    ...item,
                    status: nextStatus,
                    conversionStatus: nextConversion,
                    muxPlaybackId: assetPlaybackId ?? item.muxPlaybackId,
                    muxAssetId: live.recentAssetId ?? item.muxAssetId,
                    expectedMinutes,
                    muxErrorMessage: undefined,
                  }
                : item,
            ),
          }
          return nextStatus === 'ended'
            ? finalizeLiveOccurrenceAttendanceInDraft(nextDraft, occurrenceId)
            : nextDraft
        })
        return { ok: true }
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Could not refresh live status.'
        setState((prev) => ({
          ...prev,
          liveOccurrences: prev.liveOccurrences.map((item) =>
            item.id === occurrenceId ? { ...item, conversionStatus: 'failed', muxErrorMessage: message } : item,
          ),
        }))
        return { ok: false, message }
      }
    },
    [state.liveOccurrences, finalizeLiveOccurrenceAttendanceInDraft],
  )

  const provisionLiveRehearsalStream = useCallback(async (): Promise<ActionResult> => {
    if (!currentUser || !canConfigureRehearsal(currentUserRole)) {
      return { ok: false, message: 'Only content admins can configure rehearsal.' }
    }
    try {
      const rehearsal = isMuxFunctionConfigured()
        ? await getOrCreateMuxRehearsalStream()
        : { liveStreamId: 'local-rehearsal', playbackId: null, streamKey: null }
      setState((prev) => ({
        ...prev,
        liveRehearsal: {
          id: prev.liveRehearsal?.id ?? 'rehearsal-default',
          title: prev.liveRehearsal?.title ?? 'Presenter rehearsal stream',
          guidance:
            prev.liveRehearsal?.guidance ??
            'Use this stream to validate camera, microphone, and screen-share before going live.',
          muxLiveStreamId: rehearsal.liveStreamId,
          muxPlaybackId: rehearsal.playbackId ?? undefined,
          muxStreamKey: rehearsal.streamKey ?? undefined,
          updatedAt: new Date().toISOString(),
        },
      }))
      return { ok: true }
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : 'Could not configure rehearsal stream.' }
    }
  }, [currentUser, currentUserRole])

  const transcriptForCurrentUser = useMemo(
    () => state.transcript.filter((entry) => entry.userId === currentUserId),
    [state.transcript, currentUserId],
  )

  const value = useMemo<AppStoreContextValue>(
    () => ({
      state,
      currentUserId,
      currentUser,
      currentUserRole,
      ...state,
      setCurrentUser: setCurrentUserId,
      syncAuthUser,
      issueInvite,
      inviteUser,
      sendInviteEmail,
      deletePendingInvite,
      acceptInvite,
      suspendUser,
      deleteUser,
      enrollInCourse,
      markVideoWatched,
      recordVideoPlayback,
      submitQuizAttempt,
      updateCourseQuiz,
      deleteCourseQuizQuestion,
      createCourse,
      updateCourseDetails,
      deleteDraftCourse,
      transitionCourseStatus,
      updateCourseVideo,
      createLiveOccurrence,
      syncLiveOccurrenceStatus,
      provisionLiveRehearsalStream,
      markLiveOccurrenceAttendance,
      startLiveOccurrenceWatch,
      heartbeatLiveOccurrenceWatch,
      stopLiveOccurrenceWatch,
      finalizeLiveOccurrenceAttendance,
      getCourseReadiness,
      getActiveEnrollment,
      transcriptForCurrentUser,
      coursesSyncStatus,
      coursesSyncMessage,
      clearCoursesSyncMessage,
      videoProcessingProgress,
      setVideoUploadProgress,
      setVideoTranscriptionProgress,
      clearVideoProcessingProgress,
    }),
    [
      state,
      currentUserId,
      currentUser,
      currentUserRole,
      syncAuthUser,
      issueInvite,
      inviteUser,
      sendInviteEmail,
      deletePendingInvite,
      acceptInvite,
      suspendUser,
      deleteUser,
      enrollInCourse,
      markVideoWatched,
      recordVideoPlayback,
      submitQuizAttempt,
      updateCourseQuiz,
      deleteCourseQuizQuestion,
      createCourse,
      updateCourseDetails,
      deleteDraftCourse,
      transitionCourseStatus,
      updateCourseVideo,
      createLiveOccurrence,
      syncLiveOccurrenceStatus,
      provisionLiveRehearsalStream,
      markLiveOccurrenceAttendance,
      startLiveOccurrenceWatch,
      heartbeatLiveOccurrenceWatch,
      stopLiveOccurrenceWatch,
      finalizeLiveOccurrenceAttendance,
      getCourseReadiness,
      getActiveEnrollment,
      transcriptForCurrentUser,
      coursesSyncStatus,
      coursesSyncMessage,
      clearCoursesSyncMessage,
      videoProcessingProgress,
      setVideoUploadProgress,
      setVideoTranscriptionProgress,
      clearVideoProcessingProgress,
    ],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

