import { SignUp } from '@clerk/react'
import { Link, useSearchParams } from 'react-router-dom'

export function SignUpPage() {
  const [searchParams] = useSearchParams()
  const inviteRaw = searchParams.get('invite')?.trim()
  const inviteDisplay = inviteRaw ? inviteRaw.toUpperCase() : null

  return (
    <main className="landing-page">
      <section className="page-header page-header--compact">
        <p className="section-eyebrow">Create account</p>
        <h1>Join Treewalk Academy</h1>
        <p className="page-subtitle">
          {inviteDisplay ? (
            <>
              Invite code <code>{inviteDisplay}</code> — register with the <strong>same email address</strong> your
              invitation was sent to, then complete verification in Clerk.
            </>
          ) : (
            <>Use the email your administrator invited, then complete verification in Clerk.</>
          )}
        </p>
        <p className="muted small-copy">
          Already have an account? <Link to="/sign-in">Sign in</Link> · <Link to="/">Entry</Link>
        </p>
      </section>
      <div className="admin-form-shell clerk-auth-panel">
        <SignUp
          path="/sign-up"
          routing="path"
          signInUrl="/sign-in"
          fallbackRedirectUrl="/home"
          forceRedirectUrl="/home"
        />
      </div>
    </main>
  )
}
