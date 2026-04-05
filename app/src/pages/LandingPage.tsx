import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAppStore } from '../hooks/useAppStore'

export function LandingPage() {
  const { invites, users, acceptInvite, setCurrentUser, issueInvite } = useAppStore()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<'learner' | 'instructor' | 'content_admin' | 'hr_admin' | 'super_admin'>('learner')
  const [createdCode, setCreatedCode] = useState<string | null>(null)

  const activeInvites = invites.filter((invite) => invite.status === 'pending')

  function handleAcceptInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = acceptInvite(inviteCode)
    if (!result.ok) {
      setInviteError(result.error)
      return
    }
    setInviteError(null)
    setCurrentUser(result.user.id)
    navigate('/home')
  }

  function handleAdminLogin(userId: string) {
    setCurrentUser(userId)
    navigate('/home')
  }

  function handleIssueInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return
    const invite = issueInvite(email.trim(), role)
    setCreatedCode(invite.code)
    setEmail('')
  }

  return (
    <main className="landing">
      <section className="landing-card">
        <h1>Treewalk Academy</h1>
        <p className="muted">
          Invite-only CPD learning for accountants. Enter your invite code to begin.
        </p>
        <form className="stack" onSubmit={handleAcceptInvite}>
          <label htmlFor="invite-code">Invite code</label>
          <input
            id="invite-code"
            value={inviteCode}
            onChange={(event) => setInviteCode(event.target.value)}
            placeholder="INV-XXXXXX"
            required
          />
          <button type="submit">Accept invite &amp; continue</button>
          {inviteError && <p className="error-text">{inviteError}</p>}
        </form>
      </section>

      <section className="landing-card">
        <h2>Quick access (demo)</h2>
        <p className="muted">Sign in as an existing invited user.</p>
        <div className="stack">
          {users.map((user) => (
            <button key={user.id} type="button" className="secondary" onClick={() => handleAdminLogin(user.id)}>
              Continue as {user.name} ({user.role})
            </button>
          ))}
        </div>
      </section>

      <section className="landing-card">
        <h2>Issue invite (HR / Super Admin)</h2>
        <p className="muted">For demonstration, this panel is available on the entry screen.</p>
        <form className="stack" onSubmit={handleIssueInvite}>
          <label htmlFor="invite-email">Email</label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="new.user@example.com"
            required
          />

          <label htmlFor="invite-role">Role</label>
          <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value as typeof role)}>
            <option value="learner">Learner</option>
            <option value="instructor">Instructor</option>
            <option value="content_admin">Content Admin</option>
            <option value="hr_admin">HR Admin</option>
            <option value="super_admin">Super Admin</option>
          </select>

          <button type="submit">Issue invite</button>
          {createdCode && (
            <p className="success-text">
              Invite created. Code: <strong>{createdCode}</strong>
            </p>
          )}
        </form>

        <h3>Pending invites</h3>
        <ul className="simple-list">
          {activeInvites.map((invite) => (
            <li key={invite.id}>
              {invite.email} — <span className="caps">{invite.role}</span> — <code>{invite.code}</code>
            </li>
          ))}
        </ul>
      </section>
    </main>
  )
}
