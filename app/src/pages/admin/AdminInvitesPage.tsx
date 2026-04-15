import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { isClerkConfigured } from '../../lib/clerkEnv'
import type { Invite, UserRole } from '../../types'

const roleOptions: UserRole[] = ['learner', 'instructor', 'content_admin', 'hr_admin', 'super_admin']

async function getClerkSessionTokenFromWindow(): Promise<string | null> {
  const win = window as Window & {
    Clerk?: { session?: { getToken?: () => Promise<string | null> } }
  }
  const getToken = win.Clerk?.session?.getToken
  if (typeof getToken !== 'function') return null
  try {
    return (await getToken()) ?? null
  } catch {
    return null
  }
}

function inviteEmailStatusCopy(invite: Invite): string {
  if (invite.emailDeliveryStatus === 'sent') {
    return invite.emailSentAt
      ? `Sent ${new Date(invite.emailSentAt).toLocaleString()}`
      : 'Sent'
  }
  if (invite.emailDeliveryStatus === 'failed') {
    return invite.emailDeliveryError?.trim() || 'Send failed'
  }
  return 'Not sent yet'
}

export function AdminInvitesPage() {
  const { invites, inviteUser, sendInviteEmail, deletePendingInvite } = useAppStore()
  const pendingInvites = invites.filter((invite) => invite.status === 'pending')
  const [busyInviteId, setBusyInviteId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ type: 'ok' | 'error'; text: string } | null>(null)

  const confirmDeleteInvite = (email: string, code: string) =>
    window.confirm(`Cancel this invite for ${email}?\n\nCode ${code} will no longer work.`)

  const sendEmailForInvite = async (invite: Invite): Promise<boolean> => {
    if (!isClerkConfigured()) {
      setFeedback({
        type: 'error',
        text: 'Clerk is not configured in this build, so invite emails cannot be sent from this page.',
      })
      return false
    }
    setBusyInviteId(invite.id)
    setFeedback(null)
    const token = await getClerkSessionTokenFromWindow()
    const result = await sendInviteEmail(invite.id, {
      clerkSessionToken: token,
      signUpUrl: `${window.location.origin}/sign-up`,
      invite,
    })
    setBusyInviteId(null)
    if (!result.ok) {
      setFeedback({
        type: 'error',
        text: `Invite saved for ${invite.email}, but the email did not send: ${result.message ?? 'Unknown error.'}`,
      })
      return false
    }
    setFeedback({ type: 'ok', text: `Invite email sent to ${invite.email}.` })
    return true
  }

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
            onSubmit={async (event) => {
              event.preventDefault()
              const form = new FormData(event.currentTarget)
              const email = String(form.get('email') ?? '').trim()
              const fullName = String(form.get('fullName') ?? '').trim()
              const role = String(form.get('role') ?? 'learner') as UserRole
              if (!email || !fullName) return
              let invite: Invite
              try {
                invite = inviteUser(email, fullName, role)
              } catch (error) {
                setFeedback({
                  type: 'error',
                  text: error instanceof Error ? error.message : 'Could not create invite.',
                })
                return
              }
              event.currentTarget.reset()
              if (!isClerkConfigured()) {
                setFeedback({
                  type: 'ok',
                  text: `Invite code created for ${invite.email}. Clerk is disabled, so no email was sent.`,
                })
                return
              }
              void sendEmailForInvite(invite)
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
          {feedback ? (
            <p className={feedback.type === 'error' ? 'error-text' : 'muted'}>{feedback.text}</p>
          ) : null}
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
                <th>Email delivery</th>
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
                  <td>{inviteEmailStatusCopy(invite)}</td>
                  <td>{new Date(invite.createdAt).toLocaleDateString()}</td>
                  <td>
                    <div className="admin-user-row-actions">
                      <button
                        type="button"
                        className="ghost-btn"
                        disabled={busyInviteId === invite.id}
                        onClick={() => void sendEmailForInvite(invite)}
                      >
                        {busyInviteId === invite.id ? 'Sending…' : 'Resend email'}
                      </button>
                      <button
                        type="button"
                        className="ghost-btn ghost-btn--danger"
                        disabled={busyInviteId === invite.id}
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
