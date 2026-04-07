import { useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { submitFeedback } from '../../lib/feedback'

type SubmitStatus = 'idle' | 'saving' | 'success' | 'error'

export function GlobalFeedbackBar() {
  const location = useLocation()
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [statusCopy, setStatusCopy] = useState('Submit bug feedback to Linear.')

  const isDisabled = status === 'saving' || message.trim().length === 0

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = message.trim()
    if (!trimmed) {
      return
    }

    setStatus('saving')
    setStatusCopy('Sending to Linear...')

    try {
      const result = await submitFeedback({
        message: trimmed,
        route: location.pathname,
      })

      if (!result.success) {
        setStatus('error')
        setStatusCopy(result.error ?? 'Could not submit the ticket. Please try again.')
        return
      }

      setStatus('success')
      setStatusCopy(result.ticketId ? `Ticket ${result.ticketId} created.` : 'Ticket created in Linear.')
      setMessage('')
    } catch {
      setStatus('error')
      setStatusCopy('Network error while submitting ticket.')
    }
  }

  return (
    <div className="feedback-bar-shell" role="complementary" aria-label="Bug feedback submission">
      <form className="feedback-bar" onSubmit={onSubmit}>
        <label className="feedback-bar-input-wrap" htmlFor="feedback-message">
          <span className="feedback-bar-prompt">Report a bug</span>
          <input
            id="feedback-message"
            name="message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              if (status !== 'idle') {
                setStatus('idle')
                setStatusCopy('Submit bug feedback to Linear.')
              }
            }}
            placeholder="Describe what happened and where..."
            autoComplete="off"
            maxLength={500}
          />
        </label>
        <button className="feedback-submit" type="submit" disabled={isDisabled} aria-label="Submit bug ticket">
          <IdeaSubmitIcon />
        </button>
      </form>
      <p className={`feedback-bar-status feedback-bar-status--${status}`} aria-live="polite">
        {statusCopy}
      </p>
    </div>
  )
}

function IdeaSubmitIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        d="M12 2a7 7 0 0 0-4.8 12.1c.7.7 1.3 1.8 1.6 2.9h6.4c.3-1.1.9-2.2 1.6-2.9A7 7 0 0 0 12 2Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 18h5M10 21h4M12 14V8m0 0-2 2m2-2 2 2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
