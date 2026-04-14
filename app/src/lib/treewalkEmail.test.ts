import { describe, expect, it } from 'vitest'
import { accessScopeFromEmail, __resetTreewalkInternalDomainsCacheForTests } from './treewalkEmail'

describe('treewalkEmail', () => {
  it('classifies built-in Treewalk domains as internal', () => {
    __resetTreewalkInternalDomainsCacheForTests()
    expect(accessScopeFromEmail('user@treewalk.test')).toBe('internal')
    expect(accessScopeFromEmail('user@treewalk.com')).toBe('internal')
    expect(accessScopeFromEmail('user@treewalkventures.com')).toBe('internal')
    expect(accessScopeFromEmail('user@gmail.com')).toBe('external')
  })
})
