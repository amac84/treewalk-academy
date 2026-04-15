import { Link, NavLink, Outlet } from 'react-router-dom'
import { ClerkUserControl } from '../auth/ClerkUserControl'
import { useCurrentUser } from '../../hooks/useAppStore'
import { CourseSyncBanner } from '../common/CourseSyncBanner'
import type { UserRole } from '../../types'

const courseRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const peopleRoles: UserRole[] = ['hr_admin', 'super_admin']

type AdminSideLink = { label: string; to: string; roles?: UserRole[]; end?: boolean }

const contentLinksDef: AdminSideLink[] = [
  { label: 'Courses', to: '/admin/courses', roles: courseRoles },
  { label: 'Live Events', to: '/admin/live-events', roles: courseRoles, end: true },
  { label: 'Live broadcast (OBS)', to: '/admin/live-events/presenter-guide', roles: courseRoles },
]

const adminLinksDef: AdminSideLink[] = [
  { label: 'Overview', to: '/admin', end: true },
  { label: 'Invite Operations', to: '/admin/invites', roles: peopleRoles },
  { label: 'User Management', to: '/admin/users', roles: peopleRoles },
  { label: 'Report Snapshot', to: '/admin/reports/snapshot' },
  { label: 'Report Completions', to: '/admin/reports/completions' },
  { label: 'Report Progress', to: '/admin/reports/progress' },
]

function visibleAdminLinks(role: UserRole | undefined, items: AdminSideLink[]): AdminSideLink[] {
  if (!role) return []
  return items.filter((item) => !item.roles || item.roles.includes(role))
}

export function AdminLayout() {
  const user = useCurrentUser()
  const contentLinks = visibleAdminLinks(user?.role, contentLinksDef)
  const adminLinks = visibleAdminLinks(user?.role, adminLinksDef)

  return (
    <div className="app-shell app-shell--admin">
      <aside className="sidebar sidebar--admin">
        <div className="sidebar__top">
          <div className="brand-lockup">
            <span className="brand-mark">Treewalk Admin</span>
            <p className="brand-note">Operational view for catalog, reporting, and user controls.</p>
          </div>

          <div className="user-meta" style={{ marginBottom: '1rem' }}>
            <span className="user-meta__eyebrow">Signed in</span>
            <strong>{user?.name}</strong>
            <ClerkUserControl />
          </div>

          <nav className="side-nav side-nav--admin">
            {contentLinks.length > 0 ? (
              <div className="side-nav__group">
                <p className="side-nav__label">Content</p>
                {contentLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.end}>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
            {adminLinks.length > 0 ? (
              <div className="side-nav__group">
                <p className="side-nav__label">Admin</p>
                {adminLinks.map((link) => (
                  <NavLink key={link.to} to={link.to} end={link.end}>
                    {link.label}
                  </NavLink>
                ))}
              </div>
            ) : null}
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
