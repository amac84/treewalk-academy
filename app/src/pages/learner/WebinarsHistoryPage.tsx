import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { toDateLabel } from '../../lib/courseLogic'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsHistoryPage() {
  const { historyWebinars, attendedWebinarIds } = useWebinarJourneyData()

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Calendar</p>
        <h1>Webinar history</h1>
        <p className="page-subtitle">
          This page has one objective: review completed webinar records and continue with converted courses.
        </p>
      </header>

      {historyWebinars.length === 0 ? (
        <article className="empty-state">
          <h2>No completed webinars yet</h2>
          <p>Visit upcoming webinars to join the next live session.</p>
          <Link className="link-button" to="/webinars/upcoming">
            Open upcoming webinars
          </Link>
        </article>
      ) : (
        <div className="webinar-list">
          {historyWebinars.map((webinar) => {
            const attended = attendedWebinarIds.has(webinar.id)
            return (
              <article key={webinar.id} className="webinar-item">
                <header className="webinar-item__head">
                  <div className="stack-sm">
                    <h3>{webinar.title}</h3>
                    <p className="muted">{webinar.description}</p>
                  </div>
                  <span className={`chip ${webinar.convertedCourseId ? 'chip-success' : ''}`}>
                    {webinar.convertedCourseId ? 'Converted to course' : 'Completed webinar'}
                  </span>
                </header>
                <div className="stack-sm">
                  <p>
                    <strong>Completed:</strong> {toDateLabel(webinar.startAt)}
                  </p>
                  <p>
                    <strong>Attendance:</strong> {attended ? 'Attended' : 'No attendance record'}
                  </p>
                  <p>
                    <strong>Provider:</strong> {webinar.provider} ({webinar.externalEventId})
                  </p>
                </div>
                <div className="button-row">
                  {webinar.convertedCourseId ? (
                    <Link className="btn btn-primary" to={`/courses/${webinar.convertedCourseId}`}>
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
        backLabel="Back to webinar journey"
        nextTo="/webinars/upcoming"
        nextLabel="Go to upcoming webinars"
      />
    </section>
  )
}
