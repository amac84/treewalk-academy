import { useAppStore } from '../../hooks/useAppStore'

type DemoDataStripProps = {
  /** Break out to viewport width when nested inside a max-width layout (e.g. landing). */
  bleed?: boolean
}

/** Shown when Supabase env is missing: everything is in-memory mock seed data. */
export function DemoDataStrip({ bleed }: DemoDataStripProps) {
  const { coursesSyncStatus } = useAppStore()

  if (coursesSyncStatus !== 'local_only') {
    return null
  }

  const inner = (
    <div className="sync-banner sync-banner--muted sync-banner--demo-local" role="status">
      <span className="sync-banner-demo-pill">Demo data</span>
      <span>
        Users, enrollments, progress, and courses are <strong>mock seed data</strong> in this browser only.
        Add <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, run the <code>academy_courses</code>{' '}
        migration, and deploy so the shared catalog and Mux videos persist for your pilot.
      </span>
    </div>
  )

  if (bleed) {
    return <div className="demo-data-strip-bleed">{inner}</div>
  }

  return inner
}
