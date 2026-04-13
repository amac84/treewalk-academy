import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { toDateLabel } from '../../lib/courseLogic'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsUpcomingPage() {
  const { upcomingWebinars, attendedWebinarIds, toggleWebinarAttendance } = useWebinarJourneyData()

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Calendar</p>
        <h1>Upcoming webinars</h1>
        <p className="page-subtitle">
          This page has one objective: attend upcoming sessions and confirm your attendance.
        </p>
      </header>

      {upcomingWebinars.length === 0 ? (
        <article className="empty-state">
          <h2>No upcoming webinars</h2>
          <p>Check webinar history for completed sessions and converted courses.</p>
          <Link className="link-button" to="/webinars/history">
            Open webinar history
          </Link>
        </article>
      ) : (
        <div className="webinar-list">
          {upcomingWebinars.map((webinar) => {
            const attended = attendedWebinarIds.has(webinar.id)
            return (
              <article key={webinar.id} className="webinar-item">
                <header className="webinar-item__head">
                  <div className="stack-sm">
                    <h3>{webinar.title}</h3>
                    <p className="muted">{webinar.description}</p>
                  </div>
                  <span className="chip">Live webinar</span>
                </header>
                <div className="stack-sm">
                  <p>
                    <strong>Starts:</strong> {toDateLabel(webinar.startAt)}
                  </p>
                  <p>
                    <strong>Provider:</strong> {webinar.provider} ({webinar.externalEventId})
                  </p>
                </div>
                <div className="button-row">
                  <a className="btn btn-secondary" href={webinar.teamsJoinUrl} target="_blank" rel="noreferrer">
                    Join on Teams
                  </a>
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => toggleWebinarAttendance(webinar.id)}
                  >
                    {attended ? 'Mark unattended' : 'Mark attended'}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/webinars"
        backLabel="Back to webinar journey"
        nextTo="/webinars/history"
        nextLabel="Go to webinar history"
      />
    </section>
  )
}
