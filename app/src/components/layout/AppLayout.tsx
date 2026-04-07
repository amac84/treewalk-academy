import { Link, NavLink, Outlet } from 'react-router-dom'
import { CourseSyncBanner } from '../common/CourseSyncBanner'
import { useCurrentUser, useRoleLabel } from '../../hooks/useAppStore'

const learnerNav = [
  { to: '/home', label: 'Home' },
  { to: '/courses', label: 'Courses' },
  { to: '/my-learning', label: 'My Learning' },
  { to: '/webinars', label: 'Webinars' },
]

const adminNav = [
  { to: '/admin', label: 'Admin Home' },
  { to: '/admin/courses', label: 'Admin Courses' },
  { to: '/admin/users', label: 'Admin Users' },
  { to: '/admin/reports', label: 'Reporting' },
]

export function AppLayout() {
  const user = useCurrentUser()
  const roleLabel = useRoleLabel()

  if (!user) {
    return (
      <main className="center-empty">
        <h1>No active user</h1>
      </main>
    )
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-mark">Treewalk Academy</div>
          <div className="user-meta">
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
          </div>
          <nav className="side-nav">
            {learnerNav.map((item) => (
              <NavLink key={item.to} to={item.to} end>
                {item.label}
              </NavLink>
            ))}
            <div className="divider" />
            {adminNav.map((item) => (
              <NavLink key={item.to} to={item.to}>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
        <div className="sidebar-footer">
          <p>Invite-only CPD platform.</p>
          <Link to="/courses">Open course catalog</Link>
        </div>
      </aside>
      <div className="main-column">
        <CourseSyncBanner />
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="bottom-bar">
          <span>Learning momentum: keep your weekly streak alive.</span>
          <Link to="/my-learning">View transcript</Link>
        </footer>
      </div>
    </div>
  )
}
