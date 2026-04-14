import type { User as AcademyUser, UserRole } from '../types'
import { getAppSettings } from './appSettings'
import { accessScopeFromEmail } from './treewalkEmail'

const ACADEMY_ROLES: UserRole[] = [
  'learner',
  'instructor',
  'content_admin',
  'hr_admin',
  'super_admin',
]

function isUserRole(value: unknown): value is UserRole {
  return typeof value === 'string' && (ACADEMY_ROLES as readonly string[]).includes(value)
}

/**
 * Clerk Dashboard → Users → Public metadata: `{ "academyRole": "content_admin" }`.
 * Optional: `superAdminEmails` in `/app-settings.json` or `VITE_SUPER_ADMIN_EMAILS` (comma-separated)
 * forces `super_admin` for matching primary emails so you can bootstrap without editing every user in Clerk.
 */
export function academyRoleFromPublicMetadata(publicMetadata: Record<string, unknown> | undefined): UserRole {
  const raw = publicMetadata?.academyRole ?? publicMetadata?.role
  if (isUserRole(raw)) return raw
  return 'learner'
}

export function academyRoleForClerkUser(
  email: string,
  publicMetadata: Record<string, unknown> | undefined,
): UserRole {
  const normalized = email.trim().toLowerCase()
  if (normalized && getAppSettings().superAdminEmails.includes(normalized)) {
    return 'super_admin'
  }
  return academyRoleFromPublicMetadata(publicMetadata)
}

type ClerkUserLike = {
  id: string
  primaryEmailAddress?: { emailAddress: string } | null
  firstName?: string | null
  lastName?: string | null
  fullName?: string | null
  createdAt?: Date | null
  publicMetadata: Record<string, unknown>
}

export function userFromClerkResource(user: ClerkUserLike): AcademyUser {
  const email = user.primaryEmailAddress?.emailAddress ?? ''
  const joined =
    user.createdAt instanceof Date
      ? user.createdAt.toISOString()
      : new Date().toISOString()
  const nameFromParts = [user.firstName, user.lastName].filter(Boolean).join(' ').trim()
  const name = (user.fullName?.trim() || nameFromParts || email || 'Learner').trim()

  return {
    id: user.id,
    name,
    email,
    role: academyRoleForClerkUser(email, user.publicMetadata),
    status: 'active',
    invitedAt: joined,
    joinedAt: joined,
    accessScope: accessScopeFromEmail(email),
  }
}
