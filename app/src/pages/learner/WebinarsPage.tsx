import { JourneyHubPage, type JourneyHubCard } from '../../components/common/JourneyHubPage'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsPage() {
  const { upcomingWebinars, historyWebinars, attendedCount, convertedCount } = useWebinarJourneyData()
  const cards: JourneyHubCard[] = [
    {
      eyebrow: 'Upcoming',
      title: 'Attend live sessions',
      description: 'Join Academy live streams and stay through the end-window for automatic attendance capture.',
      meta: `${upcomingWebinars.length} upcoming session(s).`,
      to: '/webinars/upcoming',
      cta: 'Open upcoming sessions',
    },
    {
      eyebrow: 'History',
      title: 'Review attendance history',
      description: 'Check completed live records and open converted courses when available.',
      meta: `${historyWebinars.length} completed · ${attendedCount} attended · ${convertedCount} converted`,
      to: '/webinars/history',
      cta: 'Open session history',
    },
  ]

  return (
    <JourneyHubPage
      sectionClassName="page page-learner page-webinars"
      headerEyebrow="Calendar"
      headerTitle="Live session journey"
      headerSubtitle="This page has one objective: route you to the live-session task you need now."
      cards={cards}
    />
  )
}
