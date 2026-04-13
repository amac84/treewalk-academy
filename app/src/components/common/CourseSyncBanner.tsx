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
        <span>Loading shared courses…</span>
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
        <span>Courses, lesson videos, and quiz banks are saved online — your pilot reviewers see the same catalog.</span>
        <span className="sync-banner__subtle">
          Learner progress, completions, certificates, transcripts, and playback activity are now synced to Supabase
          for continuity and evidence reporting.
        </span>
      </div>
    </div>
  )
}
