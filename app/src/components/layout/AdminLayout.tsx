import { Link, NavLink, Outlet } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useAppStore'
import { CourseSyncBanner } from '../common/CourseSyncBanner'
import type { UserRole } from '../../types'

const courseRoles: UserRole[] = ['instructor', 'content_admin', 'super_admin']
const peopleRoles: UserRole[] = ['hr_admin', 'super_admin']

const links: { label: string; to: string; roles?: UserRole[] }[] = [
  { label: 'Overview', to: '/admin' },
  { label: 'Courses', to: '/admin/courses', roles: courseRoles },
  { label: 'Invite Operations', to: '/admin/invites', roles: peopleRoles },
  { label: 'User Management', to: '/admin/users', roles: peopleRoles },
  { label: 'Report Snapshot', to: '/admin/reports/snapshot' },
  { label: 'Report Completions', to: '/admin/reports/completions' },
  { label: 'Report Progress', to: '/admin/reports/progress' },
]

export function AdminLayout() {
  const user = useCurrentUser()
  const visibleLinks = links.filter((link) => !link.roles || (user ? link.roles.includes(user.role) : false))

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
              {visibleLinks.map((link) => (
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
