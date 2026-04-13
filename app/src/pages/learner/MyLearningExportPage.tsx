import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { useAppStore, useCurrentUser } from '../../hooks/useAppStore'

function toCsvCell(value: string) {
  const escaped = value.replace(/"/g, '""')
  return `"${escaped}"`
}

export function MyLearningExportPage() {
  const user = useCurrentUser()
  const { transcriptForCurrentUser } = useAppStore()

  if (!user) {
    return <p>Unable to load learner profile.</p>
  }

  const totalHours = transcriptForCurrentUser.reduce((sum, entry) => sum + entry.cpdHours, 0)

  const downloadCsv = () => {
    const header = [
      'Course',
      'Completed At',
      'CPD Hours',
      'Provider',
      'Pass Threshold',
      'Quiz Attempt ID',
      'Activity Watched Minutes',
      'Certificate ID',
      'Verification Code',
    ]
    const rows = transcriptForCurrentUser.map((entry) => [
      entry.courseTitle,
      new Date(entry.completedAt).toISOString(),
      entry.cpdHours.toFixed(2),
      entry.providerName,
      `${entry.passThreshold}%`,
      entry.quizAttemptId,
      entry.activityWatchedMinutes.toFixed(2),
      entry.certificateId,
      entry.verificationCode,
    ])
    const csv = [header, ...rows].map((row) => row.map((cell) => toCsvCell(cell)).join(',')).join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `treewalk-transcript-${user.name.toLowerCase().replace(/\s+/g, '-')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="page-stack transcript-page">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Learning record</p>
        <h1>Export transcript</h1>
        <p className="page-subtitle">
          This page has one objective: download your CPD transcript as CSV for regulator or employer records.
        </p>
      </header>

      <article className="document-panel document-panel--action">
        <div className="stack-sm">
          <p className="eyebrow">Export</p>
          <h2>Create CSV snapshot</h2>
          <p className="section-copy">
            Includes course title, completion timestamp, provider, pass threshold, watched activity, and certificate
            verification evidence.
          </p>
          <p className="meta-line">
            {transcriptForCurrentUser.length} completion record(s) · {totalHours.toFixed(2)} CPD hours
          </p>
        </div>
        <button
          type="button"
          className="button button--secondary"
          onClick={downloadCsv}
          disabled={transcriptForCurrentUser.length === 0}
        >
          Export CSV
        </button>
      </article>

      <JourneyTaskFooter
        backTo="/my-learning"
        backLabel="Back to learning record"
        nextTo="/my-learning/transcript"
        nextLabel="Go to transcript page"
      />
    </section>
  )
}
