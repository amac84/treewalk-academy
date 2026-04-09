import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { DemoDataStrip } from '../components/common/DemoDataStrip'
import { useAppStore } from '../hooks/useAppStore'
import type { UserRole } from '../types'

function postDemoLoginPath(role: UserRole): string {
  switch (role) {
    case 'content_admin':
      return '/admin/courses'
    case 'hr_admin':
      return '/admin/users'
    case 'super_admin':
      return '/admin'
    default:
      return '/home'
  }
}

export function LandingPage() {
  const { invites, users, acceptInvite, setCurrentUser, issueInvite, coursesSyncStatus } = useAppStore()
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
    navigate(postDemoLoginPath(result.user.role))
  }

  function handleDemoLogin(userId: string) {
    setCurrentUser(userId)
    const user = users.find((u) => u.id === userId)
    navigate(user ? postDemoLoginPath(user.role) : '/home')
  }

  function handleIssueInvite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!email.trim()) return
    const invite = issueInvite(email.trim(), role)
    setCreatedCode(invite.code)
    setEmail('')
  }

  return (
    <>
      <DemoDataStrip bleed />
      {coursesSyncStatus === 'synced' && (
        <div className="landing-sync-note-bleed" role="status">
          <p className="landing-sync-note">
            The course catalog is shared via Supabase. Seeded logins, enrollments, and transcripts remain{' '}
            <strong>in-memory demo data</strong> in this pilot build.
          </p>
        </div>
      )}
      <main className="landing-page">
      <section className="landing-hero">
        <div className="landing-hero__copy">
          <p className="section-eyebrow">Invite-only CPD academy</p>
          <h1>Learning that feels current. Records that hold up.</h1>
          <p className="landing-lede">
            Treewalk Academy gives accounting teams a calmer way to keep professional education moving:
            clear next steps for learners, credible records for compliance, and none of the dead dashboard
            noise that usually comes with CPD software.
          </p>

          <dl className="landing-proof">
            <div>
              <dt>Momentum first</dt>
              <dd>Resume quickly, finish decisively, keep the next course close.</dd>
            </div>
            <div>
              <dt>Defensible evidence</dt>
              <dd>Certificates, transcripts, and completion logic remain ready for review.</dd>
            </div>
            <div>
              <dt>Invite-only access</dt>
              <dd>Private entry keeps the academy tidy for pilot cohorts and internal teams.</dd>
            </div>
          </dl>
        </div>

        <section className="landing-entry">
          <div className="landing-entry__intro">
            <p className="section-eyebrow">Enter the academy</p>
            <h2>Start with your invite code.</h2>
            <p className="muted">This is the primary path for learners and invited reviewers.</p>
          </div>

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
      </section>

      <section className="landing-grid">
        <article className="landing-support">
          <div className="landing-support__head">
            <p className="section-eyebrow">Demo access</p>
            <h2>Open a seeded role instantly.</h2>
          </div>
          <p className="muted">Useful for reviewing learner, instructor, and admin states without issuing a fresh code.</p>
          <div className="landing-demo-list">
            {users.map((user) => (
              <button key={user.id} type="button" className="button button--secondary landing-demo-button" onClick={() => handleDemoLogin(user.id)}>
                <span>{user.name}</span>
                <span>{user.role}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="landing-ops">
          <div className="landing-support__head">
            <p className="section-eyebrow">Operations</p>
            <h2>Issue an invite for the next reviewer.</h2>
          </div>
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

          <div className="landing-pending">
            <div className="landing-pending__head">
              <h3>Pending invites</h3>
              <span>{activeInvites.length}</span>
            </div>
            <ul className="simple-list">
              {activeInvites.map((invite) => (
                <li key={invite.id} className="landing-pending__item">
                  <span>{invite.email}</span>
                  <span>{invite.role}</span>
                  <code>{invite.code}</code>
                </li>
              ))}
            </ul>
          </div>
        </article>
      </section>
    </main>
    </>
  )
}
