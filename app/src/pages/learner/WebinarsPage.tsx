import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { toDateLabel } from '../../lib/courseLogic'
import { useAppStore } from '../../hooks/useAppStore'
import type { Webinar } from '../../types'

function WebinarCard({
  webinar,
  attended,
  onToggleAttendance,
}: {
  webinar: Webinar
  attended: boolean
  onToggleAttendance: () => void
}) {
  return (
    <article className="webinar-item">
      <header className="webinar-item__head">
        <div className="stack-sm">
          <h3>{webinar.title}</h3>
          <p className="muted">{webinar.description}</p>
        </div>
        <span className={`chip ${webinar.convertedCourseId ? 'chip-success' : ''}`}>
          {webinar.convertedCourseId ? 'Converted to course' : 'Live webinar'}
        </span>
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
        <button type="button" className="btn btn-ghost" onClick={onToggleAttendance}>
          {attended ? 'Mark unattended' : 'Mark attended'}
        </button>
        {webinar.convertedCourseId ? (
          <Link className="btn btn-primary" to={`/courses/${webinar.convertedCourseId}`}>
            Open converted course
          </Link>
        ) : null}
      </div>
    </article>
  )
}

export function WebinarsPage() {
  const { webinars, toggleWebinarAttendance, currentUserId, webinarAttendances } = useAppStore()

  const attendanceByWebinar = useMemo(() => {
    const set = new Set<string>()
    webinarAttendances
      .filter((attendance) => attendance.userId === currentUserId)
      .forEach((attendance) => set.add(attendance.webinarId))
    return set
  }, [webinarAttendances, currentUserId])

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Calendar</p>
        <h1>Webinars</h1>
        <p className="muted">
          Attend live Teams sessions and continue learning later when sessions are converted into
          on-demand courses.
        </p>
      </header>

      <div className="webinar-list">
        {webinars.map((webinar) => (
          <WebinarCard
            key={webinar.id}
            webinar={webinar}
            attended={attendanceByWebinar.has(webinar.id)}
            onToggleAttendance={() => toggleWebinarAttendance(webinar.id)}
          />
        ))}
      </div>
    </section>
  )
}
