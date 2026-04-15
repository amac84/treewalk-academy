import { useCallback, useEffect, useMemo, useRef } from 'react'
import MuxPlayer from '@mux/mux-player-react'
import { Link, useParams } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { LIVE_ATTENDANCE_HEARTBEAT_INTERVAL_SECONDS } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { learnerCanAccessCourseAudience } from '../../lib/courseAccess'
import { getAppSettings } from '../../lib/appSettings'
import { getLiveAttendanceRequiredWatchSeconds } from '../../lib/liveAttendance'

export function WebinarLivePage() {
  const { occurrenceId = '' } = useParams()
  const {
    currentUser,
    liveOccurrences,
    liveOccurrenceAttendances,
    startLiveOccurrenceWatch,
    heartbeatLiveOccurrenceWatch,
    stopLiveOccurrenceWatch,
    finalizeLiveOccurrenceAttendance,
    syncLiveOccurrenceStatus,
  } = useAppStore()
  const occurrence = liveOccurrences.find((item) => item.id === occurrenceId)
  const envKey = getAppSettings().muxEnvironmentKey
  const attendance = useMemo(
    () =>
      currentUser
        ? liveOccurrenceAttendances.find(
            (item) => item.occurrenceId === occurrenceId && item.userId === currentUser.id,
          )
        : undefined,
    [currentUser, liveOccurrenceAttendances, occurrenceId],
  )
  const requiredWatchSeconds = useMemo(
    () => (occurrence ? getLiveAttendanceRequiredWatchSeconds(occurrence.expectedMinutes) : 0),
    [occurrence],
  )
  const watchedSeconds = Math.max(0, attendance?.watchedSeconds ?? 0)
  const watchedMinutes = (watchedSeconds / 60).toFixed(1)
  const requiredWatchMinutes = (requiredWatchSeconds / 60).toFixed(1)
  const heartbeatTimerRef = useRef<number | null>(null)
  const lastTickRef = useRef(0)
  const watchingRef = useRef(false)

  const stopTracking = useCallback(() => {
    if (heartbeatTimerRef.current != null) {
      window.clearInterval(heartbeatTimerRef.current)
      heartbeatTimerRef.current = null
    }
    if (!watchingRef.current || !occurrence) return
    watchingRef.current = false
    stopLiveOccurrenceWatch(occurrence.id)
  }, [occurrence, stopLiveOccurrenceWatch])

  const startTracking = useCallback(() => {
    if (!occurrence || !currentUser) return
    if (watchingRef.current) return
    watchingRef.current = true
    lastTickRef.current = Date.now()
    startLiveOccurrenceWatch(occurrence.id)
    heartbeatTimerRef.current = window.setInterval(() => {
      if (!watchingRef.current || document.visibilityState !== 'visible') return
      const now = Date.now()
      const deltaSeconds = Math.max(0, (now - lastTickRef.current) / 1000)
      lastTickRef.current = now
      heartbeatLiveOccurrenceWatch(occurrence.id, deltaSeconds)
    }, LIVE_ATTENDANCE_HEARTBEAT_INTERVAL_SECONDS * 1000)
  }, [currentUser, occurrence, startLiveOccurrenceWatch, heartbeatLiveOccurrenceWatch])

  useEffect(() => {
    return () => {
      stopTracking()
    }
  }, [stopTracking])

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        stopTracking()
      }
    }
    document.addEventListener('visibilitychange', handleVisibilityChange)
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange)
  }, [stopTracking])

  useEffect(() => {
    if (!occurrence?.muxLiveStreamId || occurrence.muxLiveStreamId.startsWith('local-')) return
    if (occurrence.status === 'ended') {
      stopTracking()
      finalizeLiveOccurrenceAttendance(occurrence.id)
      return
    }
    void syncLiveOccurrenceStatus(occurrence.id)
    const timer = window.setInterval(() => {
      void syncLiveOccurrenceStatus(occurrence.id)
    }, 60 * 1000)
    return () => window.clearInterval(timer)
  }, [occurrence, syncLiveOccurrenceStatus, stopTracking, finalizeLiveOccurrenceAttendance])

  if (!currentUser || !occurrence) {
    return (
      <section className="page page-learner page-webinars">
        <header className="page-header page-header--compact">
          <p className="section-eyebrow">Live session</p>
          <h1>Session not found</h1>
          <p className="page-subtitle">This live session no longer exists or you do not have access.</p>
        </header>
        <JourneyTaskFooter
          backTo="/webinars/upcoming"
          backLabel="Back to upcoming sessions"
          nextTo="/courses"
          nextLabel="Browse courses"
        />
      </section>
    )
  }

  const canAccess = learnerCanAccessCourseAudience(currentUser.accessScope, occurrence.audience)
  if (!canAccess) {
    return (
      <section className="page page-learner page-webinars">
        <header className="page-header page-header--compact">
          <p className="section-eyebrow">Live session</p>
          <h1>Access restricted</h1>
          <p className="page-subtitle">This session is currently available to internal users only.</p>
        </header>
        <JourneyTaskFooter
          backTo="/webinars/upcoming"
          backLabel="Back to upcoming sessions"
          nextTo="/courses"
          nextLabel="Browse courses"
        />
      </section>
    )
  }

  return (
    <section className="page page-learner page-webinars">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Live session</p>
        <h1>{occurrence.title}</h1>
        <p className="page-subtitle">
          Starts {new Date(occurrence.startAt).toLocaleString()} · {occurrence.expectedMinutes} minutes ·{' '}
          {occurrence.status === 'live' ? 'Live now' : occurrence.status}
        </p>
        <p className="meta-line">
          Attendance is tracked automatically when playback is active and you remain through the session finish window.
        </p>
      </header>

      <article className="webinar-item">
        {occurrence.muxPlaybackId ? (
          <MuxPlayer
            playbackId={occurrence.muxPlaybackId}
            streamType="ll-live"
            accentColor="var(--accent, #0d9488)"
            envKey={envKey || undefined}
            metadataVideoTitle={occurrence.title}
            onPlay={() => {
              startTracking()
            }}
            onPause={() => {
              stopTracking()
            }}
            onEnded={() => {
              stopTracking()
              finalizeLiveOccurrenceAttendance(occurrence.id)
            }}
          />
        ) : (
          <div className="video-placeholder">
            <p>
              The live stream is still provisioning. Click refresh status and try again in a moment.
            </p>
          </div>
        )}
        <p className="meta-line">
          {attendance?.qualified
            ? 'Attendance qualified. Transcript and CPD certificate will issue after session conversion.'
            : occurrence.status === 'ended'
              ? 'Session ended. Attendance is being evaluated against watch-time and end-presence rules.'
              : `Attendance progress: ${watchedMinutes} / ${requiredWatchMinutes} required live minutes.`}
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-secondary" onClick={() => void syncLiveOccurrenceStatus(occurrence.id)}>
            Refresh stream status
          </button>
          {occurrence.resultingCourseId ? (
            <Link className="btn btn-primary" to={`/courses/${occurrence.resultingCourseId}`}>
              Open replay course
            </Link>
          ) : null}
        </div>
      </article>

      <JourneyTaskFooter
        backTo="/webinars/upcoming"
        backLabel="Back to upcoming sessions"
        nextTo="/webinars/history"
        nextLabel="Go to session history"
      />
    </section>
  )
}
