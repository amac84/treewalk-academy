import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import type { CourseLevel, CourseTopic } from '../../types'
import {
  COURSE_LEVELS,
  COURSE_TOPICS,
  type CourseDetailsDraft,
  courseDetailsDraftDirty,
  courseDetailsDraftFromCourse,
  getCourseHours,
  isCourseDetailsSaveable,
  useCourseWorkflowScope,
} from './courseWorkflow'

const AUTOSAVE_DEBOUNCE_MS = 900
const SAVED_STATUS_CLEAR_MS = 2500

type AutoSaveUiStatus = 'idle' | 'saving' | 'saved'

export function AdminCourseDraftsPage() {
  const { store, editableCourses, canAssignInstructor, instructorOptions } = useCourseWorkflowScope()
  const [error, setError] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [courseDrafts, setCourseDrafts] = useState<Record<string, CourseDetailsDraft>>({})
  const [autoSaveStatus, setAutoSaveStatus] = useState<Record<string, AutoSaveUiStatus>>({})

  const drafts = useMemo(
    () => editableCourses.filter((course) => course.status === 'draft'),
    [editableCourses],
  )

  const courseDraftsRef = useRef(courseDrafts)
  courseDraftsRef.current = courseDrafts

  const storeRef = useRef(store)
  storeRef.current = store

  const savedClearTimeoutsRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  useEffect(
    () => () => {
      Object.values(savedClearTimeoutsRef.current).forEach(clearTimeout)
    },
    [],
  )

  useEffect(() => {
    const debounceTimers: ReturnType<typeof setTimeout>[] = []
    const touchedIds = Object.keys(courseDrafts).filter((id) => drafts.some((c) => c.id === id))

    for (const courseId of touchedIds) {
      const course = drafts.find((c) => c.id === courseId)
      if (!course) continue

      const draftOverlay = courseDrafts[courseId]
      const draft = draftOverlay ?? courseDetailsDraftFromCourse(course)
      if (!courseDetailsDraftDirty(draft, course, canAssignInstructor)) continue
      if (!isCourseDetailsSaveable(draft)) continue

      debounceTimers.push(
        setTimeout(() => {
          const latestCourse = storeRef.current.state.courses.find((c) => c.id === courseId)
          if (!latestCourse || latestCourse.status !== 'draft') return

          const overlay = courseDraftsRef.current[courseId]
          const latestDraft = overlay ?? courseDetailsDraftFromCourse(latestCourse)
          if (!courseDetailsDraftDirty(latestDraft, latestCourse, canAssignInstructor)) return
          if (!isCourseDetailsSaveable(latestDraft)) return

          setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'saving' }))
          const result = storeRef.current.updateCourseDetails(courseId, latestDraft)
          if (!result.ok) {
            setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'idle' }))
            setError(result.message ?? 'Could not save course details.')
            return
          }
          setError(null)
          setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'saved' }))

          const prevClear = savedClearTimeoutsRef.current[courseId]
          if (prevClear) clearTimeout(prevClear)
          savedClearTimeoutsRef.current[courseId] = setTimeout(() => {
            setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'idle' }))
            delete savedClearTimeoutsRef.current[courseId]
          }, SAVED_STATUS_CLEAR_MS)
        }, AUTOSAVE_DEBOUNCE_MS),
      )
    }

    return () => debounceTimers.forEach(clearTimeout)
  }, [courseDrafts, drafts, canAssignInstructor])

  const deleteDraft = async (course: { id: string; title: string }) => {
    const label = course.title.trim() || 'this draft'
    if (
      !window.confirm(
        `Delete “${label}”? This removes the draft from the shared catalog permanently. This cannot be undone.`,
      )
    ) {
      return
    }
    setDeletingId(course.id)
    setError(null)
    const result = await store.deleteDraftCourse(course.id)
    setDeletingId(null)
    if (!result.ok) {
      setError(result.message ?? 'Could not delete draft.')
      return
    }
    setCourseDrafts((prev) => {
      const next = { ...prev }
      delete next[course.id]
      return next
    })
  }

  const getCourseDraft = (course: {
    id: string
    title: string
    summary: string
    description: string
    category: string
    topic: CourseTopic
    level: CourseLevel
    instructorId: string
  }): CourseDetailsDraft => courseDrafts[course.id] ?? courseDetailsDraftFromCourse(course)

  const updateCourseDraft = <K extends keyof CourseDetailsDraft>(
    courseId: string,
    key: K,
    value: CourseDetailsDraft[K],
    fallback: CourseDetailsDraft,
  ) => {
    setCourseDrafts((prev) => ({
      ...prev,
      [courseId]: {
        ...(prev[courseId] ?? fallback),
        [key]: value,
      },
    }))
  }

  const saveCourseDetailsNow = (courseId: string, fallback: CourseDetailsDraft) => {
    const draft = courseDrafts[courseId] ?? fallback
    const result = store.updateCourseDetails(courseId, draft)
    if (!result.ok) {
      setError(result.message ?? 'Could not save course details.')
      return
    }
    setError(null)
    setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'saved' }))
    const prevClear = savedClearTimeoutsRef.current[courseId]
    if (prevClear) clearTimeout(prevClear)
    savedClearTimeoutsRef.current[courseId] = setTimeout(() => {
      setAutoSaveStatus((prev) => ({ ...prev, [courseId]: 'idle' }))
      delete savedClearTimeoutsRef.current[courseId]
    }, SAVED_STATUS_CLEAR_MS)
  }

  const sendDraftToReview = (course: (typeof drafts)[number], draft: CourseDetailsDraft) => {
    if (courseDetailsDraftDirty(draft, course, canAssignInstructor)) {
      if (!isCourseDetailsSaveable(draft)) {
        setError('Add a title, summary, description, and category before sending to review.')
        return
      }
      const saveResult = store.updateCourseDetails(course.id, draft)
      if (!saveResult.ok) {
        setError(saveResult.message ?? 'Could not save course details.')
        return
      }
    }
    setError(null)
    const result = store.transitionCourseStatus(course.id, 'review')
    setError(result.ok ? null : (result.message ?? null))
  }

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Prepare draft courses</h1>
        <p className="page-subtitle">
          This page has one objective: ensure draft quality before submitting to review.
        </p>
      </header>

      {error ? <p className="inline-error">{error}</p> : null}

      {drafts.length === 0 ? (
        <article className="empty-state">
          <h2>No drafts to prepare</h2>
          <p>Create a new draft to start the workflow.</p>
          <Link className="link-button" to="/admin/courses/new">
            Create draft
          </Link>
        </article>
      ) : (
        <div className="workflow-list">
          {drafts.map((course) => {
            const draft = getCourseDraft(course)
            return (
              <article key={course.id} className="workflow-card stack-sm">
                <header className="section-head">
                  <div>
                    <h2>{course.title}</h2>
                    <p className="meta-line">
                      1 video · {course.videoMinutes} min · {getCourseHours(course).toFixed(2)} CPD
                    </p>
                  </div>
                  <div className="button-row" style={{ alignItems: 'center' }}>
                    <Link className="link-button" to={`/courses/${course.id}`}>
                      Preview learner view
                    </Link>
                    <Link className="link-button" to={`/admin/courses/${course.id}/quiz-bank`}>
                      Review quiz bank
                    </Link>
                    <button
                      type="button"
                      className="button--secondary"
                      disabled={deletingId === course.id}
                      onClick={() => void deleteDraft(course)}
                    >
                      {deletingId === course.id ? 'Deleting…' : 'Delete draft'}
                    </button>
                  </div>
                </header>

                <section
                  className="draft-catalog-section stack-sm"
                  aria-labelledby={`draft-catalog-${course.id}`}
                >
                  <h3 id={`draft-catalog-${course.id}`}>Catalog and course page</h3>
                  <p className="muted small-copy">
                    Learners see this copy in the catalog and on the course page. CPD hours come from total video
                    length on the course - this block is metadata and presentation only. Valid changes save on their own
                    shortly after you stop editing; use Save now if you want an immediate write. Nothing here is sent for
                    review until you choose that explicitly.
                  </p>

                  <label htmlFor={`course-title-${course.id}`}>
                    Title
                    <p className="draft-field-hint">Main name in the catalog and at the top of the course view.</p>
                    <input
                      id={`course-title-${course.id}`}
                      type="text"
                      value={draft.title}
                      onChange={(event) => updateCourseDraft(course.id, 'title', event.target.value, draft)}
                      autoComplete="off"
                    />
                  </label>

                  <label htmlFor={`course-summary-${course.id}`}>
                    Summary
                    <p className="draft-field-hint">One-line teaser under the title on catalog tiles.</p>
                    <input
                      id={`course-summary-${course.id}`}
                      type="text"
                      value={draft.summary}
                      onChange={(event) => updateCourseDraft(course.id, 'summary', event.target.value, draft)}
                      placeholder="e.g. Write clearer internal memos in less time"
                      autoComplete="off"
                    />
                  </label>

                  <label htmlFor={`course-description-${course.id}`}>
                    Description
                    <p className="draft-field-hint">
                      Longer overview learners read before they start the course. It is auto-drafted after upload when
                      transcript generation succeeds, and you can revise it here.
                    </p>
                    <textarea
                      id={`course-description-${course.id}`}
                      rows={4}
                      value={draft.description}
                      onChange={(event) => updateCourseDraft(course.id, 'description', event.target.value, draft)}
                      placeholder="What will they learn, and who is it for?"
                    />
                  </label>

                  <div className="draft-meta-row draft-meta-row--triple">
                    <label htmlFor={`course-category-${course.id}`}>
                      Category
                      <p className="draft-field-hint">Your team&apos;s grouping (reporting and browse).</p>
                      <input
                        id={`course-category-${course.id}`}
                        type="text"
                        value={draft.category}
                        onChange={(event) => updateCourseDraft(course.id, 'category', event.target.value, draft)}
                        placeholder="e.g. General, Compliance"
                        autoComplete="off"
                      />
                    </label>
                    <label htmlFor={`course-topic-${course.id}`}>
                      Topic
                      <p className="draft-field-hint">Subject area for filters and analytics.</p>
                      <select
                        id={`course-topic-${course.id}`}
                        value={draft.topic}
                        onChange={(event) =>
                          updateCourseDraft(course.id, 'topic', event.target.value as CourseTopic, draft)
                        }
                      >
                        {COURSE_TOPICS.map((topic) => (
                          <option key={topic} value={topic}>
                            {topic}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label htmlFor={`course-level-${course.id}`}>
                      Level
                      <p className="draft-field-hint">Difficulty label shown to learners.</p>
                      <select
                        id={`course-level-${course.id}`}
                        value={draft.level}
                        onChange={(event) =>
                          updateCourseDraft(course.id, 'level', event.target.value as CourseLevel, draft)
                        }
                      >
                        {COURSE_LEVELS.map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  {canAssignInstructor ? (
                    <label htmlFor={`course-instructor-${course.id}`}>
                      Instructor
                      <p className="draft-field-hint">Displayed on the course detail page.</p>
                      <select
                        id={`course-instructor-${course.id}`}
                        value={draft.instructorId}
                        onChange={(event) =>
                          updateCourseDraft(course.id, 'instructorId', event.target.value, draft)
                        }
                      >
                        {instructorOptions.map((instructor) => (
                          <option key={instructor.id} value={instructor.id}>
                            {instructor.name} ({instructor.role})
                          </option>
                        ))}
                      </select>
                    </label>
                  ) : null}

                  <div className="draft-detail-actions">
                    <p className="muted small-copy">
                      <strong>Save now</strong> writes to storage immediately. <strong>Send to review</strong> moves the
                      course into the review queue and saves valid edits in these fields first.
                    </p>
                    <div className="button-row" style={{ alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                      <button type="button" onClick={() => saveCourseDetailsNow(course.id, draft)}>
                        Save now
                      </button>
                      <button
                        type="button"
                        className="button--secondary"
                        onClick={() => sendDraftToReview(course, draft)}
                      >
                        Send to review
                      </button>
                      {autoSaveStatus[course.id] === 'saving' ? (
                        <span className="muted small-copy" aria-live="polite">
                          Saving…
                        </span>
                      ) : autoSaveStatus[course.id] === 'saved' ? (
                        <span className="muted small-copy" aria-live="polite">
                          Saved
                        </span>
                      ) : null}
                    </div>
                  </div>
                </section>
              </article>
            )
          })}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/admin/courses/new"
        backLabel="Previous: Upload"
        nextTo="/admin/courses/review"
        nextLabel="Next: Review"
      />
    </section>
  )
}
