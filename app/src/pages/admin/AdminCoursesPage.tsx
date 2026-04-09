import { type FormEvent, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { SegmentMuxUpload } from '../../components/admin/SegmentMuxUpload'
import { COURSE_STATUS_LABELS } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { calculateCPDHours } from '../../lib/cpd'
import {
  createMuxDirectUpload,
  isMuxFunctionConfigured,
  putVideoToMuxUpload,
  transcribeVideoFile,
  waitForMuxPlaybackId,
} from '../../lib/muxEdge'
import type { CourseLevel, CourseStatus, CourseTopic, UserRole } from '../../types'

const ORDERED_STATUSES: CourseStatus[] = ['draft', 'review', 'published']
const COURSE_TOPICS: CourseTopic[] = [
  'Ethics',
  'Tax',
  'Audit',
  'Financial Reporting',
  'Technology',
  'Leadership',
  'Advisory',
]
const COURSE_LEVELS: CourseLevel[] = ['beginner', 'intermediate', 'advanced']
const AUTHOR_ROLES: UserRole[] = ['instructor', 'content_admin', 'super_admin']

type CourseDetailsDraft = {
  title: string
  summary: string
  description: string
  category: string
  topic: CourseTopic
  level: CourseLevel
  instructorId: string
}

export function AdminCoursesPage() {
  const store = useAppStore()
  const [error, setError] = useState<string | null>(null)
  const [starterVideoFile, setStarterVideoFile] = useState<File | null>(null)
  const [starterUploadBusy, setStarterUploadBusy] = useState(false)
  const [starterUploadStatus, setStarterUploadStatus] = useState<string | null>(null)
  const [courseDrafts, setCourseDrafts] = useState<Record<string, CourseDetailsDraft>>({})
  const [segmentDrafts, setSegmentDrafts] = useState<Record<string, { title: string; durationMinutes: string }>>({})
  const canCreateCourse = AUTHOR_ROLES.includes(store.currentUserRole ?? 'learner')
  const canAssignInstructor = store.currentUserRole === 'content_admin' || store.currentUserRole === 'super_admin'

  const instructorOptions = useMemo(
    () => store.users.filter((user) => AUTHOR_ROLES.includes(user.role)),
    [store.users],
  )

  const editableCourses = useMemo(() => {
    return store.courses.filter((course) => {
      if (store.currentUserRole === 'super_admin' || store.currentUserRole === 'content_admin') {
        return true
      }
      if (store.currentUserRole === 'instructor') {
        return course.instructorId === store.currentUserId
      }
      return false
    })
  }, [store.courses, store.currentUserRole, store.currentUserId])

  const inferCourseTitleFromFile = (file: File): string => {
    const dot = file.name.lastIndexOf('.')
    const raw = dot > 0 ? file.name.slice(0, dot) : file.name
    return raw.replace(/[_-]+/g, ' ').trim()
  }

  const handleUploadToStartCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreateCourse) {
      setError('You do not have permission to create courses.')
      return
    }
    if (!isMuxFunctionConfigured()) {
      setError(
        'Video upload is not configured. Set VITE_MUX_FUNCTION_URL in app/.env to your Supabase mux function URL, then restart the dev server.',
      )
      return
    }
    if (!starterVideoFile) {
      setError('Choose a video file first.')
      return
    }

    const title = inferCourseTitleFromFile(starterVideoFile) || 'New Course'
    const create = store.createCourse({
      title,
      summary: '',
      description: '',
      category: '',
      topic: 'Technology',
      level: 'beginner',
      instructorId: store.currentUserId,
      segments: [{ title: 'Main lesson', durationMinutes: 15 }],
    })
    if (!create.ok) {
      setError(create.message)
      return
    }

    const firstSegment = create.course.segments[0]
    if (!firstSegment) {
      setError('Course was created, but first segment is missing.')
      return
    }

    setError(null)
    setStarterUploadBusy(true)
    setStarterUploadStatus('Creating Mux upload...')
    store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
      muxStatus: 'uploading',
      muxErrorMessage: undefined,
      transcriptErrorMessage: undefined,
    })

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '*'
      const { uploadId, uploadUrl } = await createMuxDirectUpload(origin)
      store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
        muxUploadId: uploadId,
        muxStatus: 'uploading',
      })
      setStarterUploadStatus('Uploading video...')
      await putVideoToMuxUpload(uploadUrl, starterVideoFile)
      store.updateCourseSegmentMux(create.course.id, firstSegment.id, { muxStatus: 'processing' })
      setStarterUploadStatus('Processing video in Mux...')
      const { assetId, playbackId } = await waitForMuxPlaybackId(uploadId)
      store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
        muxStatus: 'ready',
        muxErrorMessage: undefined,
      })
      store.updateCourseSegmentMux(create.course.id, firstSegment.id, { transcriptStatus: 'processing' })
      setStarterUploadStatus('Generating transcript with OpenAI...')
      try {
        const transcript = await transcribeVideoFile(starterVideoFile)
        store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
          transcriptText: transcript.text,
          transcriptStatus: 'ready',
          transcriptErrorMessage: undefined,
        })
        setStarterUploadStatus('Video and transcript are ready. Draft course created successfully.')
      } catch (transcriptError) {
        const transcriptMessage =
          transcriptError instanceof Error ? transcriptError.message : 'Transcript generation failed.'
        store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
          transcriptStatus: 'error',
          transcriptErrorMessage: transcriptMessage,
        })
        setStarterUploadStatus('Video is ready. Transcript failed and can be retried with a new upload.')
      }
      setStarterVideoFile(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed.'
      store.updateCourseSegmentMux(create.course.id, firstSegment.id, {
        muxStatus: 'error',
        muxErrorMessage: message,
        transcriptStatus: 'error',
        transcriptErrorMessage: message,
      })
      setError(message)
      setStarterUploadStatus(null)
    } finally {
      setStarterUploadBusy(false)
    }
  }

  const addSegmentToCourse = (courseId: string) => {
    const draft = segmentDrafts[courseId] ?? { title: '', durationMinutes: '10' }
    const durationMinutes = Number(draft.durationMinutes)
    const result = store.addCourseSegment(courseId, {
      title: draft.title,
      durationMinutes: Number.isFinite(durationMinutes) ? durationMinutes : 10,
    })
    if (!result.ok) {
      setError(result.message ?? 'Could not add segment.')
      return
    }
    setError(null)
    setSegmentDrafts((prev) => ({ ...prev, [courseId]: { title: '', durationMinutes: '10' } }))
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
  }): CourseDetailsDraft =>
    courseDrafts[course.id] ?? {
      title: course.title,
      summary: course.summary,
      description: course.description,
      category: course.category,
      topic: course.topic,
      level: course.level,
      instructorId: course.instructorId,
    }

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

  const saveCourseDetails = (courseId: string, fallback: CourseDetailsDraft) => {
    const draft = courseDrafts[courseId] ?? fallback
    const result = store.updateCourseDetails(courseId, draft)
    if (!result.ok) {
      setError(result.message ?? 'Could not save course details.')
      return
    }
    setError(null)
  }

  return (
    <section className="page page-admin page-admin-courses">
      <div className="page-header">
        <div>
          <p className="section-eyebrow">Admin · Course workflow</p>
          <h1>Draft → Review → Publish</h1>
          <p className="section-copy">
            Content state transitions are role-governed and audited for compliance defensibility.
          </p>
        </div>
      </div>

      {error ? <p className="inline-error">{error}</p> : null}

      {canCreateCourse ? (
        <section className="card stack-sm">
          <h2>Upload video to start course</h2>
          <p className="muted small-copy">
            Upload a video to create a draft course with this file as the first segment. The course title is
            taken from the filename; edit summary, description, and category on the draft card in the board
            below.
          </p>
          {!isMuxFunctionConfigured() ? (
            <p className="inline-error small-copy">
              Add <code>VITE_MUX_FUNCTION_URL</code> to <code>app/.env</code> (for example{' '}
              <code>https://YOUR_PROJECT_REF.supabase.co/functions/v1/mux</code>), deploy the <code>mux</code>{' '}
              Edge Function if needed, then restart <code>npm run dev</code>. Vite only picks up env changes
              after a restart.
            </p>
          ) : null}
          <form className="stack-sm" onSubmit={(event) => void handleUploadToStartCourse(event)}>
            <input
              type="file"
              accept="video/*"
              disabled={starterUploadBusy || !isMuxFunctionConfigured()}
              onChange={(event) => {
                setStarterUploadStatus(null)
                setStarterVideoFile(event.target.files?.[0] ?? null)
              }}
              required
            />
            <div className="button-row">
              <button type="submit" disabled={starterUploadBusy || !isMuxFunctionConfigured()}>
                {starterUploadBusy ? 'Uploading...' : 'Upload video to start course'}
              </button>
            </div>
            {starterUploadStatus ? <p className="meta-line">{starterUploadStatus}</p> : null}
          </form>
        </section>
      ) : null}

      <div className="workflow-board">
        {ORDERED_STATUSES.map((status) => {
          const bucket = editableCourses.filter((course) => course.status === status)
          return (
            <section key={status} className="workflow-lane">
              <header className="workflow-lane__head">
                <div>
                  <h2>{COURSE_STATUS_LABELS[status]}</h2>
                  <p className="muted">{bucket.length} course(s)</p>
                </div>
              </header>
              <div className="workflow-list">
                {bucket.map((course) => (
                  <article key={course.id} className="workflow-card">
                    {(() => {
                      const draft = getCourseDraft(course)
                      return (
                        <div className="stack-sm">
                          <input
                            type="text"
                            value={draft.title}
                            onChange={(event) =>
                              updateCourseDraft(course.id, 'title', event.target.value, draft)
                            }
                          />
                          <input
                            type="text"
                            value={draft.summary}
                            onChange={(event) =>
                              updateCourseDraft(course.id, 'summary', event.target.value, draft)
                            }
                          />
                          <textarea
                            rows={3}
                            value={draft.description}
                            onChange={(event) =>
                              updateCourseDraft(course.id, 'description', event.target.value, draft)
                            }
                          />
                          <div className="button-row">
                            <input
                              type="text"
                              value={draft.category}
                              onChange={(event) =>
                                updateCourseDraft(course.id, 'category', event.target.value, draft)
                              }
                            />
                            <select
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
                            <select
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
                          </div>
                          {canAssignInstructor ? (
                            <select
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
                          ) : null}
                          <div className="button-row">
                            <button type="button" onClick={() => saveCourseDetails(course.id, draft)}>
                              Save details
                            </button>
                          </div>
                        </div>
                      )
                    })()}
                    <div className="stack-sm">
                      <h3>{course.title}</h3>
                      <p className="muted">{course.summary}</p>
                      <p className="meta-line">
                        CPD: {(course.cpdHoursOverride ?? calculateCPDHours(course.videoMinutes)).toFixed(2)}h
                      </p>
                    </div>
                    <div className="workflow-card__footer">
                      <div className="button-row">
                        {status !== 'draft' ? (
                          <button
                            type="button"
                            onClick={() => {
                              const next = status === 'published' ? 'review' : 'draft'
                              const result = store.transitionCourseStatus(course.id, next)
                              setError(result.ok ? null : (result.message ?? null))
                            }}
                          >
                            Move back
                          </button>
                        ) : null}

                        {status !== 'published' ? (
                          <button
                            type="button"
                            onClick={() => {
                              const next = status === 'draft' ? 'review' : 'published'
                              const result = store.transitionCourseStatus(course.id, next)
                              setError(result.ok ? null : (result.message ?? null))
                            }}
                          >
                            Advance
                          </button>
                        ) : null}
                      </div>
                      <Link className="link-button" to={`/courses/${course.id}`}>Preview learner view</Link>
                      <details className="mux-course-details stack-sm">
                        <summary className="mux-details-summary">Mux video (per segment)</summary>
                        <p className="muted small-copy">
                          Requires <code>VITE_MUX_FUNCTION_URL</code> and Edge Function secrets. With Supabase
                          configured, uploads persist for all pilot users. For local mock auth, set{' '}
                          <code>MUX_ALLOW_UNAUTHENTICATED=true</code> on the function (never in production).
                        </p>
                        <div className="mux-segment-list stack-sm">
                          {[...course.segments]
                            .sort((a, b) => a.order - b.order)
                            .map((segment) => (
                              <SegmentMuxUpload key={segment.id} courseId={course.id} segment={segment} />
                            ))}
                        </div>
                        <div className="button-row">
                          <input
                            type="text"
                            placeholder="New segment title"
                            value={segmentDrafts[course.id]?.title ?? ''}
                            onChange={(event) =>
                              setSegmentDrafts((prev) => ({
                                ...prev,
                                [course.id]: {
                                  title: event.target.value,
                                  durationMinutes: prev[course.id]?.durationMinutes ?? '10',
                                },
                              }))
                            }
                          />
                          <input
                            type="number"
                            min={1}
                            step={1}
                            placeholder="Minutes"
                            value={segmentDrafts[course.id]?.durationMinutes ?? '10'}
                            onChange={(event) =>
                              setSegmentDrafts((prev) => ({
                                ...prev,
                                [course.id]: {
                                  title: prev[course.id]?.title ?? '',
                                  durationMinutes: event.target.value,
                                },
                              }))
                            }
                          />
                          <button type="button" onClick={() => addSegmentToCourse(course.id)}>
                            Add segment
                          </button>
                        </div>
                      </details>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )
        })}
      </div>
    </section>
  )
}
