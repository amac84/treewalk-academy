import { Link } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { formatCpdHours, getCourseCPDHours } from '../../lib/cpd'

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
    return total + getCourseCPDHours(course)
  }, 0)

  const totalCertificates = userEnrollments.filter((entry) => entry.certificateId).length

  const featuredCourse = continueLearning[0]
  const supportingContinue = continueLearning.slice(1)

  return (
    <main className="page page--home">
      <header className="page-header page-header--hero">
        <p className="section-eyebrow">Learner workspace</p>
        <h1>Welcome back{currentUser ? `, ${currentUser.name}` : ''}</h1>
        <p className="page-subtitle">
          This page has one core objective: resume your next unfinished course immediately.
        </p>
      </header>

      <section className="hero-grid">
        <article className="hero-feature">
          <div className="hero-feature__header">
            <p className="eyebrow">Primary focus</p>
            <h2>Continue learning</h2>
          </div>

          {featuredCourse ? (
            <div className="hero-feature__body">
              <div className="stack-sm">
                <h3>{featuredCourse.course.title}</h3>
                <p className="section-copy">{featuredCourse.course.description}</p>
              </div>
              <dl className="definition-grid">
                <div>
                  <dt>Watched</dt>
                  <dd>{featuredCourse.readiness.watchedPercent}%</dd>
                </div>
                <div>
                  <dt>Quiz</dt>
                  <dd>{featuredCourse.readiness.quizPassed ? 'Passed' : 'Pending'}</dd>
                </div>
                <div>
                  <dt>CPD on finish</dt>
                  <dd>{formatCpdHours(getCourseCPDHours(featuredCourse.course))}</dd>
                </div>
              </dl>
              <div className="button-row">
                <Link className="button button--primary" to={`/courses/${featuredCourse.course.id}/player`}>
                  Resume course
                </Link>
                <Link className="button button--subtle" to={`/courses/${featuredCourse.course.id}`}>
                  Review details
                </Link>
              </div>
            </div>
          ) : (
            <div className="hero-feature__body">
              <p className="section-copy">
                You are caught up. Open the catalog and start a new course while your transcript remains ready.
              </p>
              <div className="button-row">
                <Link className="button button--primary" to="/courses">
                  Browse courses
                </Link>
              </div>
            </div>
          )}
        </article>

        <aside className="hero-rail">
          <div className="hero-aside">
            <p className="eyebrow">Record</p>
            <div className="metric-pair">
              <span>{formatCpdHours(cpdHours)}</span>
              <p>Earned across the rolling 3-year transcript.</p>
            </div>
          </div>
          <div className="hero-aside">
            <p className="eyebrow">In motion</p>
            <div className="metric-pair">
              <span>{continueLearning.length}</span>
              <p>Active courses still in progress.</p>
            </div>
          </div>
          <div className="hero-aside">
            <p className="eyebrow">This cycle</p>
            <div className="metric-pair">
              <span>{upcomingWebinars.length}</span>
              <p>Upcoming live sessions plus {totalCertificates} certificates ready to download.</p>
            </div>
          </div>
        </aside>
      </section>

      {supportingContinue.length > 0 ? (
        <section className="section-block">
          <div className="section-head">
            <h2>Also underway</h2>
            <Link to="/courses">View all courses</Link>
          </div>
          <div className="course-list">
            {supportingContinue.map(({ course, readiness }) => (
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
        </section>
      ) : null}

      <section className="section-block section-block--split">
        <div className="section-head">
          <h2>Need another next step?</h2>
        </div>
        <div className="card-grid">
          <article className="simple-card">
            <h3>Browse catalog</h3>
            <p className="muted">{recommended.length} recommended courses are available right now.</p>
            <Link to="/courses">Open courses</Link>
          </article>
          <article className="simple-card">
            <h3>Check webinars</h3>
            <p className="muted">{upcomingWebinars.length} upcoming live sessions are scheduled.</p>
            <Link to="/webinars/upcoming">Open upcoming webinars</Link>
          </article>
        </div>
      </section>
    </main>
  )
}
