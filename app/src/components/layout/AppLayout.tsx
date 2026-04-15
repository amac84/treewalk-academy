import { Link, NavLink, Outlet } from 'react-router-dom'
import { ClerkUserControl } from '../auth/ClerkUserControl'
import { CourseSyncBanner } from '../common/CourseSyncBanner'
import { useCurrentUser, useRoleLabel } from '../../hooks/useAppStore'
import type { UserRole } from '../../types'

const courseRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const peopleRoles: UserRole[] = ['hr_admin', 'super_admin']

type SideNavItem = { to: string; label: string; roles?: UserRole[]; end?: boolean }

const learnerNav: SideNavItem[] = [
  { to: '/home', label: 'Home', end: true },
  { to: '/courses', label: 'Courses', end: true },
  { to: '/my-learning/transcript', label: 'Transcript', end: true },
  { to: '/my-learning/export', label: 'Export CPD', end: true },
  { to: '/webinars/upcoming', label: 'Upcoming Live Sessions', end: true },
  { to: '/webinars/history', label: 'Live Session History', end: true },
]

/** Course workflow and catalog management (instructor, content_admin, super_admin). */
const contentNav: SideNavItem[] = [
  { to: '/admin/courses', label: 'Courses', roles: courseRoles },
  { to: '/admin/courses/new', label: 'Create Draft', roles: courseRoles },
  { to: '/admin/courses/drafts', label: 'Draft Prep', roles: courseRoles },
  { to: '/admin/courses/review', label: 'Review Queue', roles: courseRoles },
  { to: '/admin/courses/published', label: 'Published Catalog', roles: courseRoles },
]

/** Admin home, people ops, and reporting (role-gated per item). */
const adminNav: SideNavItem[] = [
  { to: '/admin', label: 'Admin Home', end: true },
  { to: '/admin/invites', label: 'Invite Ops', roles: peopleRoles },
  { to: '/admin/users', label: 'Admin Users', roles: peopleRoles },
  { to: '/admin/reports/snapshot', label: 'Report Snapshot' },
  { to: '/admin/reports/completions', label: 'Report Completions' },
  { to: '/admin/reports/progress', label: 'Report Progress' },
]

function visibleNavItems(role: UserRole, items: SideNavItem[]): SideNavItem[] {
  return items.filter((item) => !item.roles || item.roles.includes(role))
}

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

  const contentLinks = visibleNavItems(user.role, contentNav)
  const adminLinks = visibleNavItems(user.role, adminNav)

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
              <p className="side-nav__label">Learning</p>
              {learnerNav.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end}>
                  {item.label}
                </NavLink>
              ))}
            </div>

            {contentLinks.length > 0 ? (
              <div className="side-nav__group">
                <p className="side-nav__label">Content</p>
                {contentLinks.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}

            {adminLinks.length > 0 ? (
              <div className="side-nav__group">
                <p className="side-nav__label">Admin</p>
                {adminLinks.map((item) => (
                  <NavLink key={item.to} to={item.to} end={item.end}>
                    {item.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
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
