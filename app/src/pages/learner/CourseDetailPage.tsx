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
    <section className="stack-lg">
      <header className="page-header">
        <h1>{course.title}</h1>
        <p>{course.description}</p>
        <p className="muted">
          {course.category} · {course.level} · {course.videoMinutes} min ·{' '}
          {calculateCPDHours(course.videoMinutes).toFixed(2)} CPD
        </p>
      </header>

      {!enrollment ? (
        <article className="panel">
          <h2>Ready to start?</h2>
          <p>Enroll to unlock the player and quiz.</p>
          <button onClick={() => enrollInCourse(course.id)}>Enroll now</button>
        </article>
      ) : (
        <article className="panel">
          <h2>Your status</h2>
          <p>Video watched: {watchedPercent}%</p>
          <p>
            Quiz: {readiness.quizPassed ? 'Passed' : 'Pending'} ({readiness.latestScore}%)
          </p>
          <p>Completion: <CompletionBadge completed={readiness.completed} /></p>
          <p className="muted">Passing score requirement: {REQUIRED_PASSING_SCORE}%.</p>
        </article>
      )}

      <article className="panel">
        <h2>Course outline</h2>
        <ul>
          {course.segments
            .slice()
            .sort((a, b) => a.order - b.order)
            .map((segment) => (
              <li key={segment.id}>
                {segment.order}. {segment.title} ({segment.durationMinutes} min)
              </li>
            ))}
        </ul>
      </article>

      {enrollment && (
        <article className="panel">
          <h2>Attempts</h2>
          {enrollment.quizAttempts.length === 0 ? (
            <p className="muted">No attempts yet.</p>
          ) : (
            <ul>
              {enrollment.quizAttempts.map((attempt) => (
                <li key={attempt.id}>
                  Attempt {attempt.attemptNumber} · {attempt.scorePercent}% ·{' '}
                  {attempt.passed ? 'Passed' : 'Not passed'} ·{' '}
                  {new Date(attempt.submittedAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </article>
      )}

      <div className="button-row">
        {enrollment ? (
          <>
            <Link className="button button--secondary" to={`/courses/${course.id}/player`}>
              Resume learning
            </Link>
            <Link className="button button--secondary" to={`/courses/${course.id}/quiz`}>
              Open quiz
            </Link>
          </>
        ) : (
          <button onClick={() => enrollInCourse(course.id)}>
            Enroll now
          </button>
        )}
      </div>
    </section>
  )
}
