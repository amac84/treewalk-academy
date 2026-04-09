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
    <div className="app-shell app-shell--admin">
      <aside className="sidebar sidebar--admin">
        <div className="sidebar__top">
          <div className="brand-lockup">
            <span className="brand-mark">Treewalk Admin</span>
            <p className="brand-note">Operational view for catalog, reporting, and user controls.</p>
          </div>

          <nav className="side-nav side-nav--admin">
            <div className="side-nav__group">
              <p className="side-nav__label">Operations</p>
              {links.map((link) => (
                <NavLink key={link.to} to={link.to} end={link.to === '/admin'}>
                  {link.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <p>Dense, quiet, accountable.</p>
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
