import type { AppState, LearnerProfileStub, Progress, User } from '../types'

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizeLearnerProfiles(raw: unknown): LearnerProfileStub[] {
  if (!Array.isArray(raw)) return []
  const out: LearnerProfileStub[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const userId = typeof o.userId === 'string' ? o.userId.trim() : ''
    const email = typeof o.email === 'string' ? o.email.trim() : ''
    if (userId && email.includes('@')) out.push({ userId, email })
  }
  return out
}

function parseProgressKey(key: string): { userId: string; courseId: string } | null {
  const i = key.indexOf('::')
  if (i <= 0) return null
  return { userId: key.slice(0, i), courseId: key.slice(i + 2) }
}

function mergeProgressPreferMoreWatch(a: Progress, b: Progress, canonicalUserId: string, courseId: string): Progress {
  if (a.watchedMinutes >= b.watchedMinutes) {
    return { ...a, userId: canonicalUserId, courseId }
  }
  return { ...b, userId: canonicalUserId, courseId }
}

function dedupeLearnerProfiles(profiles: LearnerProfileStub[]): LearnerProfileStub[] {
  const seen = new Set<string>()
  const out: LearnerProfileStub[] = []
  for (const p of profiles) {
    if (seen.has(p.userId)) continue
    seen.add(p.userId)
    out.push(p)
  }
  return out
}

/**
 * When a learner signs in with Clerk, their academy `User.id` becomes the Clerk user id.
 * Prior pilot data (invite acceptance, pre-Clerk sessions) may still use another id with the same email.
 * Remap persisted learner runtime so transcript, enrollments, and related rows attach to the Clerk id.
 *
 * Uses `users` and persisted `learnerProfiles` (email ↔ legacy id) to find rows to rewrite.
 */
export function migrateLearnerRuntimeForClerkLogin(state: AppState, canonical: User): AppState {
  const email = normalizeEmail(canonical.email)
  if (!email.includes('@')) return state

  const fromUsers = state.users
    .filter((u) => u.id !== canonical.id && normalizeEmail(u.email) === email)
    .map((u) => u.id)
  const fromProfiles = state.learnerProfiles
    .filter((p) => p.userId !== canonical.id && normalizeEmail(p.email) === email)
    .map((p) => p.userId)

  const legacyIds = [...new Set([...fromUsers, ...fromProfiles])]
  if (legacyIds.length === 0) return state

  const legacy = new Set(legacyIds)
  const rewrite = (userId: string) => (legacy.has(userId) ? canonical.id : userId)

  const nextEnrollments = state.enrollments.map((e) => ({
    ...e,
    userId: rewrite(e.userId),
    quizAttempts: e.quizAttempts.map((a) => ({ ...a, userId: rewrite(a.userId) })),
  }))

  const nextTranscript = state.transcript.map((t) => ({ ...t, userId: rewrite(t.userId) }))
  const nextCompletions = state.completions.map((c) => ({ ...c, userId: rewrite(c.userId) }))
  const nextCertificates = state.certificates.map((c) => ({ ...c, userId: rewrite(c.userId) }))
  const nextCpdLedger = state.cpdLedger.map((c) => ({ ...c, userId: rewrite(c.userId) }))
  const nextActivity = state.learningActivityLog.map((e) => ({ ...e, userId: rewrite(e.userId) }))

  const nextWebinars = state.webinars.map((w) => ({
    ...w,
    attendeeIds: w.attendeeIds.map((id) => rewrite(id)),
  }))

  const nextWebinarAttendances = state.webinarAttendances.map((wa) => ({
    ...wa,
    userId: rewrite(wa.userId),
  }))

  const nextAudit = state.auditEvents.map((ev) => ({
    ...ev,
    actorUserId: rewrite(ev.actorUserId),
  }))

  const nextProgress: Record<string, Progress> = {}
  for (const [key, val] of Object.entries(state.progress)) {
    const parsed = parseProgressKey(key)
    if (!parsed) {
      nextProgress[key] = val
      continue
    }
    const userId = rewrite(parsed.userId)
    const courseId = parsed.courseId
    const newKey = `${userId}::${courseId}`
    const adjusted: Progress = { ...val, userId, courseId }
    const existing = nextProgress[newKey]
    nextProgress[newKey] = existing
      ? mergeProgressPreferMoreWatch(existing, adjusted, userId, courseId)
      : adjusted
  }

  const nextUsers = state.users.filter((u) => !legacy.has(u.id))

  const nextLearnerProfiles = dedupeLearnerProfiles(
    state.learnerProfiles
      .map((p) =>
        legacy.has(p.userId) ? { userId: canonical.id, email: canonical.email.trim() } : p,
      )
      .concat([{ userId: canonical.id, email: canonical.email.trim() }]),
  )

  return {
    ...state,
    users: nextUsers,
    learnerProfiles: nextLearnerProfiles,
    enrollments: nextEnrollments,
    transcript: nextTranscript,
    completions: nextCompletions,
    certificates: nextCertificates,
    cpdLedger: nextCpdLedger,
    learningActivityLog: nextActivity,
    webinars: nextWebinars,
    webinarAttendances: nextWebinarAttendances,
    auditEvents: nextAudit,
    progress: nextProgress,
  }
}
