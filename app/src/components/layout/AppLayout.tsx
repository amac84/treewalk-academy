import { Link, NavLink, Outlet } from 'react-router-dom'
import { ClerkUserControl } from '../auth/ClerkUserControl'
import { CourseSyncBanner } from '../common/CourseSyncBanner'
import { useCurrentUser, useRoleLabel } from '../../hooks/useAppStore'
import type { UserRole } from '../../types'

const courseRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const peopleRoles: UserRole[] = ['hr_admin', 'super_admin']

const learnerNav = [
  { to: '/home', label: 'Home' },
  { to: '/courses', label: 'Courses' },
  { to: '/my-learning/transcript', label: 'Transcript' },
  { to: '/my-learning/export', label: 'Export CPD' },
  { to: '/webinars/upcoming', label: 'Upcoming Webinars' },
  { to: '/webinars/history', label: 'Webinar History' },
]

const adminNav: { to: string; label: string; roles?: UserRole[] }[] = [
  { to: '/admin', label: 'Admin Home' },
  { to: '/admin/courses/new', label: 'Create Draft', roles: courseRoles },
  { to: '/admin/courses/drafts', label: 'Draft Prep', roles: courseRoles },
  { to: '/admin/courses/review', label: 'Review Queue', roles: courseRoles },
  { to: '/admin/courses/published', label: 'Published Catalog', roles: courseRoles },
  { to: '/admin/invites', label: 'Invite Ops', roles: peopleRoles },
  { to: '/admin/users', label: 'Admin Users', roles: peopleRoles },
  { to: '/admin/reports/snapshot', label: 'Report Snapshot' },
  { to: '/admin/reports/completions', label: 'Report Completions' },
  { to: '/admin/reports/progress', label: 'Report Progress' },
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
            <span className="user-meta__eyebrow">Signed in</span>
            <strong>{user.name}</strong>
            {user.role !== 'learner' ? <span>{roleLabel}</span> : null}
            <span className="muted small-copy">
              Catalog: {user.accessScope === 'internal' ? 'Internal + everyone' : 'Everyone'}
            </span>
            <ClerkUserControl />
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
              {adminNav
                .filter((item) => !item.roles || item.roles.includes(user.role))
                .map((item) => (
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
          <Link to="/my-learning/transcript">View transcript</Link>
        </footer>
      </div>
    </div>
  )
}
