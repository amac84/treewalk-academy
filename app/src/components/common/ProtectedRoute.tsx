import { useAuth } from '@clerk/react'
import type { ReactNode } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useAppStore'
import { isClerkConfigured } from '../../lib/clerkEnv'

type ProtectedRouteProps = {
  children: ReactNode
}

function DemoProtectedRoute({ children }: ProtectedRouteProps) {
  const user = useCurrentUser()
  const location = useLocation()

  if (!user) {
    return <Navigate to="/" replace state={{ from: location }} />
  }

  if (user.status === 'suspended') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

function ClerkProtectedRoute({ children }: ProtectedRouteProps) {
  const { isLoaded, isSignedIn } = useAuth()
  const user = useCurrentUser()
  const location = useLocation()

  if (!isLoaded) {
    return (
      <section className="page center-empty">
        <p className="muted">Signing you in…</p>
      </section>
    )
  }

  if (!isSignedIn) {
    return <Navigate to="/sign-in" replace state={{ from: location.pathname }} />
  }

  if (!user) {
    return (
      <section className="page center-empty">
        <p className="muted">Loading your workspace…</p>
      </section>
    )
  }

  if (user.status === 'suspended') {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
  if (isClerkConfigured()) {
    return <ClerkProtectedRoute>{children}</ClerkProtectedRoute>
  }
  return <DemoProtectedRoute>{children}</DemoProtectedRoute>
}
