import { useAppStore } from '../../hooks/useAppStore'
import type { UserRole } from '../../types'

const roleOptions: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']

export function AdminUsersPage() {
  const { users, inviteUser, suspendUser } = useAppStore()

  return (
    <section className="page admin-users-page">
      <header className="page-header">
        <p className="section-eyebrow">Admin · People operations</p>
        <h1>Users and invites</h1>
        <p className="page-subtitle">
          Keep access tightly controlled while making onboarding easy for invited learners and staff.
        </p>
      </header>

      <section className="admin-section admin-section--split">
        <div className="admin-section-intro">
          <p className="section-eyebrow">Issue invite</p>
          <h2>Start with the person, then assign the role.</h2>
          <p className="section-copy">
            New access should feel deliberate. Capture only the essentials and keep the directory close by.
          </p>
        </div>

        <div className="admin-form-shell">
          <form
            className="inline-form admin-inline-form"
            onSubmit={(event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const email = String(form.get('email') ?? '').trim()
              const fullName = String(form.get('fullName') ?? '').trim()
              const role = String(form.get('role') ?? 'learner') as UserRole
              if (!email || !fullName) return
              inviteUser(email, fullName, role)
              event.currentTarget.reset()
            }}
          >
            <label>
              Full name
              <input name="fullName" placeholder="Full name" required />
            </label>
            <label>
              Email
              <input name="email" placeholder="Email" type="email" required />
            </label>
            <label>
              Role
              <select name="role" defaultValue="learner">
                {roleOptions.map((role) => (
                  <option key={role} value={role}>
                    {role.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit">Send invite</button>
          </form>
        </div>
      </section>

      <section className="admin-section">
        <div className="admin-section-head">
          <div>
            <p className="section-eyebrow">Directory</p>
            <h2>Current access roster</h2>
          </div>
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
