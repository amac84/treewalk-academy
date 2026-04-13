import { Link } from 'react-router-dom'
import { JourneyHubPage, type JourneyHubCard } from '../../components/common/JourneyHubPage'
import { RETENTION_WINDOW_YEARS } from '../../constants'
import { useAppStore, useCurrentUser } from '../../hooks/useAppStore'

export function MyLearningPage() {
  const user = useCurrentUser()
  const { transcriptForCurrentUser } = useAppStore()

  if (!user) {
    return <p>Unable to load learner profile.</p>
  }

  const totalHours = transcriptForCurrentUser.reduce((sum, entry) => sum + entry.cpdHours, 0)
  const cards: JourneyHubCard[] = [
    {
      eyebrow: 'Transcript',
      title: 'Review learning history',
      description: `Browse completions and certificate links in your ${RETENTION_WINDOW_YEARS}-year record.`,
      meta: `${transcriptForCurrentUser.length} completion record(s) · ${totalHours.toFixed(2)} CPD hours`,
      to: '/my-learning/transcript',
      cta: 'Open transcript page',
    },
    {
      eyebrow: 'Export',
      title: 'Download CSV evidence',
      description: 'Export your transcript as a CSV file for employers, regulators, or internal records.',
      meta: 'CSV includes course title, completion date, hours, and certificate ID.',
      to: '/my-learning/export',
      cta: 'Open export page',
    },
  ]

  return (
    <JourneyHubPage
      sectionClassName="page-stack transcript-page"
      headerEyebrow="Learning record"
      headerTitle="My Learning"
      headerSubtitle="This page has one objective: route you to transcript review or export."
      cards={cards}
      footer={
        <Link to="/home" className="link-button">
          ← Back to Home
        </Link>
      }
    />
  )
}
