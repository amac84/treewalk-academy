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
    <div className="page admin-dashboard-page">
      <header className="page-header">
        <h1>Admin Dashboard</h1>
        <p>Operational metrics and controls for Treewalk Academy.</p>
      </header>

      <section className="stats-grid">
        <article className="stat-card">
          <h3>Published Courses</h3>
          <strong>{metrics.published}</strong>
        </article>
        <article className="stat-card">
          <h3>In Review</h3>
          <strong>{metrics.inReview}</strong>
        </article>
        <article className="stat-card">
          <h3>Draft Courses</h3>
          <strong>{metrics.drafts}</strong>
        </article>
        <article className="stat-card">
          <h3>Active Users</h3>
          <strong>{metrics.activeUsers}</strong>
        </article>
        <article className="stat-card">
          <h3>Certificates Issued</h3>
          <strong>{metrics.certificates}</strong>
        </article>
        <article className="stat-card">
          <h3>Total CPD (Catalog)</h3>
          <strong>{metrics.totalCPD.toFixed(2)} hrs</strong>
        </article>
      </section>
    </div>
  )
}
