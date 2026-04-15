import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { toDateLabel } from '../../lib/courseLogic'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsHistoryPage() {
  const { historyWebinars, attendedWebinarIds, attendanceByOccurrenceId } = useWebinarJourneyData()

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Calendar</p>
        <h1>Live session history</h1>
        <p className="page-subtitle">
          This page has one objective: review completed session records and continue with converted courses.
        </p>
      </header>

      {historyWebinars.length === 0 ? (
        <article className="empty-state">
          <h2>No completed sessions yet</h2>
          <p>Visit upcoming sessions to join the next live broadcast.</p>
          <Link className="link-button" to="/webinars/upcoming">
            Open upcoming sessions
          </Link>
        </article>
      ) : (
        <div className="webinar-list">
          {historyWebinars.map((webinar) => {
            const attended = attendedWebinarIds.has(webinar.id)
            const attendance = attendanceByOccurrenceId.get(webinar.id)
            return (
              <article key={webinar.id} className="webinar-item">
                <header className="webinar-item__head">
                  <div className="stack-sm">
                    <h3>{webinar.title}</h3>
                    <p className="muted">{webinar.description}</p>
                  </div>
                  <span className={`chip ${webinar.resultingCourseId ? 'chip-success' : ''}`}>
                    {webinar.resultingCourseId ? 'Converted to course' : 'Completed live session'}
                  </span>
                </header>
                <div className="stack-sm">
                  <p>
                    <strong>Completed:</strong> {toDateLabel(webinar.startAt)}
                  </p>
                  <p>
                    <strong>Attendance:</strong>{' '}
                    {attended
                      ? 'Qualified'
                      : attendance
                        ? 'Tracked but not qualified'
                        : 'No attendance record'}
                  </p>
                  {attendance ? (
                    <p>
                      <strong>Watched:</strong> {((attendance.watchedSeconds ?? 0) / 60).toFixed(1)} minutes
                    </p>
                  ) : null}
                  <p>
                    <strong>Conversion:</strong> {webinar.conversionStatus.replace('_', ' ')}
                  </p>
                </div>
                <div className="button-row">
                  {webinar.resultingCourseId ? (
                    <Link className="btn btn-primary" to={`/courses/${webinar.resultingCourseId}`}>
                      Open converted course
                    </Link>
                  ) : (
                    <span className="meta-line">No converted course yet.</span>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/webinars"
        backLabel="Back to live journey"
        nextTo="/webinars/upcoming"
        nextLabel="Go to upcoming sessions"
      />
    </section>
  )
}
