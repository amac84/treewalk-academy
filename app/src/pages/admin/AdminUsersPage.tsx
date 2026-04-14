import { useAppStore } from '../../hooks/useAppStore'
import { ROLE_REFERENCE_ITEMS, formatRoleLabel } from '../../lib/roleDescriptions'
import { Link } from 'react-router-dom'

export function AdminUsersPage() {
  const { users, currentUserId, suspendUser, deleteUser } = useAppStore()

  const confirmRemove = (name: string, email: string) =>
    window.confirm(
      `Remove ${name} (${email}) from the roster?\n\nTheir enrollments, certificates, and activity in this workspace will be cleared. This cannot be undone here.`,
    )

  return (
    <section className="page admin-users-page">
      <header className="page-header">
        <p className="section-eyebrow">Admin · People operations</p>
        <h1>Manage active access</h1>
               <p className="page-subtitle">
          This page is only for access control: review user status, suspend or reactivate accounts, or remove someone
          from the roster.
        </p>
      </header>

      <section className="admin-section role-reference" aria-labelledby="role-reference-heading">
        <div className="admin-section-head">
          <div>
            <p className="section-eyebrow">Reference</p>
            <h2 id="role-reference-heading">What each role can do</h2>
            <p className="section-copy muted">
              Roles are assigned in Clerk (public metadata <code className="inline-code">academyRole</code>) or when
              issuing invites. Use this when deciding what access someone needs.
            </p>
          </div>
        </div>
        <ul className="role-reference__list">
          {ROLE_REFERENCE_ITEMS.map((item) => (
            <li key={item.role} className="role-reference__item">
              <p className="role-reference__role">{item.label}</p>
              <p className="role-reference__summary">{item.summary}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <p className="section-eyebrow">Directory</p>
            <h2>Current access roster</h2>
          </div>
          <Link to="/admin/invites" className="link-button">
            Go to invite operations
          </Link>
        </div>

        <div className="table-card table-card--quiet">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id}>
                  <td>{user.name}</td>
                  <td>{user.email}</td>
                  <td>
                    <span className="table-role">{formatRoleLabel(user.role)}</span>
                  </td>
                  <td>
                    <span className={`status-chip status-chip--${user.status}`}>{user.status}</span>
                  </td>
                  <td>
                    <div className="admin-user-row-actions">
                      {user.status === 'active' ? (
                        <button type="button" className="ghost-btn" onClick={() => suspendUser(user.id)}>
                          Suspend
                        </button>
                      ) : (
                        <button type="button" className="ghost-btn" onClick={() => suspendUser(user.id, false)}>
                          Reactivate
                        </button>
                      )}
                      <button
                        type="button"
                        className="ghost-btn ghost-btn--danger"
                        disabled={user.id === currentUserId}
                        title={user.id === currentUserId ? 'You cannot remove your own account from this view.' : undefined}
                        onClick={() => {
                          if (!confirmRemove(user.name, user.email)) return
                          deleteUser(user.id)
                        }}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </section>
  )
}
