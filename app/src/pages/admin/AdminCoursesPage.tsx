import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { COURSE_STATUS_LABELS } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { calculateCPDHours } from '../../lib/cpd'
import type { CourseStatus } from '../../types'

const ORDERED_STATUSES: CourseStatus[] = ['draft', 'review', 'published']

export function AdminCoursesPage() {
  const store = useAppStore()
  const [error, setError] = useState<string | null>(null)

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

  return (
    <section className="page">
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

      <div className="workflow-grid">
        {ORDERED_STATUSES.map((status) => {
          const bucket = editableCourses.filter((course) => course.status === status)
          return (
            <section key={status} className="workflow-column">
              <h2>{COURSE_STATUS_LABELS[status]}</h2>
              <p>{bucket.length} course(s)</p>
              <div className="workflow-list">
                {bucket.map((course) => (
                  <article key={course.id} className="workflow-card">
                    <h3>{course.title}</h3>
                    <p>{course.summary}</p>
                    <p className="meta-line">
                      CPD: {(course.cpdHoursOverride ?? calculateCPDHours(course.videoMinutes)).toFixed(2)}h
                    </p>
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
                    <Link to={`/courses/${course.id}`}>Preview learner view</Link>
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
