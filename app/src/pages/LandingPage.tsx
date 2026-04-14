import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { DemoDataStrip } from '../components/common/DemoDataStrip'
import { useAppStore } from '../hooks/useAppStore'
import { isClerkConfigured } from '../lib/clerkEnv'
import type { UserRole } from '../types'

function postDemoLoginPath(role: UserRole): string {
  switch (role) {
    case 'content_admin':
      return '/admin/courses/drafts'
    case 'hr_admin':
      return '/admin/invites'
    case 'super_admin':
      return '/admin'
    default:
      return '/home'
  }
}

export function LandingPage() {
  const { acceptInvite, setCurrentUser, coursesSyncStatus } = useAppStore()
  const navigate = useNavigate()
  const [inviteCode, setInviteCode] = useState('')
  const [inviteError, setInviteError] = useState<string | null>(null)

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

  return (
    <>
      <DemoDataStrip bleed />
      {coursesSyncStatus === 'synced' && (
        <div className="landing-sync-note-bleed" role="status">
          <p className="landing-sync-note">
            The course catalog is shared online for your team. Demo logins, enrollments, and transcripts are still{' '}
            <strong>sample data in this browser only</strong> in this pilot build.
          </p>
        </div>
      )}
      <main className="landing-page">
        <section className="landing-hero landing-hero--single">
          <div className="landing-hero__copy">
            <p className="section-eyebrow">Invite-only CPD academy</p>
            {isClerkConfigured() ? (
              <>
                <h1>Join with your invite or sign in</h1>
                <p className="landing-lede">
                  New here? Use the invite code from your email to create an account with that same address. Returning?
                  Sign in anytime.
                </p>
              </>
            ) : (
              <>
                <h1>Enter with your invite code</h1>
                <p className="landing-lede">
                  This page has one objective: get invited learners and reviewers into the right workspace quickly.
                </p>
              </>
            )}
          </div>

          <section className="landing-entry">
            {isClerkConfigured() ? (
              <>
                <div className="landing-entry__intro">
                  <p className="section-eyebrow">Entry</p>
                  <h2>Create an account or sign in</h2>
                  <p className="muted">
                    Treewalk email domains unlock internal courses; everyone else sees the shared catalog. Enter your
                    invite code below if you are registering for the first time—it carries through to account creation.
                  </p>
                </div>
                <div className="stack">
                  <label htmlFor="invite-code-clerk">Invite code (from your email)</label>
                  <input
                    id="invite-code-clerk"
                    value={inviteCode}
                    onChange={(event) => setInviteCode(event.target.value)}
                    placeholder="INV-XXXXXX"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <Link
                    className="button"
                    to={
                      inviteCode.trim()
                        ? `/sign-up?invite=${encodeURIComponent(inviteCode.trim())}`
                        : '/sign-up'
                    }
                  >
                    Create account
                  </Link>
                  <Link className="button button--secondary" to="/sign-in">
                    Sign in
                  </Link>
                </div>
              </>
            ) : (
              <>
                <div className="landing-entry__intro">
                  <p className="section-eyebrow">Entry</p>
                  <h2>Accept invite</h2>
                  <p className="muted">Use the code from your invitation email to continue.</p>
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
              </>
            )}
          </section>
        </section>

        {!isClerkConfigured() ? (
          <section className="landing-grid">
            <article className="landing-support">
              <div className="landing-support__head">
                <p className="section-eyebrow">QA shortcut</p>
                <h2>Need seeded role access?</h2>
              </div>
              <p className="muted">Use the dedicated demo page to jump into test personas.</p>
              <Link className="button button--secondary" to="/demo/access">
                Open demo access
              </Link>
            </article>
          </section>
        ) : null}
      </main>
    </>
  )
}
