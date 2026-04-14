import { AuthenticateWithRedirectCallback } from '@clerk/react'

/** Completes OAuth / SSO redirect handshakes from `signIn.authenticateWithRedirect`. */
export function SsoCallbackPage() {
  return (
    <main className="landing-page">
      <section className="page-header page-header--compact">
        <p className="section-eyebrow">Signing you in</p>
        <h1>One moment</h1>
        <p className="page-subtitle muted">Finishing sign-in with your provider…</p>
      </section>
      <div className="admin-form-shell clerk-auth-panel">
        <AuthenticateWithRedirectCallback
          signInUrl="/sign-in"
          signUpUrl="/sign-up"
          signInFallbackRedirectUrl="/home"
          signUpFallbackRedirectUrl="/home"
          signInForceRedirectUrl="/home"
          signUpForceRedirectUrl="/home"
        />
      </div>
    </main>
  )
}
