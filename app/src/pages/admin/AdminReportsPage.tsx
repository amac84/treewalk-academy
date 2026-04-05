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
    <section className="page">
      <header className="page-header">
        <h1>Reporting</h1>
        <p>Operational reporting focused on completion defensibility and learner momentum.</p>
      </header>

      <div className="admin-grid">
        <article className="admin-card">
          <h2>Usage Snapshot</h2>
          <ul>
            <li>Total users: {users.length}</li>
            <li>Active enrollments: {enrollments.length}</li>
            <li>Total completions: {completions.length}</li>
            <li>Total courses: {courses.length}</li>
          </ul>
        </article>

        <article className="admin-card">
          <h2>Compliance Snapshot</h2>
          <ul>
            <li>CPD ledger entries: {cpdLedger.length}</li>
            <li>Total CPD hours awarded: {cpdLedger.reduce((sum, row) => sum + row.hoursAwarded, 0).toFixed(2)}</li>
            <li>Certificates issued: {completions.length}</li>
          </ul>
        </article>

        <article className="admin-card">
          <h2>Webinar Snapshot</h2>
          <ul>
            <li>Total webinars: {webinars.length}</li>
            <li>Attendance records: {webinarAttendances.length}</li>
            <li>Converted to courses: {webinars.filter((webinar) => webinar.convertedCourseId).length}</li>
          </ul>
        </article>

        <article className="admin-card admin-card-wide">
          <h2>Course Completion Rates</h2>
          <ul>
            {completionByCourse.map((item) => (
              <li key={item.courseId}>
                <strong>{item.title}</strong> — {item.completionRate}% ({item.completedCount}/{item.enrollmentCount})
              </li>
            ))}
          </ul>
        </article>

        <article className="admin-card admin-card-wide">
          <h2>Learner Progress QA View</h2>
          <ul>
            {progressRows.map((row) => (
              <li key={row.id}>
                <strong>{row.learnerName}</strong> • {row.courseTitle} — watched {row.watchedPercent}% • attempts{' '}
                {row.totalAttempts} • latest score {row.latestScore ?? 'N/A'}%
              </li>
            ))}
          </ul>
        </article>
      </div>
    </section>
  )
}
