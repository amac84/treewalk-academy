import { Navigate } from 'react-router-dom'
import type { UserRole } from '../../types'
import { useCurrentUser } from '../../hooks/useAppStore'

type RoleGuardProps = {
  allowedRoles: UserRole[]
  children: React.ReactNode
}

export function RoleGuard({ allowedRoles, children }: RoleGuardProps) {
  const user = useCurrentUser()

  if (!user || !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
