import MuxPlayer from '@mux/mux-player-react'
import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import { getAppSettings } from '../../lib/appSettings'
import { learnerCanAccessCourse } from '../../lib/courseAccess'
import { getWatchedPercentFromEnrollment } from '../../lib/courseLogic'
import {
  buildCourseTranscriptDownload,
  buildCourseTranscriptPlainText,
  formatTranscriptTimestamp,
  readTranscriptData,
} from '../../lib/transcript'

type MuxPlayerElement = HTMLElement & {
  currentTime?: number
  duration?: number
  playbackRate?: number
}

export function CoursePlayerPage() {
  const { courseId = '' } = useParams()
  const { courses, currentUserId, currentUser, getActiveEnrollment, recordVideoPlayback } = useAppStore()
  const [transcriptExpanded, setTranscriptExpanded] = useState(false)
  const [copyFeedback, setCopyFeedback] = useState<'idle' | 'copied' | 'error'>('idle')
  const playerRef = useRef<MuxPlayerElement | null>(null)
  const lastTickRef = useRef<number | null>(null)
  const isPlayingRef = useRef(false)
  const copyFeedbackTimerRef = useRef<number | null>(null)
  const course = courses.find((item) => item.id === courseId)
  const enrollment = getActiveEnrollment(currentUserId, courseId)

  const blocked =
    course &&
    enrollment &&
    currentUser?.role === 'learner' &&
    !learnerCanAccessCourse(currentUser, course)

  if (!course || !enrollment || blocked) {
    return (
      <section className="player-unavailable">
        <p className="section-eyebrow">Playback unavailable</p>
        <h1>Course unavailable</h1>
        <p className="page-subtitle">
          {blocked
            ? 'This lesson is for Treewalk team members only.'
            : 'The course could not be found or you are not enrolled.'}
        </p>
        <Link to="/courses" className="text-link">
          Back to courses
        </Link>
      </section>
    )
  }

  const watchedPercent = getWatchedPercentFromEnrollment(course, enrollment)
  const activeTranscript = readTranscriptData({
    transcript: course.transcript,
    transcriptText: course.transcriptText,
    durationMinutes: course.videoMinutes,
  })
  const transcriptCues = activeTranscript?.segments ?? []
  const collapsedCueCount = 4
  const visibleTranscriptCues = transcriptExpanded ? transcriptCues : transcriptCues.slice(0, collapsedCueCount)
  const transcriptHasHiddenCues = transcriptCues.length > visibleTranscriptCues.length
  const courseTranscriptPlainText = buildCourseTranscriptPlainText(course)
  const canExportCourseTranscript = courseTranscriptPlainText.trim().length > 0
  const activeProgress = enrollment.videoProgress
  const demoPlaybackId = getAppSettings().muxPlaybackId
  const playbackId = course.muxPlaybackId || demoPlaybackId || undefined
  const muxEnvKey = getAppSettings().muxEnvironmentKey
  const quizUnlocked = watchedPercent >= 100
  const allowedSeekSecond = Math.max(
    0,
    (activeProgress?.completed ? activeProgress.durationSeconds : activeProgress?.furthestSecond) ?? 0,
  )

  // Sync tick baseline when entering this course only. Do not depend on
  // lastPositionSecond from heartbeats — that would clear isPlayingRef while
  // the video is still playing and stop verified-time accumulation.
  useEffect(() => {
    lastTickRef.current = activeProgress?.lastPositionSecond ?? 0
    isPlayingRef.current = false
  }, [course.id])

  useEffect(() => {
    setTranscriptExpanded(false)
    setCopyFeedback('idle')
  }, [course.id])

  useEffect(() => {
    return () => {
      if (copyFeedbackTimerRef.current != null) {
        window.clearTimeout(copyFeedbackTimerRef.current)
      }
    }
  }, [])

  // Resume saved position once per course mount, not on every progress update
  // (otherwise each heartbeat could snap the playhead backward).
  useEffect(() => {
    const player = playerRef.current
    const resumeAt = activeProgress?.lastPositionSecond
    if (!player || resumeAt == null || resumeAt <= 0) return
    if (Math.abs(Number(player.currentTime ?? 0) - resumeAt) < 3) return
    player.currentTime = resumeAt
  }, [course.id])

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!isPlayingRef.current) return
      const player = playerRef.current
      const currentTime = Math.max(0, Number(player?.currentTime ?? 0))
      const durationSeconds = Math.max(1, Math.round(Number(player?.duration || course.videoMinutes * 60 || 1)))
      const previous = lastTickRef.current ?? currentTime
      const watchedDeltaSeconds = Math.max(0, currentTime - previous)
      lastTickRef.current = currentTime
      recordVideoPlayback(course.id, {
        positionSecond: currentTime,
        durationSeconds,
        watchedDeltaSeconds,
        isPlaying: true,
      })
    }, 5000)
    return () => window.clearInterval(timer)
  }, [course.id, course.videoMinutes, recordVideoPlayback])

  const handlePlayPauseEvent = (resumed: boolean) => {
    const player = playerRef.current
    const currentTime = Math.max(0, Number(player?.currentTime ?? 0))
    const durationSeconds = Math.max(1, Math.round(Number(player?.duration || course.videoMinutes * 60 || 1)))
    const previous = lastTickRef.current ?? currentTime
    const watchedDeltaSeconds = resumed ? 0 : Math.max(0, currentTime - previous)
    lastTickRef.current = currentTime
    recordVideoPlayback(course.id, {
      positionSecond: currentTime,
      durationSeconds,
      watchedDeltaSeconds,
      isPlaying: resumed,
      paused: !resumed,
      resumed,
    })
  }

  const handleSeeking = () => {
    const player = playerRef.current
    if (!player) return
    const currentTime = Math.max(0, Number(player.currentTime ?? 0))
    const maxAllowed = allowedSeekSecond + 2
    if (currentTime <= maxAllowed) return
    player.currentTime = maxAllowed
    lastTickRef.current = maxAllowed
    const durationSeconds = Math.max(1, Math.round(Number(player.duration || course.videoMinutes * 60 || 1)))
    recordVideoPlayback(course.id, {
      positionSecond: maxAllowed,
      durationSeconds,
      watchedDeltaSeconds: 0,
      isPlaying: isPlayingRef.current,
      seekViolation: true,
    })
  }

  const handleEnded = () => {
    const player = playerRef.current
    const durationSeconds = Math.max(1, Math.round(Number(player?.duration || course.videoMinutes * 60 || 1)))
    const currentTime = Math.max(0, Number(player?.currentTime ?? durationSeconds))
    const previous = lastTickRef.current ?? 0
    isPlayingRef.current = false
    lastTickRef.current = currentTime
    recordVideoPlayback(course.id, {
      positionSecond: currentTime,
      durationSeconds,
      watchedDeltaSeconds: Math.max(0, currentTime - previous),
      isPlaying: false,
      completed: true,
    })
  }

  const handleRateChange = () => {
    const player = playerRef.current
    const rate = Number(player?.playbackRate ?? 1)
    if (!Number.isFinite(rate) || rate <= 1.05) return
    if (player) player.playbackRate = 1
    const currentTime = Math.max(0, Number(player?.currentTime ?? 0))
    const durationSeconds = Math.max(1, Math.round(Number(player?.duration || course.videoMinutes * 60 || 1)))
    recordVideoPlayback(course.id, {
      positionSecond: currentTime,
      durationSeconds,
      watchedDeltaSeconds: 0,
      isPlaying: isPlayingRef.current,
      seekViolation: true,
    })
  }

  const setCopyFeedbackWithReset = (nextState: 'copied' | 'error') => {
    setCopyFeedback(nextState)
    if (copyFeedbackTimerRef.current != null) {
      window.clearTimeout(copyFeedbackTimerRef.current)
    }
    copyFeedbackTimerRef.current = window.setTimeout(() => {
      setCopyFeedback('idle')
      copyFeedbackTimerRef.current = null
    }, 2200)
  }

  const handleCopyTranscript = async () => {
    const text = courseTranscriptPlainText.trim()
    if (!text) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text)
      } else {
        const area = document.createElement('textarea')
        area.value = text
        area.setAttribute('readonly', 'true')
        area.style.position = 'fixed'
        area.style.opacity = '0'
        document.body.append(area)
        area.select()
        document.execCommand('copy')
        area.remove()
      }
      setCopyFeedbackWithReset('copied')
    } catch {
      setCopyFeedbackWithReset('error')
    }
  }

  const handleDownloadTranscriptJson = () => {
    const payload = buildCourseTranscriptDownload(course)
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    const safeTitle =
      course.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || course.id
    anchor.href = url
    anchor.download = `${safeTitle}-transcript.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  return (
    <section className="player-page">
      <header className="player-header">
        <div className="stack-sm">
          <p className="section-eyebrow">Course player</p>
          <h1>{course.title}</h1>
          <p className="page-subtitle">
            Watch the full lesson with verified progress tracking. Pausing is fine; fast-forward beyond verified viewing
            is blocked for CPD evidence quality.
          </p>
        </div>
        <div className="player-progress">
          <p className="player-progress__value">{watchedPercent}%</p>
          <p className="player-progress__meta">
            {enrollment.watchedMinutes} of {course.videoMinutes} minutes verified
          </p>
        </div>
      </header>

      <div className="player-layout">
        <article className="video-shell">
          <div className="video-shell__head">
            <div>
              <p className="section-eyebrow">Now playing</p>
              <h2>{course.title}</h2>
            </div>
            <p className="meta-line">
              {course.videoMinutes} mins
              {course.muxPlaybackId
                ? ' · Video ready'
                : demoPlaybackId
                  ? ' · Demo video'
                  : ' · Video not attached yet'}
            </p>
          </div>
          <div className="video-frame mux-player-frame">
            {playbackId ? (
              <MuxPlayer
                ref={(value) => {
                  playerRef.current = value as MuxPlayerElement | null
                }}
                playbackId={playbackId}
                streamType="on-demand"
                accentColor="var(--accent, #0d9488)"
                envKey={muxEnvKey || undefined}
                metadataVideoTitle={course.title}
                onPlay={() => {
                  isPlayingRef.current = true
                  handlePlayPauseEvent(true)
                }}
                onPause={() => {
                  isPlayingRef.current = false
                  handlePlayPauseEvent(false)
                }}
                onSeeking={() => {
                  handleSeeking()
                }}
                onRateChange={() => {
                  handleRateChange()
                }}
                onEnded={() => {
                  handleEnded()
                }}
              />
            ) : (
              <div className="video-placeholder">
                <p>
                  <strong>Currently on:</strong> {course.title}
                </p>
                <p>
                  No video is attached to this course yet. Your team can add one under Admin → Courses.
                  {import.meta.env.DEV ? (
                    <>
                      {' '}
                      For local demos, set <code>muxPlaybackId</code> in <code>app/public/app-settings.json</code>.
                    </>
                  ) : null}
                </p>
              </div>
            )}
          </div>
          <div className="player-actions">
            {quizUnlocked ? (
              <Link className="action-link action-link--primary" to={`/courses/${course.id}/quiz`}>
                Go to quiz
              </Link>
            ) : (
              <span className="action-link action-link--primary" aria-disabled>
                Quiz unlocks at 100% watched
              </span>
            )}
            <Link className="action-link" to={`/courses/${course.id}`}>
              Course details
            </Link>
          </div>
          <section className="stack-sm course-transcript" aria-labelledby="course-transcript-heading">
            <div className="course-transcript__head">
              <p className="section-eyebrow" id="course-transcript-heading">
                Transcript
              </p>
            </div>
            {course.transcriptStatus === 'processing' ? (
              <p className="muted">Transcript is generating. Check back shortly.</p>
            ) : null}
            {course.transcriptStatus === 'error' ? (
              <p className="inline-error">
                Transcript unavailable: {course.transcriptErrorMessage ?? 'Generation failed.'}
              </p>
            ) : null}
            {activeTranscript ? (
              <div
                className={`course-transcript__panel ${
                  transcriptExpanded ? 'course-transcript__panel--expanded' : 'course-transcript__panel--collapsed'
                }`}
              >
                <ul className="course-transcript__list">
                  {visibleTranscriptCues.map((cue, index) => {
                    const timestamp = formatTranscriptTimestamp(cue.startSeconds)
                    return (
                      <li key={`${course.id}-cue-${index}`} className="course-transcript__cue">
                        <span className="course-transcript__timestamp">{timestamp || 'Approx'}</span>
                        <p>{cue.text}</p>
                      </li>
                    )
                  })}
                </ul>
              </div>
            ) : null}
            {activeTranscript && transcriptHasHiddenCues && !transcriptExpanded ? (
              <p className="meta-line">
                Showing {visibleTranscriptCues.length} of {transcriptCues.length} transcript blocks.
              </p>
            ) : null}
            {activeTranscript ? (
              <div className="course-transcript__actions">
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => setTranscriptExpanded((prev) => !prev)}
                >
                  {transcriptExpanded ? 'Show less' : 'Show more'}
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={() => void handleCopyTranscript()}
                  disabled={!canExportCourseTranscript}
                  aria-label="Copy full course transcript"
                >
                  Copy text
                </button>
                <button
                  type="button"
                  className="button button--secondary"
                  onClick={handleDownloadTranscriptJson}
                  disabled={!canExportCourseTranscript}
                >
                  Download JSON
                </button>
              </div>
            ) : null}
            {copyFeedback === 'copied' ? <p className="meta-line">Full course transcript copied.</p> : null}
            {copyFeedback === 'error' ? (
              <p className="inline-error">Could not copy the transcript. Please try again.</p>
            ) : null}
            {!activeTranscript &&
            course.transcriptStatus !== 'processing' &&
            course.transcriptStatus !== 'error' ? (
              <p className="muted">Transcript not available yet for this course.</p>
            ) : null}
          </section>
        </article>
      </div>
    </section>
  )
}
