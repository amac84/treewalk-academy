import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { useReportingData } from './reportingData'

export function AdminReportLearnerProgressPage() {
  const { progressRows } = useReportingData()

  return (
    <section className="page page--admin">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Reporting</p>
        <h1>Learner progress monitor</h1>
        <p className="page-subtitle">
          This page has one objective: monitor in-flight learner progress and assessment outcomes across active
          enrollments.
        </p>
      </header>

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

      <JourneyTaskFooter
        backTo="/admin/reports"
        backLabel="Back to reporting sitemap"
        nextTo="/admin/reports/snapshot"
        nextLabel="Go to snapshot report"
      />
    </section>
  )
}
