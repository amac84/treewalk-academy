import { useMemo } from 'react'
import { useAppStore } from '../../hooks/useAppStore'

export function useWebinarJourneyData() {
  const { webinars, webinarAttendances, currentUserId, toggleWebinarAttendance } = useAppStore()

  const attendedWebinarIds = useMemo(() => {
    const set = new Set<string>()
    webinarAttendances
      .filter((attendance) => attendance.userId === currentUserId)
      .forEach((attendance) => set.add(attendance.webinarId))
    return set
  }, [webinarAttendances, currentUserId])

  const upcomingWebinars = useMemo(
    () =>
      webinars
        .filter((webinar) => webinar.status === 'upcoming')
        .slice()
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [webinars],
  )

  const historyWebinars = useMemo(
    () =>
      webinars
        .filter((webinar) => webinar.status === 'completed')
        .slice()
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [webinars],
  )

  const convertedCount = webinars.filter((webinar) => Boolean(webinar.convertedCourseId)).length
  const attendedCount = webinars.filter((webinar) => attendedWebinarIds.has(webinar.id)).length

  return {
    attendedWebinarIds,
    upcomingWebinars,
    historyWebinars,
    convertedCount,
    attendedCount,
    toggleWebinarAttendance,
  }
}
