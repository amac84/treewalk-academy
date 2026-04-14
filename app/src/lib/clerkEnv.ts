import { getAppSettings } from './appSettings'

/** Publishable key for the browser bundle, sourced from the runtime app settings file. */
export function getClerkPublishableKey(): string {
  const settings = getAppSettings()
  const nextPublic = settings.nextPublicClerkPublishableKey
  if (nextPublic) return nextPublic
  return settings.clerkPublishableKey
}

/** True when Clerk is configured for this build (production or local). */
export function isClerkConfigured(): boolean {
  return Boolean(getClerkPublishableKey())
}
