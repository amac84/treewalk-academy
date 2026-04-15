import { useEffect, useMemo, useRef } from 'react'
import { useAppStore } from '../../hooks/useAppStore'

export function useWebinarJourneyData() {
  const { liveOccurrences, liveOccurrenceAttendances, currentUserId, syncLiveOccurrenceStatus } = useAppStore()
  const syncedSnapshotRef = useRef<Set<string>>(new Set())

  const attendanceByOccurrenceId = useMemo(() => {
    const map = new Map<string, (typeof liveOccurrenceAttendances)[number]>()
    liveOccurrenceAttendances
      .filter((attendance) => attendance.userId === currentUserId)
      .forEach((attendance) => {
        const existing = map.get(attendance.occurrenceId)
        if (!existing) {
          map.set(attendance.occurrenceId, attendance)
          return
        }
        const existingWatched = existing.watchedSeconds ?? 0
        const nextWatched = attendance.watchedSeconds ?? 0
        if (nextWatched > existingWatched) {
          map.set(attendance.occurrenceId, attendance)
        }
      })
    return map
  }, [liveOccurrenceAttendances, currentUserId])

  const attendedWebinarIds = useMemo(() => {
    const set = new Set<string>()
    attendanceByOccurrenceId.forEach((attendance) => {
      if (attendance.qualified) {
        set.add(attendance.occurrenceId)
      }
    })
    return set
  }, [attendanceByOccurrenceId])

  const upcomingWebinars = useMemo(
    () =>
      liveOccurrences
        .filter((webinar) => webinar.status === 'scheduled' || webinar.status === 'live')
        .slice()
        .sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [liveOccurrences],
  )

  const historyWebinars = useMemo(
    () =>
      liveOccurrences
        .filter((webinar) => webinar.status === 'ended')
        .slice()
        .sort((a, b) => b.startAt.localeCompare(a.startAt)),
    [liveOccurrences],
  )

  const convertedCount = liveOccurrences.filter((webinar) => Boolean(webinar.resultingCourseId)).length
  const attendedCount = liveOccurrences.filter((webinar) => attendedWebinarIds.has(webinar.id)).length

  useEffect(() => {
    const nowMs = Date.now()
    const candidates = liveOccurrences
      .filter((webinar) => {
        if (!webinar.muxLiveStreamId || webinar.muxLiveStreamId.startsWith('local-')) return false
        if (webinar.status === 'live') return true
        if (webinar.status !== 'scheduled') return false
        const startMs = Date.parse(webinar.startAt)
        if (!Number.isFinite(startMs)) return false
        // If the scheduled window has already started, opportunistically refresh once.
        return startMs <= nowMs
      })
      .slice(0, 5)

    for (const webinar of candidates) {
      const key = [
        webinar.id,
        webinar.status,
        webinar.conversionStatus,
        webinar.muxAssetId ?? '',
        webinar.muxPlaybackId ?? '',
      ].join(':')
      if (syncedSnapshotRef.current.has(key)) continue
      syncedSnapshotRef.current.add(key)
      void syncLiveOccurrenceStatus(webinar.id)
    }
  }, [liveOccurrences, syncLiveOccurrenceStatus])

  return {
    attendedWebinarIds,
    upcomingWebinars,
    historyWebinars,
    convertedCount,
    attendedCount,
    attendanceByOccurrenceId,
  }
}
