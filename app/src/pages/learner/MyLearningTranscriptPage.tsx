import { useCallback } from 'react'

import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { RETENTION_WINDOW_YEARS } from '../../constants'
import { useAppStore, useCurrentUser } from '../../hooks/useAppStore'
import { resolveCpdProviderForTranscriptEntry } from '../../lib/cpd'
import { downloadCpdCompletionCertificate } from '../../lib/cpdCertificatePdf'
import type { TranscriptEntry } from '../../types'

function toPrettyDate(isoDate: string) {
  return new Date(isoDate).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function MyLearningTranscriptPage() {
  const user = useCurrentUser()
  const { transcriptForCurrentUser, certificates, courses } = useAppStore()

  const handleDownloadCertificate = useCallback(
    (entry: TranscriptEntry) => {
      const certificate = certificates.find((c) => c.id === entry.certificateId)
      downloadCpdCompletionCertificate({
        recipientName: user?.name ?? 'Learner',
        providerName: resolveCpdProviderForTranscriptEntry(entry, courses),
        courseTitle: entry.courseTitle,
        cpdHours: entry.cpdHours,
        completionDateIso: entry.completedAt,
        issuedAtIso: certificate?.issuedAt ?? entry.completedAt,
        passThreshold: entry.passThreshold,
        verificationCode: entry.verificationCode,
        certificateId: entry.certificateId,
        awardMethod: entry.awardMethod,
      })
    },
    [certificates, courses, user?.name],
  )

  if (!user) {
    return <p>Unable to load learner profile.</p>
  }

  return (
    <section className="page-stack transcript-page">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Learning record</p>
        <h1>Transcript</h1>
        <p className="page-subtitle">
          This page has one objective: review your CPD transcript and certificate evidence across the{' '}
          {RETENTION_WINDOW_YEARS}-year window.
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
                  <th>Provider</th>
                  <th>Pass threshold</th>
                  <th>Verification</th>
                  <th>Certificate</th>
                </tr>
              </thead>
              <tbody>
                {transcriptForCurrentUser.map((entry) => (
                  <tr key={entry.id}>
                    <td>{entry.courseTitle}</td>
                    <td>{toPrettyDate(entry.completedAt)}</td>
                    <td>{entry.cpdHours.toFixed(2)}</td>
                    <td>{resolveCpdProviderForTranscriptEntry(entry, courses)}</td>
                    <td>
                      {entry.awardMethod === 'live_attendance'
                        ? `Live attendance (${entry.passThreshold}%)`
                        : `${entry.passThreshold}%`}
                    </td>
                    <td>{entry.verificationCode}</td>
                    <td>
                      <button
                        type="button"
                        className="transcript-cert-download"
                        onClick={() => handleDownloadCertificate(entry)}
                        title="Download PDF certificate of completion"
                      >
                        Download PDF
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p>No completions yet. Continue your active learning path from the home screen.</p>
        )}
      </article>

      <JourneyTaskFooter
        backTo="/my-learning"
        backLabel="Back to learning record"
        nextTo="/my-learning/export"
        nextLabel="Go to export page"
      />
    </section>
  )
}
