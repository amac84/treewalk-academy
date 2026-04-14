import type { UserAccessScope } from '../types'
import { getAppSettings } from './appSettings'

const DEFAULT_INTERNAL_DOMAINS = ['treewalk.com', 'treewalkventures.com', 'treewalk.test'] as const

function parseDomainList(raw: string | undefined): Set<string> {
  const set = new Set<string>()
  const source = raw?.trim() ? raw : DEFAULT_INTERNAL_DOMAINS.join(',')
  for (const part of source.split(',')) {
    const d = part.trim().toLowerCase().replace(/^@/, '')
    if (d) set.add(d)
  }
  return set
}

let cachedDomains: Set<string> | null = null

export function getTreewalkInternalEmailDomains(): Set<string> {
  if (!cachedDomains) {
    const configuredDomains = getAppSettings().treewalkInternalEmailDomains
    cachedDomains = parseDomainList(configuredDomains.length ? configuredDomains.join(',') : undefined)
  }
  return cachedDomains
}

/** Used by tests and hot reload in dev. */
export function __resetTreewalkInternalDomainsCacheForTests(): void {
  cachedDomains = null
}

export function accessScopeFromEmail(email: string | undefined): UserAccessScope {
  if (!email?.includes('@')) return 'external'
  const domain = email.split('@').pop()?.trim().toLowerCase()
  if (!domain) return 'external'
  return getTreewalkInternalEmailDomains().has(domain) ? 'internal' : 'external'
}
