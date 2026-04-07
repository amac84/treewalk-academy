import { Link, NavLink, Outlet } from 'react-router-dom'
import { CourseSyncBanner } from '../common/CourseSyncBanner'

const links = [
  { label: 'Overview', to: '/admin' },
  { label: 'Course Workflow', to: '/admin/courses' },
  { label: 'User Management', to: '/admin/users' },
  { label: 'Reporting', to: '/admin/reports' },
]

export function AdminLayout() {
  return (
    <div className="app-shell admin-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">Treewalk Admin</div>
          <p className="visually-muted">Functional mode for operations.</p>
          <nav className="side-nav">
            {links.map((link) => (
              <NavLink key={link.to} to={link.to} end={link.to === '/admin'}>
                {link.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <Link to="/home">← Back to learner mode</Link>
        </div>
      </aside>

      <div className="main-column">
        <CourseSyncBanner />
        <main className="page-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
