import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { REQUIRED_PASSING_SCORE } from '../constants'
import { mockInitialState } from '../data/mockData'
import { persistCourseToSupabase, loadCoursesFromSupabase } from '../lib/coursePersistence'
import { calculateCPDHours } from '../lib/cpd'
import { getSupabaseBrowserClient } from '../lib/supabaseClient'
import {
  canMarkSegmentWatched,
  evaluateCompletion,
  getLatestPassedAttempt,
  scoreQuizAttempt,
} from '../lib/courseLogic'
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
  QuizAttempt,
  User,
  UserRole,
} from '../types'
import {
  AppStoreContext,
  type AppStoreContextValue,
  type CreateCourseInput,
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

/** Who may attach or replace Mux assets on course segments (matches AdminCoursesPage visibility). */
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
  const [coursesSyncStatus, setCoursesSyncStatus] = useState<CoursesSyncStatus>(() =>
    getSupabaseBrowserClient() ? 'loading' : 'local_only',
  )
  const [coursesSyncMessage, setCoursesSyncMessage] = useState<string | null>(null)

  const clearCoursesSyncMessage = useCallback(() => setCoursesSyncMessage(null), [])

  useEffect(() => {
    if (!getSupabaseBrowserClient()) {
      return
    }

    let cancelled = false
    void (async () => {
      setCoursesSyncStatus('loading')
      try {
        const merged = await loadCoursesFromSupabase(mockInitialState.courses)
        if (cancelled) return
        setState((s) => ({ ...s, courses: merged }))
        setCoursesSyncStatus('synced')
        setCoursesSyncMessage(null)
      } catch (e) {
        if (cancelled) return
        setCoursesSyncStatus('error')
        setCoursesSyncMessage(e instanceof Error ? e.message : 'Could not load courses from Supabase.')
      }
    })()

    return () => {
      cancelled = true
    }
  }, [])

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
      const cpdHours = course.cpdHoursOverride ?? calculateCPDHours(course.videoMinutes)

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
            verificationCode: `TW-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
            issuedAt: now,
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
        watchedSegmentIds: [],
        watchedMinutes: 0,
        quizAttempts: [],
      }

      setState((prev) => ({ ...prev, enrollments: [...prev.enrollments, enrollment] }))
      return { ok: true }
    },
    [currentUser, state.courses, getActiveEnrollment],
  )

  const markSegmentWatched = useCallback(
    (courseId: string, segmentId: string): ActionResult => {
      if (!currentUser) return { ok: false, message: 'Please sign in.' }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }

      const enrollment = getActiveEnrollment(currentUser.id, courseId)
      if (!enrollment) return { ok: false, message: 'Enroll first.' }

      const allowed = canMarkSegmentWatched(course, enrollment.watchedSegmentIds, segmentId)
      if (!allowed.allowed) {
        return { ok: false, message: allowed.message }
      }
      if (enrollment.watchedSegmentIds.includes(segmentId)) return { ok: true }

      const segment = course.segments.find((item) => item.id === segmentId)
      if (!segment) return { ok: false, message: 'Segment not found.' }

      setState((prev) => {
        const nextEnrollments = prev.enrollments.map((item) =>
          item.id === enrollment.id
            ? {
                ...item,
                watchedSegmentIds: [...item.watchedSegmentIds, segmentId],
                watchedMinutes: Math.min(course.videoMinutes, item.watchedMinutes + segment.durationMinutes),
              }
            : item,
        )

        const updated = nextEnrollments.find((item) => item.id === enrollment.id)
        if (!updated) return prev

        const progressKey = `${currentUser.id}::${courseId}`
        const nextProgress = {
          ...prev.progress,
          [progressKey]: {
            userId: currentUser.id,
            courseId,
            watchedSegmentIds: updated.watchedSegmentIds,
            watchedMinutes: updated.watchedMinutes,
            lastWatchedAt: new Date().toISOString(),
          },
        }

        const draft = { ...prev, enrollments: nextEnrollments, progress: nextProgress }
        return appendCompletionArtifacts(draft, updated)
      })

      return { ok: true }
    },
    [currentUser, state.courses, getActiveEnrollment, appendCompletionArtifacts],
  )

  const submitQuizAttempt = useCallback(
    (courseId: string, answers: Record<string, string>): QuizAttempt | null => {
      if (!currentUser) return null
      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return null

      const enrollment = getActiveEnrollment(currentUser.id, courseId)
      if (!enrollment) return null

      let created: QuizAttempt | null = null

      setState((prev) => {
        const targetEnrollment = prev.enrollments.find((item) => item.id === enrollment.id)
        if (!targetEnrollment) return prev

        const score = scoreQuizAttempt(course.quiz, answers)
        const attempt: QuizAttempt = {
          id: createId('qa'),
          userId: currentUser.id,
          courseId,
          answers,
          scorePercent: score,
          passed: score >= REQUIRED_PASSING_SCORE,
          submittedAt: new Date().toISOString(),
          attemptNumber: targetEnrollment.quizAttempts.length + 1,
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

  const createCourse = useCallback(
    (input: CreateCourseInput): { ok: true; course: Course } | { ok: false; message: string } => {
      if (!currentUser || !canAuthorCourses(currentUserRole)) {
        return { ok: false, message: 'You do not have permission to create courses.' }
      }

      const title = input.title.trim()
      if (!title) return { ok: false, message: 'Course title is required.' }
      if (input.segments.length === 0) {
        return { ok: false, message: 'At least one segment is required.' }
      }

      const now = new Date().toISOString()
      const sanitizedSegments = input.segments.map((segment, index) => ({
        id: createId('seg'),
        title: segment.title.trim() || `Segment ${index + 1}`,
        durationMinutes: Math.max(1, Math.round(segment.durationMinutes)),
        order: index + 1,
        muxStatus: 'idle' as const,
        transcriptStatus: 'idle' as const,
      }))
      const totalMinutes = sanitizedSegments.reduce((sum, segment) => sum + segment.durationMinutes, 0)

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
        segments: sanitizedSegments,
        quiz: input.quiz ?? [],
      }

      setState((prev) => ({ ...prev, courses: [course, ...prev.courses] }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(course).then((r) => {
          if (!r.ok) {
            setCoursesSyncMessage(`Could not save course to Supabase: ${r.message}`)
          }
        })
      }
      return { ok: true, course }
    },
    [currentUser, currentUserRole],
  )

  const addCourseSegment = useCallback(
    (courseId: string, segment: Pick<CourseSegment, 'title' | 'durationMinutes'>): ActionResult => {
      if (!currentUser || !currentUserRole) {
        return { ok: false, message: 'Please sign in.' }
      }
      if (!segment.title.trim()) {
        return { ok: false, message: 'Segment title is required.' }
      }

      const course = state.courses.find((entry) => entry.id === courseId)
      if (!course) return { ok: false, message: 'Course not found.' }
      if (!canManageCourseMux(currentUserRole, course, currentUser.id)) {
        return { ok: false, message: 'You do not have permission to edit this course.' }
      }

      const now = new Date().toISOString()
      const nextSegment: CourseSegment = {
        id: createId('seg'),
        title: segment.title.trim(),
        durationMinutes: Math.max(1, Math.round(segment.durationMinutes)),
        order: course.segments.length + 1,
        muxStatus: 'idle',
        transcriptStatus: 'idle',
      }
      const nextCourse: Course = {
        ...course,
        updatedAt: now,
        videoMinutes: course.videoMinutes + nextSegment.durationMinutes,
        segments: [...course.segments, nextSegment],
      }

      setState((prev) => ({
        ...prev,
        courses: prev.courses.map((entry) => (entry.id === courseId ? nextCourse : entry)),
      }))
      if (getSupabaseBrowserClient()) {
        void persistCourseToSupabase(nextCourse).then((r) => {
          if (!r.ok) {
            setCoursesSyncMessage(`Could not save course to Supabase: ${r.message}`)
          }
        })
      }
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
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
            setCoursesSyncMessage(`Could not save course to Supabase: ${r.message}`)
          }
        })
      }
      return { ok: true }
    },
    [currentUser, currentUserRole, state.courses],
  )

  const updateCourseSegmentMux = useCallback(
    (
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
    ) => {
      setState((prev) => {
        const course = prev.courses.find((c) => c.id === courseId)
        if (!course) return prev
        if (!canManageCourseMux(currentUserRole, course, currentUserId)) return prev
        const now = new Date().toISOString()
        const nextCourse: Course = {
          ...course,
          updatedAt: now,
          segments: course.segments.map((segment) =>
            segment.id !== segmentId ? segment : { ...segment, ...mux },
          ),
        }
        if (getSupabaseBrowserClient()) {
          void persistCourseToSupabase(nextCourse).then((r) => {
            if (!r.ok) {
              setCoursesSyncMessage(`Could not save course to Supabase: ${r.message}`)
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
              setCoursesSyncMessage(`Could not save course to Supabase: ${r.message}`)
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
      markSegmentWatched,
      submitQuizAttempt,
      createCourse,
      addCourseSegment,
      updateCourseDetails,
      transitionCourseStatus,
      updateCourseSegmentMux,
      toggleWebinarAttendance,
      getCourseReadiness,
      getActiveEnrollment,
      transcriptForCurrentUser,
      coursesSyncStatus,
      coursesSyncMessage,
      clearCoursesSyncMessage,
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
      markSegmentWatched,
      submitQuizAttempt,
      createCourse,
      addCourseSegment,
      updateCourseDetails,
      transitionCourseStatus,
      updateCourseSegmentMux,
      toggleWebinarAttendance,
      getCourseReadiness,
      getActiveEnrollment,
      transcriptForCurrentUser,
      coursesSyncStatus,
      coursesSyncMessage,
      clearCoursesSyncMessage,
    ],
  )

  return <AppStoreContext.Provider value={value}>{children}</AppStoreContext.Provider>
}

