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
    <div className="app-shell app-shell--learner">
      <aside className="sidebar sidebar--learner">
        <div className="sidebar__top">
          <div className="brand-lockup">
            <span className="brand-mark">Treewalk Academy</span>
            <p className="brand-note">Invite-only CPD learning for modern accounting teams.</p>
          </div>

          <div className="user-meta">
            <span className="user-meta__eyebrow">Current learner</span>
            <strong>{user.name}</strong>
            <span>{roleLabel}</span>
          </div>

          <nav className="side-nav">
            <div className="side-nav__group">
              <p className="side-nav__label">Learn</p>
              {learnerNav.map((item) => (
                <NavLink key={item.to} to={item.to} end>
                  {item.label}
                </NavLink>
              ))}
            </div>

            <div className="side-nav__group">
              <p className="side-nav__label">Operate</p>
              {adminNav.map((item) => (
                <NavLink key={item.to} to={item.to}>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
        </div>

        <div className="sidebar-footer">
          <p>Keep the next lesson closer than the transcript.</p>
          <Link to="/courses">Browse published courses</Link>
        </div>
      </aside>

      <div className="main-column">
        <CourseSyncBanner />
        <main className="page-content">
          <Outlet />
        </main>
        <footer className="bottom-bar">
          <span>Momentum first. Resume quickly, record cleanly, keep evidence ready.</span>
          <Link to="/my-learning">View transcript</Link>
        </footer>
      </div>
    </div>
  )
}
