import { useAppStore } from '../../hooks/useAppStore'
import { Link } from 'react-router-dom'

export function AdminUsersPage() {
  const { users, suspendUser } = useAppStore()

  return (
    <section className="page admin-users-page">
      <header className="page-header">
        <p className="section-eyebrow">Admin · People operations</p>
        <h1>Manage active access</h1>
        <p className="page-subtitle">
          This page is only for access control: review user status and suspend or reactivate accounts.
        </p>
      </header>

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
                    <span className="table-role">{user.role.replace('_', ' ')}</span>
                  </td>
                  <td>
                    <span className={`status-chip status-chip--${user.status}`}>{user.status}</span>
                  </td>
                  <td>
                    {user.status === 'active' ? (
                      <button type="button" className="ghost-btn" onClick={() => suspendUser(user.id)}>
                        Suspend
                      </button>
                    ) : (
                      <button type="button" className="ghost-btn" onClick={() => suspendUser(user.id, false)}>
                        Reactivate
                      </button>
                    )}
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
