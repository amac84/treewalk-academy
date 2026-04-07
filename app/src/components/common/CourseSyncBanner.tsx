import { useAppStore } from '../../hooks/useAppStore'

export function CourseSyncBanner() {
  const { coursesSyncStatus, coursesSyncMessage, clearCoursesSyncMessage } = useAppStore()

  if (coursesSyncStatus === 'local_only') {
    return (
      <div className="sync-banner sync-banner--muted" role="status">
        <span>
          Courses are stored in this browser only. Add <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code>, run the <code>academy_courses</code> migration, and deploy so
          everyone sees the same catalog and Mux videos.
        </span>
      </div>
    )
  }

  if (coursesSyncStatus === 'loading') {
    return (
      <div className="sync-banner sync-banner--loading" role="status">
        <span>Loading shared courses from Supabase…</span>
      </div>
    )
  }

  if (coursesSyncStatus === 'error') {
    return (
      <div className="sync-banner sync-banner--error" role="alert">
        <span>{coursesSyncMessage ?? 'Could not sync courses.'}</span>
        <button type="button" className="sync-banner-dismiss" onClick={clearCoursesSyncMessage}>
          Dismiss
        </button>
      </div>
    )
  }

  if (coursesSyncMessage) {
    return (
      <div className="sync-banner sync-banner--error" role="alert">
        <span>{coursesSyncMessage}</span>
        <button type="button" className="sync-banner-dismiss" onClick={clearCoursesSyncMessage}>
          Dismiss
        </button>
      </div>
    )
  }

  return (
    <div className="sync-banner sync-banner--ok" role="status">
      <span>Courses and Mux playback IDs are saved to Supabase — shared for your pilot reviewers.</span>
    </div>
  )
}
