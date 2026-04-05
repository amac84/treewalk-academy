import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'

export function CoursePlayerPage() {
  const { courseId = '' } = useParams()
  const { courses, currentUserId, getActiveEnrollment, markSegmentWatched } = useAppStore()
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
            Simulated Mux player. Segment progression is server-authoritative in production.
          </p>
          <div className="video-frame">
            <strong>Currently on:</strong>{' '}
            {sortedSegments.find((segment) => segment.id === nextSegmentId)?.title ??
              'Completed'}
          </div>
        </article>

        <aside className="segment-panel">
          <h3>Segments</h3>
          <ul className="segment-list">
            {sortedSegments.map((segment) => {
              const isWatched = enrollment.watchedSegmentIds.includes(segment.id)
              const isAllowed = isWatched || segment.id === nextSegmentId

              return (
                <li key={segment.id} className={isWatched ? 'segment watched' : 'segment'}>
                  <div>
                    <strong>{segment.title}</strong>
                    <p className="muted">
                      {segment.durationMinutes} mins · {isWatched ? 'Watched' : 'Pending'}
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
