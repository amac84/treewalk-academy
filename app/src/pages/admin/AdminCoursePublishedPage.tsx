import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { COURSE_STATUS_LABELS, getCourseHours, useCourseWorkflowScope } from './courseWorkflow'

export function AdminCoursePublishedPage() {
  const { store, editableCourses } = useCourseWorkflowScope()
  const publishedCourses = editableCourses.filter((course) => course.status === 'published')

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Published catalog management</h1>
        <p className="page-subtitle">
          This page has one objective: govern what is live and move courses back to review when needed.
        </p>
      </header>

      {publishedCourses.length === 0 ? (
        <article className="empty-state">
          <h2>No published courses yet</h2>
          <p>Publish from the review queue when a course is approved.</p>
          <Link className="link-button" to="/admin/courses/review">
            Open review queue
          </Link>
        </article>
      ) : (
        <div className="workflow-list">
          {publishedCourses.map((course) => (
            <article key={course.id} className="workflow-card stack-sm">
              <header className="section-head">
                <div>
                  <p className="section-eyebrow">{COURSE_STATUS_LABELS.published}</p>
                  <h2>{course.title}</h2>
                </div>
                <Link className="link-button" to={`/courses/${course.id}`}>
                  Preview learner view
                </Link>
              </header>

              <p className="section-copy">{course.summary}</p>
              <p className="meta-line">
                {course.topic} · {course.level} · 1 video · {course.videoMinutes} min ·{' '}
                {getCourseHours(course).toFixed(2)} CPD
              </p>

              <div className="button-row">
                <button
                  type="button"
                  className="button--secondary"
                  onClick={() => {
                    store.transitionCourseStatus(course.id, 'review')
                  }}
                >
                  Move back to review
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/admin/courses/review"
        backLabel="Previous: Review"
        nextTo="/admin/courses"
        nextLabel="Workflow overview"
      />
    </section>
  )
}
