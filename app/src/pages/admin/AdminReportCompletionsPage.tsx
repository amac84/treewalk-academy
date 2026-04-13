import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { useReportingData } from './reportingData'

export function AdminReportCompletionsPage() {
  const { completionByCourse } = useReportingData()

  return (
    <section className="page page--admin">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Reporting</p>
        <h1>Completion rates by course</h1>
        <p className="page-subtitle">
          This page has one objective: show course-level completion performance for editorial and learning
          quality decisions.
        </p>
      </header>

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

      <JourneyTaskFooter
        backTo="/admin/reports"
        backLabel="Back to reporting sitemap"
        nextTo="/admin/reports/progress"
        nextLabel="Go to learner progress"
      />
    </section>
  )
}
