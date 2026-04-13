import { useAppStore } from '../../hooks/useAppStore'

type DemoDataStripProps = {
  /** Break out to viewport width when nested inside a max-width layout (e.g. landing). */
  bleed?: boolean
}

/** Shown when the online catalog is not configured: app runs on local sample data only. */
export function DemoDataStrip({ bleed }: DemoDataStripProps) {
  const { coursesSyncStatus } = useAppStore()

  if (coursesSyncStatus !== 'local_only') {
    return null
  }

  const devHint =
    import.meta.env.DEV &&
    ' Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in app/.env, run the academy_courses migration, redeploy, and restart the dev server.'

  const inner = (
    <div className="sync-banner sync-banner--muted sync-banner--demo-local" role="status">
      <span className="sync-banner-demo-pill">Sample data</span>
      <span>
        Users, enrollments, progress, and courses here are <strong>sample data in this browser only</strong> — nothing
        is shared with your team until the site is connected to your organization&apos;s database.
        {devHint}
      </span>
    </div>
  )

  if (bleed) {
    return <div className="demo-data-strip-bleed">{inner}</div>
  }

  return inner
}
