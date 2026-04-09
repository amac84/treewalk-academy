import { Link } from 'react-router-dom'
import { RETENTION_WINDOW_YEARS } from '../../constants'
import { useAppStore, useCurrentUser } from '../../hooks/useAppStore'

function toPrettyDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function MyLearningPage() {
  const user = useCurrentUser()
  const { transcriptForCurrentUser, certificates } = useAppStore()

  if (!user) {
    return <p>Unable to load learner profile.</p>
  }

  return (
    <section className="page-stack transcript-page">
      <header className="page-header page-header--split">
        <div>
          <p className="section-eyebrow">Learning record</p>
          <h1>My Learning</h1>
        </div>
        <p className="page-subtitle">
          Your CPD transcript stays available for {RETENTION_WINDOW_YEARS} years with downloadable evidence.
        </p>
      </header>

      <article className="document-panel">
        <div className="section-head section-head--stack">
          <div>
            <p className="eyebrow">Transcript</p>
            <h2>Three-year CPD window</h2>
          </div>
          <p className="section-copy">A defensible record of completed learning and certificate evidence.</p>
        </div>
        {transcriptForCurrentUser.length ? (
          <div className="table-wrap transcript-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Course</th>
                  <th>Completed</th>
                  <th>CPD Hours</th>
                  <th>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {transcriptForCurrentUser.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.courseTitle}</td>
                    <td>{toPrettyDate(entry.completedAt)}</td>
                    <td>{entry.cpdHours.toFixed(2)}</td>
                    <td>
                      <a
                        href={`#certificate-${entry.certificateId}`}
                        download
                        title={
                          certificates.find((certificate) => certificate.id === entry.certificateId)
                            ? 'Certificate available'
                            : 'Certificate'
                        }
                      >
                        Download
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>
            No completions yet. Continue your active learning path from the home
            screen.
          </p>
        )}
      </article>

      <article className="document-panel document-panel--action">
        <div>
          <p className="eyebrow">Export</p>
          <h2>Take a copy for internal records</h2>
          <p className="section-copy">Generate a CSV snapshot for your employer, regulator, or compliance file.</p>
        </div>
        <button type="button" className="button button--secondary">
          Export CSV
        </button>
      </article>

      <footer>
        <Link to="/home" className="link-button">
          ← Back to Home
        </Link>
      </footer>
    </section>
  )
}
