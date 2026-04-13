import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { CERTIFICATE_PROVIDER_NAME } from '../constants'
import { mockInitialState } from '../data/mockData'
import {
  deleteCourseFromSupabase,
  loadLearnerRuntimeStateFromSupabase,
  loadCoursesFromSupabase,
  persistLearnerRuntimeState,
  persistCourseToSupabase,
} from '../lib/coursePersistence'
import { getCourseCPDHours } from '../lib/cpd'
import { buildQuizPolicy, ensureQuizPolicy } from '../lib/quizPolicy'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'
import {
  evaluateCompletion,
  getWatchedPercentFromEnrollment,
  getLatestPassedAttempt,
  scoreQuizAttempt,
} from '../lib/courseLogic'
import type {
  AppState,
  Course,
  CourseLevel,
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

const toRuntimeState = (state: AppState) => ({
  enrollments: state.enrollments,
  progress: state.progress,
  completions: state.completions,
  certificates: state.certificates,
  cpdLedger: state.cpdLedger,
  transcript: state.transcript,
  learningActivityLog: state.learningActivityLog,
})

const createQuestionId = (courseId: string, index: number) => `${courseId}-q-${index + 1}`
const createQuestionOptionId = (questionIndex: number, optionIndex: number) =>
  `q${questionIndex + 1}-o${optionIndex + 1}`

const MAX_HEARTBEAT_DELTA_SECONDS = 12
const MAX_POSITION_ADVANCE_SECONDS = 20

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

const sanitizeCourseDetails = (input: UpdateCourseInput): Omit<UpdateCourseInput, 'instructorId'> & { instructorId?: string } => ({
  title: input.title.trim(),
  summary: input.summary.trim(),
  description: input.description.trim(),
  category: input.category.trim(),
  topic: input.topic as CourseTopic,
  level: input.level as CourseLevel,
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
  const [currentUserId, setCurrentUserId] = useState('u-learner-1')
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
        const [merged, runtime] = await Promise.all([
          loadCoursesFromSupabase(mockInitialState.courses),
          loadLearnerRuntimeStateFromSupabase(),
        ])
        if (cancelled) return
        const runtimeEnrollments = runtime?.enrollments
        setState((s) => ({
          ...s,
          courses: merged,
          enrollments: runtimeEnrollments ?? s.enrollments,
          progress: runtime?.progress ?? s.progress,
          completions: runtime?.completions ?? s.completions,
          certificates: runtime?.certificates ?? s.certificates,
          cpdLedger: runtime?.cpdLedger ?? s.cpdLedger,
          transcript: runtime?.transcript ?? s.transcript,
          learningActivityLog: runtime?.learningActivityLog ?? s.learningActivityLog,
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
    coursesSyncStatus,
  ])

  const currentUser = useMemo(
    () => state.users.find((user) => user.id === currentUserId) ?? null,
    [state.users, currentUserId],
  )
  const currentUserRole = currentUser?.role ?? null

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
            providerName: CERTIFICATE_PROVIDER_NAME,
            courseTitle: course.title,
            durationHours: cpdHours,
            completionDate: now,
            quizAttemptId: latestAttempt.id,
            passThreshold: latestAttempt.passThreshold,
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
            providerName: CERTIFICATE_PROVIDER_NAME,
            quizAttemptId: latestAttempt.id,
            passThreshold: latestAttempt.passThreshold,
            activityWatchedMinutes: enrollment.watchedMinutes,
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

        const user: User =
          existing ??
          {
            id: createId('u'),
            name: invite.email.split('@')[0] ?? invite.email,
            email: invite.email,
            role: invite.role,
            status: 'active',
            invitedAt: invite.createdAt,
            joinedAt: now,
          }

        result = { ok: true, user }
        setCurrentUserId(user.id)

        return {
          ...prev,
          invites: prev.invites.map((entry) =>
            entry.id === invite.id ? { ...entry, status: 'accepted', acceptedAt: now } : entry,
          ),
          users: existing ? prev.users : [...prev.users, user],
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

  const enrollInCourse = useCallback(
    (courseId: string): ActionResult => {
      if (!currentUser) return { ok: false, message: 'Please sign in.' }
      if (currentUser.status === 'suspended') return { ok: false, message: 'Account suspended.' }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (course.status !== 'published' && currentUser.role === 'learner') {
        return { ok: false, message: 'Course is not published.' }
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

      const course: Course = {
        id: createId('crs'),
        title,
        summary: input.summary.trim() || 'New course',
        description: input.description.trim() || input.summary.trim() || title,
        category: input.category.trim() || 'General',
        topic: input.topic,
        level: input.level,
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
    async (courseId: string): Promise<ActionResult> => {
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

      const sb = getSupabaseBrowserClient()
      if (sb) {
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

  const toggleWebinarAttendance = useCallback(
    (webinarId: string) => {
      if (!currentUser) return
      setState((prev) => {
        const existing = prev.webinarAttendances.find(
          (item) => item.webinarId === webinarId && item.userId === currentUser.id,
        )

        const nextAttendances = existing
          ? prev.webinarAttendances.filter((item) => item.id !== existing.id)
          : [
              ...prev.webinarAttendances,
              {
                id: createId('wa'),
                webinarId,
                userId: currentUser.id,
                attendedAt: new Date().toISOString(),
              },
            ]

        const nextWebinars = prev.webinars.map((webinar) => {
          if (webinar.id !== webinarId) return webinar

          const attendeeIds = existing
            ? webinar.attendeeIds.filter((id) => id !== currentUser.id)
            : [...new Set([...webinar.attendeeIds, currentUser.id])]
          return { ...webinar, attendeeIds }
        })

        return {
          ...prev,
          webinarAttendances: nextAttendances,
          webinars: nextWebinars,
        }
      })
    },
    [currentUser],
  )

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
      issueInvite,
      inviteUser,
      acceptInvite,
      suspendUser,
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
      toggleWebinarAttendance,
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
      issueInvite,
      inviteUser,
      acceptInvite,
      suspendUser,
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
      toggleWebinarAttendance,
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

