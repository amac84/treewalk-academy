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
      <section className="player-unavailable">
        <p className="section-eyebrow">Playback unavailable</p>
        <h1>Course unavailable</h1>
        <p className="page-subtitle">The course could not be found or you are not enrolled.</p>
        <Link to="/courses" className="text-link">
          Back to courses
        </Link>
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
    <section className="player-page">
      <header className="player-header">
        <div className="stack-sm">
          <p className="section-eyebrow">Course player</p>
          <h1>{course.title}</h1>
          <p className="page-subtitle">
            Complete each segment in order. No skipping; your record updates only after each watched step.
          </p>
        </div>
        <div className="player-progress">
          <p className="player-progress__value">{watchedPercent}%</p>
          <p className="player-progress__meta">
            {enrollment.watchedMinutes} of {course.videoMinutes} minutes recorded
          </p>
        </div>
      </header>

      <div className="player-layout">
        <article className="video-shell">
          <div className="video-shell__head">
            <div>
              <p className="section-eyebrow">Now playing</p>
              <h2>{activeSegment?.title ?? 'Playback pending'}</h2>
            </div>
            <p className="meta-line">
              {activeSegment?.durationMinutes ?? 0} mins
              {activeSegment?.muxPlaybackId ? ' · Mux ready' : ' · Demo source required'}
            </p>
          </div>
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
              <div className="video-placeholder">
                <p>
                  <strong>Currently on:</strong> {activeSegment?.title ?? '—'}
                </p>
                <p>
                  No Mux playback ID is attached to this segment yet. Upload one from Admin → Courses or
                  provide <code>VITE_MUX_PLAYBACK_ID</code> for a demo asset.
                </p>
              </div>
            )}
          </div>
          <div className="player-actions">
            <Link className="action-link action-link--primary" to={`/courses/${course.id}/quiz`}>
              Go to quiz
            </Link>
            <Link className="action-link" to={`/courses/${course.id}`}>
              Course details
            </Link>
          </div>
        </article>

        <aside className="segment-panel">
          <div className="segment-panel__head">
            <div>
              <p className="section-eyebrow">Segment order</p>
              <h3>Progress ladder</h3>
            </div>
            <p className="meta-line">Finish the next unlocked step to continue.</p>
          </div>
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
                  <div className="segment-copy">
                    <p className="segment-index">{String(segment.order).padStart(2, '0')}</p>
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
                      <p className="meta-line">
                        {segment.durationMinutes} mins · {isWatched ? 'Watched' : isAllowed ? 'Ready now' : 'Locked'}
                        {segment.muxPlaybackId ? ' · Mux' : ''}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="segment-action"
                    onClick={() => markSegmentWatched(course.id, segment.id)}
                    disabled={!isAllowed || isWatched}
                  >
                    {isWatched ? 'Completed' : isAllowed ? 'Mark watched' : 'Locked'}
                  </button>
                </li>
              )
            })}
          </ul>
        </aside>
      </div>
    </section>
  )
}
