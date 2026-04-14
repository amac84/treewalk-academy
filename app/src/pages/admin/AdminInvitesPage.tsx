import { Link } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import type { UserRole } from '../../types'

const roleOptions: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']

export function AdminInvitesPage() {
  const { invites, inviteUser, deletePendingInvite } = useAppStore()
  const pendingInvites = invites.filter((invite) => invite.status === 'pending')

  const confirmDeleteInvite = (email: string, code: string) =>
    window.confirm(`Cancel this invite for ${email}?\n\nCode ${code} will no longer work.`)

  return (
    <section className="page admin-users-page">
      <header className="page-header">
        <p className="section-eyebrow">Admin · People operations</p>
        <h1>Issue invites</h1>
        <p className="page-subtitle">
          This page is only for onboarding: create invite codes and monitor pending invites.
        </p>
      </header>

      <section className="admin-section admin-section--split">
        <div className="admin-section-intro">
          <p className="section-eyebrow">Issue invite</p>
          <h2>Start with the person, then assign the role.</h2>
          <p className="section-copy">Capture only essentials and send an access code.</p>
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
            <p className="section-eyebrow">Pending invites</p>
            <h2>Awaiting acceptance</h2>
          </div>
          <Link to="/admin/users" className="link-button">
            Manage active users
          </Link>
        </div>

        <div className="table-card table-card--quiet">
          <table>
            <thead>
              <tr>
                <th>Email</th>
                <th>Role</th>
                <th>Invite code</th>
                <th>Created</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {pendingInvites.map((invite) => (
                <tr key={invite.id}>
                  <td>{invite.email}</td>
                  <td>{invite.role.replace('_', ' ')}</td>
                  <td>
                    <code>{invite.code}</code>
                  </td>
                  <td>{new Date(invite.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="admin-user-row-actions">
                      <button
                        type="button"
                        className="ghost-btn ghost-btn--danger"
                        onClick={() => {
                          if (!confirmDeleteInvite(invite.email, invite.code)) return
                          deletePendingInvite(invite.id)
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
          {pendingInvites.length === 0 ? <p className="muted">No pending invites.</p> : null}
        </div>
      </section>
    </section>
  )
}
