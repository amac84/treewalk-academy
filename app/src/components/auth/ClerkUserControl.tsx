import { UserButton } from '@clerk/react'
import { isClerkConfigured } from '../../lib/clerkEnv'

export function ClerkUserControl() {
  if (!isClerkConfigured()) return null

  return (
    <div className="clerk-user-control">
      <UserButton />
    </div>
  )
}
