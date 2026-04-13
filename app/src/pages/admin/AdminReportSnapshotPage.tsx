import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { useReportingData } from './reportingData'

export function AdminReportSnapshotPage() {
  const { snapshot } = useReportingData()

  return (
    <section className="page page--admin">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Reporting</p>
        <h1>Operational snapshot</h1>
        <p className="page-subtitle">
          This page has one objective: provide a top-level KPI snapshot for usage, compliance, and webinar
          pipeline health.
        </p>
      </header>

      <section className="admin-ledger">
        <article className="admin-snapshot">
          <div className="admin-snapshot__lead">
            <p className="section-eyebrow">Usage</p>
            <h2>Platform activity</h2>
          </div>
          <dl className="admin-definition-list">
            <div>
              <dt>Total users</dt>
              <dd>{snapshot.totalUsers}</dd>
            </div>
            <div>
              <dt>Active enrollments</dt>
              <dd>{snapshot.activeEnrollments}</dd>
            </div>
            <div>
              <dt>Total completions</dt>
              <dd>{snapshot.totalCompletions}</dd>
            </div>
            <div>
              <dt>Total courses</dt>
              <dd>{snapshot.totalCourses}</dd>
            </div>
          </dl>
        </article>

        <article className="admin-snapshot">
          <div className="admin-snapshot__lead">
            <p className="section-eyebrow">Compliance</p>
            <h2>Evidence status</h2>
          </div>
          <dl className="admin-definition-list">
            <div>
              <dt>CPD ledger entries</dt>
              <dd>{snapshot.cpdLedgerEntries}</dd>
            </div>
            <div>
              <dt>Hours awarded</dt>
              <dd>{snapshot.hoursAwarded.toFixed(2)}</dd>
            </div>
            <div>
              <dt>Certificates issued</dt>
              <dd>{snapshot.certificatesIssued}</dd>
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
              <dd>{snapshot.totalWebinars}</dd>
            </div>
            <div>
              <dt>Attendance records</dt>
              <dd>{snapshot.attendanceRecords}</dd>
            </div>
            <div>
              <dt>Converted to courses</dt>
              <dd>{snapshot.convertedWebinars}</dd>
            </div>
          </dl>
        </article>
      </section>

      <JourneyTaskFooter
        backTo="/admin/reports"
        backLabel="Back to reporting sitemap"
        nextTo="/admin/reports/completions"
        nextLabel="Go to completion rates"
      />
    </section>
  )
}
