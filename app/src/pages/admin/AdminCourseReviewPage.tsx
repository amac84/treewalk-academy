import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { COURSE_STATUS_LABELS, getCourseHours, useCourseWorkflowScope } from './courseWorkflow'

export function AdminCourseReviewPage() {
  const { store, editableCourses } = useCourseWorkflowScope()
  const reviewCourses = editableCourses.filter((course) => course.status === 'review')

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Review queue</h1>
        <p className="page-subtitle">
          This page has one objective: make publish-or-return decisions for review-ready courses.
        </p>
      </header>

      {reviewCourses.length === 0 ? (
        <article className="empty-state">
          <h2>No courses in review</h2>
          <p>Draft owners can submit courses here when prep is complete.</p>
          <Link className="link-button" to="/admin/courses/drafts">
            Go to draft prep
          </Link>
        </article>
      ) : (
        <div className="workflow-list">
          {reviewCourses.map((course) => (
            <article key={course.id} className="workflow-card stack-sm">
              <header className="section-head">
                <div>
                  <p className="section-eyebrow">{COURSE_STATUS_LABELS.review}</p>
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
                    store.transitionCourseStatus(course.id, 'draft')
                  }}
                >
                  Return to draft
                </button>
                <button
                  type="button"
                  onClick={() => {
                    store.transitionCourseStatus(course.id, 'published')
                  }}
                >
                  Publish course
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/admin/courses/drafts"
        backLabel="Previous: Draft prep"
        nextTo="/admin/courses/published"
        nextLabel="Next: Published"
      />
    </section>
  )
}
