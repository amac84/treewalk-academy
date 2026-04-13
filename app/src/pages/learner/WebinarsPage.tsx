import { JourneyHubPage, type JourneyHubCard } from '../../components/common/JourneyHubPage'
import { useWebinarJourneyData } from './webinarJourney'

export function WebinarsPage() {
  const { upcomingWebinars, historyWebinars, attendedCount, convertedCount } = useWebinarJourneyData()
  const cards: JourneyHubCard[] = [
    {
      eyebrow: 'Upcoming',
      title: 'Attend live webinars',
      description: 'Join Teams sessions and mark attendance for upcoming events.',
      meta: `${upcomingWebinars.length} upcoming session(s).`,
      to: '/webinars/upcoming',
      cta: 'Open upcoming webinars',
    },
    {
      eyebrow: 'History',
      title: 'Review attendance history',
      description: 'Check completed webinar records and open converted courses when available.',
      meta: `${historyWebinars.length} completed · ${attendedCount} attended · ${convertedCount} converted`,
      to: '/webinars/history',
      cta: 'Open webinar history',
    },
  ]

  return (
    <JourneyHubPage
      sectionClassName="page page-learner page-webinars"
      headerEyebrow="Calendar"
      headerTitle="Webinar journey"
      headerSubtitle="This page has one objective: route you to the webinar task you need now."
      cards={cards}
    />
  )
}
