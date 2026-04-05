import { Link } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { calculateCPDHours, formatCpdHours } from '../../lib/cpd'

export function HomePage() {
  const { currentUser, currentUserId, courses, enrollments, webinars, getCourseReadiness } = useAppStore()

  const userEnrollments = enrollments.filter((entry) => entry.userId === currentUserId)

  const continueLearning = userEnrollments
    .map((enrollment) => {
      const course = courses.find((entry) => entry.id === enrollment.courseId)
      if (!course) return null
      return {
        course,
        readiness: getCourseReadiness(course.id, currentUserId),
      }
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .filter((entry) => !entry.readiness.completed)
    .slice(0, 3)

  const recommended = courses
    .filter((course) => course.status === 'published')
    .filter((course) => !userEnrollments.some((enrollment) => enrollment.courseId === course.id))
    .slice(0, 4)

  const upcomingWebinars = webinars
    .filter((webinar) => webinar.status === 'upcoming')
    .sort((a, b) => a.startAt.localeCompare(b.startAt))
    .slice(0, 3)

  const cpdHours = userEnrollments.reduce((total, enrollment) => {
    if (!enrollment.completedAt) return total
    const course = courses.find((entry) => entry.id === enrollment.courseId)
    if (!course) return total
    return total + calculateCPDHours(course.videoMinutes)
  }, 0)

  return (
    <main className="page">
      <header className="page-header">
        <h1>Welcome back{currentUser ? `, ${currentUser.name}` : ''}</h1>
        <p className="page-subtitle">Keep momentum this week. Resume in one click and maintain your CPD progress.</p>
      </header>

      <section className="section-grid four-up">
        <article className="metric-card">
          <h2>CPD snapshot</h2>
          <p className="metric-value">{formatCpdHours(cpdHours)}</p>
          <p className="muted">Rolling 3-year transcript ready</p>
        </article>
        <article className="metric-card">
          <h2>In progress</h2>
          <p className="metric-value">{continueLearning.length}</p>
          <p className="muted">Courses not yet complete</p>
        </article>
        <article className="metric-card">
          <h2>Upcoming webinars</h2>
          <p className="metric-value">{upcomingWebinars.length}</p>
          <p className="muted">Live sessions this cycle</p>
        </article>
        <article className="metric-card">
          <h2>Certificates</h2>
          <p className="metric-value">{userEnrollments.filter((entry) => entry.certificateId).length}</p>
          <p className="muted">Always downloadable</p>
        </article>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h2>Continue learning</h2>
          <Link to="/courses">View all courses</Link>
        </div>
        {continueLearning.length === 0 ? (
          <p className="empty-state">You are all caught up. Browse the marketplace to enroll in a new course.</p>
        ) : (
          <div className="course-list">
            {continueLearning.map(({ course, readiness }) => (
              <article key={course.id} className="course-row">
                <div>
                  <h3>{course.title}</h3>
                  <p className="muted">{course.description}</p>
                </div>
                <div className="course-row-meta">
                  <p>{readiness.watchedPercent}% watched</p>
                  <p>Quiz {readiness.quizPassed ? 'passed' : 'pending'}</p>
                  <Link to={`/courses/${course.id}/player`}>Resume</Link>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-head">
          <h2>Recommended courses</h2>
          <Link to="/courses">Explore marketplace</Link>
        </div>
        <div className="card-grid">
          {recommended.map((course) => (
            <article key={course.id} className="simple-card">
              <h3>{course.title}</h3>
              <p className="muted">{course.level} · {course.category}</p>
              <p>{course.description}</p>
              <p className="muted">{formatCpdHours(calculateCPDHours(course.videoMinutes))}</p>
              <Link to={`/courses/${course.id}`}>Open course</Link>
            </article>
          ))}
        </div>
      </section>

      <section className="section-block">
        <div className="section-head">
          <h2>Upcoming webinars</h2>
          <Link to="/webinars">See all webinars</Link>
        </div>
        <div className="card-grid">
          {upcomingWebinars.map((webinar) => (
            <article key={webinar.id} className="simple-card">
              <h3>{webinar.title}</h3>
              <p className="muted">{new Date(webinar.startAt).toLocaleString()}</p>
              <p>Provider: {webinar.provider}</p>
              <p>Attendance: {webinar.attendeeIds.length}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
