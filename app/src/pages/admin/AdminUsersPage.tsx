import { useAppStore } from '../../hooks/useAppStore'
import type { UserRole } from '../../types'

const roleOptions: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']

export function AdminUsersPage() {
  const { users, inviteUser, suspendUser } = useAppStore()

  return (
    <section className="panel stack-lg">
      <header className="stack-sm">
        <h1>Users & Invites</h1>
        <p className="muted">Invite users and suspend access where needed. Invite-only onboarding enforced.</p>
      </header>

      <div className="card stack-sm">
        <h2>Invite User</h2>
        <form
          className="inline-form"
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
          <input name="fullName" placeholder="Full name" required />
          <input name="email" placeholder="Email" type="email" required />
          <select name="role" defaultValue="learner">
            {roleOptions.map((role) => (
              <option key={role} value={role}>
                {role.replace('_', ' ')}
              </option>
            ))}
          </select>
          <button type="submit">Send Invite</button>
        </form>
      </div>

      <div className="table-card">
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
                <td>{user.role}</td>
                <td>
                  <span className={`status status-${user.status}`}>{user.status}</span>
                </td>
                <td>
                  {user.status === 'active' ? (
                    <button type="button" className="ghost" onClick={() => suspendUser(user.id)}>
                      Suspend
                    </button>
                  ) : (
                    <button type="button" className="ghost" onClick={() => suspendUser(user.id, false)}>
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
  )
}
