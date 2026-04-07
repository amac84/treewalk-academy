import MuxPlayer from '@mux/mux-player-react'
import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'

export function CoursePlayerPage() {
  const { courseId = '' } = useParams()
  const { courses, currentUserId, getActiveEnrollment, markSegmentWatched } = useAppStore()
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const course = courses.find((item) => item.id === courseId)
  const enrollment = getActiveEnrollment(currentUserId, courseId)

  if (!course || !enrollment) {
    return (
      <section className="empty-state">
        <h1>Course unavailable</h1>
        <p>The course could not be found or you are not enrolled.</p>
        <Link to="/courses">Back to courses</Link>
      </section>
    )
  }

  const watchedPercent = getWatchedPercentFromEnrollment(course, enrollment)
  const sortedSegments = [...course.segments].sort((a, b) => a.order - b.order)
  const nextSegmentId =
    sortedSegments.find((segment) => !enrollment.watchedSegmentIds.includes(segment.id))?.id ??
    sortedSegments[sortedSegments.length - 1]?.id

  const activeSegmentId =
    selectedSegmentId ?? nextSegmentId ?? sortedSegments[0]?.id ?? null
  const activeSegment = sortedSegments.find((segment) => segment.id === activeSegmentId)
  const demoPlaybackId = import.meta.env.VITE_MUX_PLAYBACK_ID?.trim() || ''
  const playbackId = activeSegment?.muxPlaybackId || demoPlaybackId || undefined
  const muxEnvKey = import.meta.env.VITE_MUX_ENV_KEY?.trim()

  return (
    <section className="stack-lg">
      <header className="stack-sm">
        <h1>{course.title}</h1>
        <p className="muted">
          Progress: {enrollment.watchedMinutes}/{course.videoMinutes} minutes watched (
          {watchedPercent}%)
        </p>
      </header>

      <div className="player-layout">
        <article className="video-shell">
          <h2>Video player</h2>
          <p className="muted">
            Mux playback when a segment has a playback ID (or use{' '}
            <code>VITE_MUX_PLAYBACK_ID</code> for a single demo asset).
          </p>
          <div className="video-frame mux-player-frame">
            {playbackId ? (
              <MuxPlayer
                playbackId={playbackId}
                streamType="on-demand"
                accentColor="var(--accent, #0d9488)"
                envKey={muxEnvKey || undefined}
                metadataVideoTitle={activeSegment?.title ?? course.title}
              />
            ) : (
              <p className="muted">
                <strong>Currently on:</strong> {activeSegment?.title ?? '—'}. No Mux playback ID for this
                segment — upload from Admin → Courses or set a demo ID in env.
              </p>
            )}
          </div>
        </article>

        <aside className="segment-panel">
          <h3>Segments</h3>
          <ul className="segment-list">
            {sortedSegments.map((segment) => {
              const isWatched = enrollment.watchedSegmentIds.includes(segment.id)
              const isAllowed = isWatched || segment.id === nextSegmentId
              const isActive = segment.id === activeSegmentId
              const canSelect = isWatched || isAllowed

              return (
                <li
                  key={segment.id}
                  className={[
                    'segment',
                    isWatched ? 'watched' : '',
                    isActive ? 'segment-active' : '',
                    canSelect ? 'segment-selectable' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                >
                  <div>
                    <button
                      type="button"
                      className="segment-title-btn"
                      disabled={!canSelect}
                      onClick={() => {
                        if (canSelect) setSelectedSegmentId(segment.id)
                      }}
                    >
                      <strong>{segment.title}</strong>
                    </button>
                    <p className="muted">
                      {segment.durationMinutes} mins · {isWatched ? 'Watched' : 'Pending'}
                      {segment.muxPlaybackId ? ' · Mux' : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="pill-btn"
                    onClick={() => markSegmentWatched(course.id, segment.id)}
                    disabled={!isAllowed || isWatched}
                  >
                    {isWatched
                      ? 'Completed'
                      : isAllowed
                        ? 'Mark watched'
                        : 'Locked (no skip)'}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>

      <div className="inline-actions">
        <Link className="pill-btn" to={`/courses/${course.id}/quiz`}>
          Go to quiz
        </Link>
        <Link className="ghost-btn" to={`/courses/${course.id}`}>
          Course details
        </Link>
      </div>
    </section>
  )
}
