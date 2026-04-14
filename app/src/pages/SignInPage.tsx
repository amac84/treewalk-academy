import { SignIn } from '@clerk/react'
import { Link } from 'react-router-dom'

export function SignInPage() {
  return (
    <main className="landing-page">
      <section className="page-header page-header--compact">
        <p className="section-eyebrow">Sign in</p>
        <h1>Treewalk Academy</h1>
        <p className="page-subtitle">
          Treewalk email addresses unlock internal courses. Other accounts see the public catalog only.
        </p>
        <p className="muted small-copy">
          <Link to="/">← Back to entry</Link>
          {' · '}
          New with an invite? <Link to="/">Create an account from entry</Link>
        </p>
      </section>
      <div className="admin-form-shell clerk-auth-panel">
        <SignIn
          path="/sign-in"
          routing="path"
          signUpUrl="/sign-up"
          fallbackRedirectUrl="/home"
          forceRedirectUrl="/home"
        />
      </div>
    </main>
  )
}
