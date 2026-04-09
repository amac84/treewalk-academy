import { useMemo } from 'react'
import { useAppStore } from '../../hooks/useAppStore'
import { calculateCPDHours } from '../../lib/cpd'

export function AdminDashboardPage() {
  const store = useAppStore()

  const metrics = useMemo(() => {
    const published = store.courses.filter((course) => course.status === 'published').length
    const inReview = store.courses.filter((course) => course.status === 'review').length
    const drafts = store.courses.filter((course) => course.status === 'draft').length
    const activeUsers = store.users.filter((user) => user.status === 'active').length
    const certificates = store.certificates.length
    const totalCPD = store.courses.reduce(
      (sum, course) => sum + calculateCPDHours(course.videoMinutes),
      0,
    )

    return { published, inReview, drafts, activeUsers, certificates, totalCPD }
  }, [store.courses, store.users, store.certificates.length])

  return (
    <div className="page admin-page admin-dashboard-page">
      <header className="page-header admin-page-header">
        <div>
          <p className="section-eyebrow">Operations</p>
          <h1>Today’s operating view</h1>
        </div>
        <p className="page-subtitle">
          Keep the catalog moving, keep users active, and keep completion records defensible.
        </p>
      </header>

      <section className="admin-overview-grid">
        <article className="admin-hero-block">
          <p className="section-eyebrow">Catalog health</p>
          <h2>{metrics.published} published courses</h2>
          <p className="section-copy">
            {metrics.inReview} in review and {metrics.drafts} still in draft. Editorial throughput matters
            more than dashboard ornament.
          </p>
        </article>

        <div className="admin-summary-rail">
          <article className="admin-summary-item">
            <span className="admin-summary-value">{metrics.activeUsers}</span>
            <span className="admin-summary-label">active users</span>
          </article>
          <article className="admin-summary-item">
            <span className="admin-summary-value">{metrics.certificates}</span>
            <span className="admin-summary-label">certificates issued</span>
          </article>
          <article className="admin-summary-item">
            <span className="admin-summary-value">{metrics.totalCPD.toFixed(2)}</span>
            <span className="admin-summary-label">catalog CPD hours</span>
          </article>
        </div>
      </section>

      <section className="admin-ledger-grid">
        <article className="admin-ledger-panel">
          <div className="section-head">
            <h2>Workflow priorities</h2>
          </div>
          <ul className="admin-ledger-list">
            <li>
              <span>Courses waiting in review</span>
              <strong>{metrics.inReview}</strong>
            </li>
            <li>
              <span>Drafts still needing editorial work</span>
              <strong>{metrics.drafts}</strong>
            </li>
            <li>
              <span>Published catalog available today</span>
              <strong>{metrics.published}</strong>
            </li>
          </ul>
        </article>

        <article className="admin-ledger-panel">
          <div className="section-head">
            <h2>Compliance signals</h2>
          </div>
          <ul className="admin-ledger-list">
            <li>
              <span>Certificates in the system</span>
              <strong>{metrics.certificates}</strong>
            </li>
            <li>
              <span>Users currently active</span>
              <strong>{metrics.activeUsers}</strong>
            </li>
            <li>
              <span>Total CPD represented in catalog</span>
              <strong>{metrics.totalCPD.toFixed(2)}h</strong>
            </li>
          </ul>
        </article>
      </section>
    </div>
  )
}
