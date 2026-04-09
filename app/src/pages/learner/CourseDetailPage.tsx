import { Link, useParams } from 'react-router-dom'
import { CompletionBadge } from '../../components/common/CourseCard'
import { REQUIRED_PASSING_SCORE } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { calculateCPDHours } from '../../lib/cpd'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'

export function CourseDetailPage() {
  const { courseId = '' } = useParams()
  const { courses, currentUser, enrollInCourse, getCourseReadiness, getActiveEnrollment } = useAppStore()
  const course = courses.find((item) => item.id === courseId)

  if (!course || !currentUser) {
    return (
      <section className="panel empty-state">
        <h1>Course not found</h1>
        <p>The requested course could not be loaded.</p>
      </section>
    )
  }

  const enrollment = getActiveEnrollment(currentUser.id, course.id)
  const readiness = getCourseReadiness(course.id)
  const watchedPercent = enrollment ? getWatchedPercentFromEnrollment(course, enrollment) : 0

  return (
    <section className="detail-page">
      <header className="detail-hero">
        <div className="detail-hero-main">
          <p className="section-eyebrow">Course brief</p>
          <h1>{course.title}</h1>
          <p className="detail-summary">{course.description}</p>
          <div className="detail-meta">
            <span>{course.category}</span>
            <span>{course.level}</span>
            <span>{course.videoMinutes} min</span>
            <span>{calculateCPDHours(course.videoMinutes).toFixed(2)} CPD</span>
          </div>
        </div>

        {!enrollment ? (
          <aside className="detail-status detail-status--primary">
            <p className="section-eyebrow">Start</p>
            <h2>Ready to begin</h2>
            <p>Enroll to unlock the player, quiz, and completion record.</p>
            <button onClick={() => enrollInCourse(course.id)}>Enroll now</button>
          </aside>
        ) : (
          <aside className="detail-status">
            <p className="section-eyebrow">Readiness</p>
            <div className="detail-status-row">
              <span>Video watched</span>
              <strong>{watchedPercent}%</strong>
            </div>
            <div className="detail-status-row">
              <span>Quiz</span>
              <strong>{readiness.quizPassed ? 'Passed' : 'Pending'} ({readiness.latestScore}%)</strong>
            </div>
            <div className="detail-status-row">
              <span>Completion</span>
              <CompletionBadge completed={readiness.completed} />
            </div>
            <p className="muted">Passing score requirement: {REQUIRED_PASSING_SCORE}%.</p>
            <div className="button-row">
              <Link className="button" to={`/courses/${course.id}/player`}>
                Resume learning
              </Link>
              <Link className="button button--secondary" to={`/courses/${course.id}/quiz`}>
                Open quiz
              </Link>
            </div>
          </aside>
        )}
      </header>

      <div className="detail-grid">
        <article className="detail-outline">
          <div className="section-head">
            <div>
              <p className="section-eyebrow">Outline</p>
              <h2>Course sequence</h2>
            </div>
          </div>
          <ol className="outline-list">
            {course.segments
              .slice()
              .sort((a, b) => a.order - b.order)
              .map((segment) => (
                <li key={segment.id} className="outline-item">
                  <span className="outline-index">{segment.order}</span>
                  <div>
                    <h3>{segment.title}</h3>
                    <p className="muted">{segment.durationMinutes} min segment</p>
                  </div>
                </li>
              ))}
          </ol>
        </article>

        {enrollment ? (
          <article className="detail-attempts">
            <p className="section-eyebrow">Assessment</p>
            <h2>Quiz attempts</h2>
            {enrollment.quizAttempts.length === 0 ? (
              <p className="muted">No attempts yet. Finish the video path, then complete the assessment.</p>
            ) : (
              <ul className="simple-list detail-attempt-list">
                {enrollment.quizAttempts.map((attempt) => (
                  <li key={attempt.id}>
                    <strong>Attempt {attempt.attemptNumber}</strong>
                    <span>
                      {attempt.scorePercent}% · {attempt.passed ? 'Passed' : 'Not passed'}
                    </span>
                    <span className="muted">{new Date(attempt.submittedAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </article>
        ) : (
          <article className="detail-attempts">
            <p className="section-eyebrow">Completion rule</p>
            <h2>What counts as complete</h2>
            <p>
              Completion requires the full video path plus a passing quiz result. Progress stays recorded for
              your CPD evidence trail.
            </p>
          </article>
        )}
      </div>
    </section>
  )
}
