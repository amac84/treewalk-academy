import { useMemo } from 'react'
import { useAppStore } from '../../hooks/useAppStore'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'

export function AdminReportsPage() {
  const { courses, completions, cpdLedger, users, enrollments, webinars, webinarAttendances } =
    useAppStore()

  const completionByCourse = useMemo(() => {
    return courses
      .map((course) => {
        const enrollmentCount = enrollments.filter((enrollment) => enrollment.courseId === course.id).length
        const completedCount = completions.filter((completion) => completion.courseId === course.id).length
        return {
          courseId: course.id,
          title: course.title,
          enrollmentCount,
          completedCount,
          completionRate: enrollmentCount === 0 ? 0 : Math.round((completedCount / enrollmentCount) * 100),
        }
      })
      .sort((a, b) => b.completionRate - a.completionRate)
  }, [courses, enrollments, completions])

  const progressRows = useMemo(() => {
    return enrollments
      .map((enrollment) => {
        const course = courses.find((item) => item.id === enrollment.courseId)
        const learner = users.find((item) => item.id === enrollment.userId)
        if (!course || !learner) return null

        return {
          id: `${enrollment.userId}-${enrollment.courseId}`,
          learnerName: learner.name,
          courseTitle: course.title,
          watchedPercent: getWatchedPercentFromEnrollment(course, enrollment),
          totalAttempts: enrollment.quizAttempts.length,
          latestScore: enrollment.quizAttempts[enrollment.quizAttempts.length - 1]?.scorePercent ?? null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))
  }, [enrollments, courses, users])

  return (
    <section className="page page--admin">
      <header className="page-header">
        <p className="section-eyebrow">Admin · Reporting</p>
        <h1>Reporting</h1>
        <p className="page-subtitle">
          Operational reporting focused on completion defensibility and learner momentum.
        </p>
      </header>

      <section className="admin-ledger">
        <article className="admin-snapshot">
          <div className="admin-snapshot__lead">
            <p className="section-eyebrow">Snapshot</p>
            <h2>Usage</h2>
          </div>
          <dl className="admin-definition-list">
            <div>
              <dt>Total users</dt>
              <dd>{users.length}</dd>
            </div>
            <div>
              <dt>Active enrollments</dt>
              <dd>{enrollments.length}</dd>
            </div>
            <div>
              <dt>Total completions</dt>
              <dd>{completions.length}</dd>
            </div>
            <div>
              <dt>Total courses</dt>
              <dd>{courses.length}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-snapshot">
          <div className="admin-snapshot__lead">
            <p className="section-eyebrow">Compliance</p>
            <h2>Evidence</h2>
          </div>
          <dl className="admin-definition-list">
            <div>
              <dt>CPD ledger entries</dt>
              <dd>{cpdLedger.length}</dd>
            </div>
            <div>
              <dt>Hours awarded</dt>
              <dd>{cpdLedger.reduce((sum, row) => sum + row.hoursAwarded, 0).toFixed(2)}</dd>
            </div>
            <div>
              <dt>Certificates issued</dt>
              <dd>{completions.length}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-snapshot">
          <div className="admin-snapshot__lead">
            <p className="section-eyebrow">Webinars</p>
            <h2>Live pipeline</h2>
          </div>
          <dl className="admin-definition-list">
            <div>
              <dt>Total webinars</dt>
              <dd>{webinars.length}</dd>
            </div>
            <div>
              <dt>Attendance records</dt>
              <dd>{webinarAttendances.length}</dd>
            </div>
            <div>
              <dt>Converted to courses</dt>
              <dd>{webinars.filter((webinar) => webinar.convertedCourseId).length}</dd>
            </div>
          </dl>
        </article>
      </section>

      <section className="admin-analysis-grid">
        <article className="admin-analysis">
          <header className="admin-analysis__header">
            <div>
              <p className="section-eyebrow">Course performance</p>
              <h2>Completion rates</h2>
            </div>
          </header>
          <ul className="admin-report-list">
            {completionByCourse.map((item) => (
              <li key={item.courseId}>
                <div>
                  <strong>{item.title}</strong>
                  <p className="meta-line">
                    {item.completedCount}/{item.enrollmentCount} learners completed
                  </p>
                </div>
                <span className="admin-emphasis">{item.completionRate}%</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-analysis">
          <header className="admin-analysis__header">
            <div>
              <p className="section-eyebrow">QA view</p>
              <h2>Learner progress</h2>
            </div>
          </header>
          <ul className="admin-report-list">
            {progressRows.map((row) => (
              <li key={row.id}>
                <div>
                  <strong>{row.learnerName}</strong>
                  <p className="meta-line">{row.courseTitle}</p>
                </div>
                <div className="admin-report-list__meta">
                  <span>{row.watchedPercent}% watched</span>
                  <span>{row.totalAttempts} attempts</span>
                  <span>{row.latestScore ?? 'N/A'}% latest</span>
                </div>
              </li>
            ))}
          </ul>
        </article>
      </section>
    </section>
  )
}
