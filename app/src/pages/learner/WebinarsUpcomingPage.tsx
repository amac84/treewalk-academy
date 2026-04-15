import { Link } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { toDateLabel } from '../../lib/courseLogic'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsUpcomingPage() {
  const { upcomingWebinars, attendedWebinarIds } = useWebinarJourneyData()

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Calendar</p>
        <h1>Upcoming live sessions</h1>
        <p className="page-subtitle">
          This page has one objective: join the live stream and stay to the end so attendance is captured automatically.
        </p>
      </header>

      {upcomingWebinars.length === 0 ? (
        <article className="empty-state">
          <h2>No upcoming live sessions</h2>
          <p>Check session history for completed broadcasts and converted course drafts.</p>
          <Link className="link-button" to="/webinars/history">
            Open session history
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
                    <span className="chip">{webinar.status === 'live' ? 'Live now' : 'Scheduled'}</span>
                </header>
                <div className="stack-sm">
                  <p>
                    <strong>Starts:</strong> {toDateLabel(webinar.startAt)}
                  </p>
                  <p>
                    <strong>Duration:</strong> ~{webinar.expectedMinutes} minutes
                  </p>
                  <p>
                    <strong>Playback:</strong>{' '}
                    {webinar.muxPlaybackId ? 'Configured' : 'Pending stream provisioning'}
                  </p>
                </div>
                <div className="button-row">
                  <Link className="btn btn-secondary" to={`/webinars/${webinar.id}/live`}>
                    {webinar.status === 'live' ? 'Join live now' : 'Open live room'}
                  </Link>
                  <span className="meta-line">{attended ? 'Attendance qualified' : 'Attendance pending'}</span>
                </div>
              </article>
            )
          })}
        </div>
      )}

      <JourneyTaskFooter
        backTo="/webinars"
        backLabel="Back to live journey"
        nextTo="/webinars/history"
        nextLabel="Go to session history"
      />
    </section>
  )
}
