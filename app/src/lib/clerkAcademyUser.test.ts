import { describe, expect, it } from 'vitest'
import { __setAppSettingsForTests } from './appSettings'
import { academyRoleForClerkUser, academyRoleFromPublicMetadata, userFromClerkResource } from './clerkAcademyUser'
import { __resetTreewalkInternalDomainsCacheForTests } from './treewalkEmail'

describe('clerkAcademyUser', () => {
  it('reads academyRole from Clerk public metadata', () => {
    expect(academyRoleFromPublicMetadata({ academyRole: 'content_admin' })).toBe('content_admin')
    expect(academyRoleFromPublicMetadata({ role: 'hr_admin' })).toBe('hr_admin')
    expect(academyRoleFromPublicMetadata({})).toBe('learner')
  })

  it('forces super_admin when email is in app superAdminEmails', () => {
    __setAppSettingsForTests({ superAdminEmails: ['boss@treewalk.com'] })
    __resetTreewalkInternalDomainsCacheForTests()
    expect(academyRoleForClerkUser('Boss@Treewalk.COM', { academyRole: 'learner' })).toBe('super_admin')
    expect(
      userFromClerkResource({
        id: 'u1',
        primaryEmailAddress: { emailAddress: 'boss@treewalk.com' },
        publicMetadata: { academyRole: 'learner' },
      }).role,
    ).toBe('super_admin')
    __setAppSettingsForTests()
    __resetTreewalkInternalDomainsCacheForTests()
  })
})
