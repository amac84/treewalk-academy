import { Link } from 'react-router-dom'
import { COURSE_STATUS_LABELS, ORDERED_STATUSES, useCourseWorkflowScope } from './courseWorkflow'

export function AdminCoursesPage() {
  const { editableCourses, canCreateCourse } = useCourseWorkflowScope()
  const counts = ORDERED_STATUSES.reduce<Record<string, number>>((acc, status) => {
    acc[status] = editableCourses.filter((course) => course.status === status).length
    return acc
  }, {})

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Course workflow overview</h1>
        <p className="page-subtitle">
          Move left to right through the workflow bar above: upload, prep, review, then publish.
        </p>
      </header>

      <article className="workflow-card stack-sm course-workflow-overview-card">
        <h2>Live workflow counts</h2>
        <ul className="course-workflow-stats">
          <li>
            <span>{COURSE_STATUS_LABELS.draft}</span>
            <strong>{counts.draft ?? 0}</strong>
          </li>
          <li>
            <span>{COURSE_STATUS_LABELS.review}</span>
            <strong>{counts.review ?? 0}</strong>
          </li>
          <li>
            <span>{COURSE_STATUS_LABELS.published}</span>
            <strong>{counts.published ?? 0}</strong>
          </li>
        </ul>
        <div className="button-row">
          {canCreateCourse ? (
            <Link className="link-button" to="/admin/courses/new">
              Start upload
            </Link>
          ) : null}
          <Link className="link-button" to="/admin/courses/drafts">
            Open draft prep
          </Link>
          <Link className="link-button" to="/admin/courses/review">
            Open review
          </Link>
          <Link className="link-button" to="/admin/courses/published">
            Open published
          </Link>
        </div>
      </article>
    </section>
  )
}
