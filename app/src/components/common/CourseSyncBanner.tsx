import { useAppStore } from '../../hooks/useAppStore'
import { DemoDataStrip } from './DemoDataStrip'

export function CourseSyncBanner() {
  const { coursesSyncStatus, coursesSyncMessage, clearCoursesSyncMessage } = useAppStore()

  if (coursesSyncStatus === 'local_only') {
    return <DemoDataStrip />
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
      <div className="sync-banner__stack">
        <span>Courses and Mux playback IDs are saved to Supabase — shared for your pilot reviewers.</span>
        <span className="sync-banner__subtle">
          Learners, enrollments, completions, and transcripts are still{' '}
          <strong>in-memory demo data</strong> in this build — they are not persisted per real user yet.
        </span>
      </div>
    </div>
  )
}
