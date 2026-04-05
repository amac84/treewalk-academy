import { Navigate, useLocation } from 'react-router-dom'
import { useCurrentUser } from '../../hooks/useAppStore'

type ProtectedRouteProps = {
  children: React.ReactNode
}

export function ProtectedRoute({ children }: ProtectedRouteProps) {
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
