import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import MuxPlayer from '@mux/mux-player-react'
import { Link, useParams } from 'react-router-dom'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { LIVE_ATTENDANCE_HEARTBEAT_INTERVAL_SECONDS } from '../../constants'
import { useAppStore } from '../../hooks/useAppStore'
import { learnerCanAccessCourseAudience } from '../../lib/courseAccess'
import { getAppSettings } from '../../lib/appSettings'
import { getLiveAttendanceRequiredWatchSeconds } from '../../lib/liveAttendance'
import type { LiveChatMessage } from '../../types'

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
    liveChatMessagesByOccurrence,
    liveChatStatusByOccurrence,
    liveChatErrorByOccurrence,
    sendLiveChatMessage,
    subscribeToLiveChat,
    unsubscribeFromLiveChat,
    retryLiveChatSubscription,
    reclassifyOwnLiveChatMessage,
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
  const [chatDraft, setChatDraft] = useState('')
  const [sendPending, setSendPending] = useState(false)
  const [reclassifyingMessageId, setReclassifyingMessageId] = useState<string | null>(null)
  const [chatComposerFeedback, setChatComposerFeedback] = useState<string | null>(null)
  const canAccess = currentUser && occurrence
    ? learnerCanAccessCourseAudience(currentUser.accessScope, occurrence.audience)
    : false

  const chatMessages = liveChatMessagesByOccurrence[occurrenceId] ?? []
  const chatStatus = liveChatStatusByOccurrence[occurrenceId] ?? 'idle'
  const chatError = liveChatErrorByOccurrence[occurrenceId]
  const timeFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat(undefined, {
        hour: '2-digit',
        minute: '2-digit',
      }),
    [],
  )
  const questionMessages = useMemo(
    () => chatMessages.filter((message) => !message.isDeleted && message.messageKind === 'question'),
    [chatMessages],
  )
  const generalMessages = useMemo(
    () => chatMessages.filter((message) => !message.isDeleted && message.messageKind === 'chat'),
    [chatMessages],
  )

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

  useEffect(() => {
    if (!currentUser || !occurrence || !canAccess) return
    subscribeToLiveChat(occurrence.id)
    return () => {
      unsubscribeFromLiveChat(occurrence.id)
    }
  }, [currentUser, occurrence, canAccess, subscribeToLiveChat, unsubscribeFromLiveChat])

  const submitChatMessage = useCallback(
    async (forceKind?: 'question' | 'chat') => {
      if (!occurrence || !currentUser || sendPending) return
      setChatComposerFeedback(null)
      setSendPending(true)
      try {
        const result = await sendLiveChatMessage(occurrence.id, chatDraft, forceKind)
        if (result.ok) {
          setChatDraft('')
          return
        }
        setChatComposerFeedback(result.message ?? 'Could not send your message.')
      } finally {
        setSendPending(false)
      }
    },
    [chatDraft, currentUser, occurrence, sendLiveChatMessage, sendPending],
  )

  const handleComposerKeyDown = useCallback(
    (event: KeyboardEvent<HTMLTextAreaElement>) => {
      if (event.key !== 'Enter' || event.shiftKey) return
      event.preventDefault()
      void submitChatMessage()
    },
    [submitChatMessage],
  )

  const handleReclassifyMessage = useCallback(
    async (message: LiveChatMessage) => {
      const nextKind = message.messageKind === 'question' ? 'chat' : 'question'
      setReclassifyingMessageId(message.id)
      const result = await reclassifyOwnLiveChatMessage(message.id, nextKind)
      if (!result.ok) {
        setChatComposerFeedback(result.message ?? 'Could not update message category.')
      }
      setReclassifyingMessageId(null)
    },
    [reclassifyOwnLiveChatMessage],
  )

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

        <section className="live-chat-panel" aria-labelledby="live-chat-heading">
          <header className="live-chat-panel__header">
            <div>
              <p className="section-eyebrow">Live chat</p>
              <h2 id="live-chat-heading">Questions and discussion</h2>
            </div>
            <p className="meta-line">
              Messages are auto-classified; you can move your own messages between Questions and Chat.
            </p>
          </header>

          {chatStatus === 'loading' ? (
            <p className="meta-line live-chat-status" role="status">
              Connecting chat...
            </p>
          ) : null}
          {chatError ? (
            <p className="meta-line live-chat-status live-chat-status--error" role="status">
              {chatError}
            </p>
          ) : null}
          {chatStatus === 'error' ? (
            <div className="button-row">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => retryLiveChatSubscription(occurrence.id)}
              >
                Retry chat connection
              </button>
            </div>
          ) : null}

          <div className="live-chat-lanes">
            <section className="live-chat-lane" aria-label="Questions" aria-live="polite">
              <div className="live-chat-lane__header">
                <h3>Questions</h3>
                <span>{questionMessages.length}</span>
              </div>
              <ul className="live-chat-message-list">
                {questionMessages.length === 0 ? (
                  <li className="live-chat-empty">No questions yet.</li>
                ) : (
                  questionMessages.map((message) => {
                    const isMine = message.userId === currentUser.id
                    const isUpdating = reclassifyingMessageId === message.id
                    return (
                      <li key={message.id} className="live-chat-message-card">
                        <div className="live-chat-message-card__meta">
                          <strong title={message.userNameSnapshot || 'Participant'}>{message.userNameSnapshot || 'Participant'}</strong>
                          <span>{timeFormatter.format(new Date(message.createdAt))}</span>
                        </div>
                        <p dir="auto">{message.body}</p>
                        <div className="live-chat-message-card__actions">
                          <span className="live-chat-badge">Question</span>
                          {isMine ? (
                            <button
                              type="button"
                              className="btn btn-ghost live-chat-message-card__button"
                              disabled={isUpdating}
                              onClick={() => void handleReclassifyMessage(message)}
                            >
                              {isUpdating ? 'Updating...' : 'Move to chat'}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            </section>

            <section className="live-chat-lane" aria-label="General chat" aria-live="polite">
              <div className="live-chat-lane__header">
                <h3>General chat</h3>
                <span>{generalMessages.length}</span>
              </div>
              <ul className="live-chat-message-list">
                {generalMessages.length === 0 ? (
                  <li className="live-chat-empty">No general chat yet.</li>
                ) : (
                  generalMessages.map((message) => {
                    const isMine = message.userId === currentUser.id
                    const isUpdating = reclassifyingMessageId === message.id
                    return (
                      <li key={message.id} className="live-chat-message-card">
                        <div className="live-chat-message-card__meta">
                          <strong title={message.userNameSnapshot || 'Participant'}>{message.userNameSnapshot || 'Participant'}</strong>
                          <span>{timeFormatter.format(new Date(message.createdAt))}</span>
                        </div>
                        <p dir="auto">{message.body}</p>
                        <div className="live-chat-message-card__actions">
                          <span className="live-chat-badge live-chat-badge--chat">Chat</span>
                          {isMine ? (
                            <button
                              type="button"
                              className="btn btn-ghost live-chat-message-card__button"
                              disabled={isUpdating}
                              onClick={() => void handleReclassifyMessage(message)}
                            >
                              {isUpdating ? 'Updating...' : 'Move to questions'}
                            </button>
                          ) : null}
                        </div>
                      </li>
                    )
                  })
                )}
              </ul>
            </section>
          </div>

          <label className="live-chat-composer" htmlFor="live-chat-input">
            <span>Add to the conversation</span>
            <textarea
              id="live-chat-input"
              rows={3}
              maxLength={500}
              placeholder="Type your message. Press Enter to send, Shift+Enter for a new line."
              value={chatDraft}
              dir="auto"
              onChange={(event) => {
                setChatDraft(event.target.value)
                if (chatComposerFeedback) setChatComposerFeedback(null)
              }}
              onKeyDown={handleComposerKeyDown}
            />
            {chatComposerFeedback ? (
              <p className="live-chat-composer__feedback" role="status" aria-live="polite">
                {chatComposerFeedback}
              </p>
            ) : null}
            <div className="live-chat-composer__footer">
              <span>{chatDraft.trim().length}/500</span>
              <div className="button-row">
                <button
                  type="button"
                  className="btn btn-secondary"
                  disabled={sendPending || !chatDraft.trim() || chatStatus === 'error'}
                  onClick={() => void submitChatMessage('question')}
                >
                  Ask as question
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={sendPending || !chatDraft.trim() || chatStatus === 'error'}
                  onClick={() => void submitChatMessage()}
                >
                  {sendPending ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </label>
        </section>
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
