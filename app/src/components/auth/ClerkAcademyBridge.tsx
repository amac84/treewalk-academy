import { useAuth, useUser } from '@clerk/react'
import { useEffect } from 'react'
import { useAppStore } from '../../hooks/useAppStore'
import { userFromClerkResource } from '../../lib/clerkAcademyUser'

/**
 * Maps the active Clerk account into the academy app store (user row + current session).
 * Clears the session user when Clerk signs out.
 */
export function ClerkAcademyBridge() {
  const { isLoaded: authLoaded, isSignedIn } = useAuth()
  const { isLoaded: userLoaded, user: clerkUser } = useUser()
  const { syncAuthUser } = useAppStore()

  useEffect(() => {
    if (!authLoaded || !userLoaded) return
    if (!isSignedIn || !clerkUser) {
      syncAuthUser(null)
      return
    }
    syncAuthUser(userFromClerkResource(clerkUser))
  }, [authLoaded, userLoaded, isSignedIn, clerkUser, syncAuthUser])

  return null
}
