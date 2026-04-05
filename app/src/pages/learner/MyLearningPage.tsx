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
    <section className="page-stack">
      <header className="page-header">
        <h1>My Learning</h1>
        <p>
          Your CPD transcript stays available for {RETENTION_WINDOW_YEARS} years
          with downloadable evidence.
        </p>
      </header>

      <article className="panel">
        <h2>Transcript (3-year window)</h2>
        {transcriptForCurrentUser.length ? (
          <div className="table-wrap">
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

      <article className="panel row-space-between">
        <div>
          <h2>CPD Export</h2>
          <p>Generate a CSV export for your internal CPD records.</p>
        </div>
        <button type="button" className="btn btn-outline">
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
