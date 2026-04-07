import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { submitFeedback } from '../../lib/feedback'

type SubmitStatus = 'idle' | 'saving' | 'success' | 'error'

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif'

export function GlobalFeedbackBar() {
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [statusCopy, setStatusCopy] = useState('')

  const canSubmit = message.trim().length > 0 || Boolean(attachment)
  const isDisabled = status === 'saving' || !canSubmit

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) {
      return
    }

    setStatus('saving')
    setStatusCopy('Sending to Linear...')

    try {
      const result = await submitFeedback({
        message: message.trim(),
        route: location.pathname,
        image: attachment,
      })

      if (!result.success) {
        setStatus('error')
        setStatusCopy(result.error ?? 'Could not submit the ticket. Please try again.')
        return
      }

      setStatus('success')
      setStatusCopy(result.ticketId ? `Ticket ${result.ticketId} created.` : 'Ticket created in Linear.')
      setMessage('')
      setAttachment(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    } catch {
      setStatus('error')
      setStatusCopy('Network error while submitting ticket.')
    }
  }

  return (
    <div className="feedback-bar-shell" role="complementary" aria-label="Bug feedback submission">
      <form className="feedback-bar" onSubmit={onSubmit}>
        <div className="feedback-bar-input-wrap">
          <input
            id="feedback-message"
            name="message"
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              if (status !== 'idle') {
                setStatus('idle')
                setStatusCopy('')
              }
            }}
            placeholder="Describe what happened and where..."
            autoComplete="off"
            maxLength={500}
            aria-label="Bug report"
          />
        </div>
        <input
          ref={fileInputRef}
          type="file"
          className="feedback-file-input"
          accept={IMAGE_ACCEPT}
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            setAttachment(file)
            if (status !== 'idle') {
              setStatus('idle')
              setStatusCopy('')
            }
          }}
        />
        <button
          type="button"
          className={`feedback-attach${attachment ? ' feedback-attach--active' : ''}`}
          aria-label={attachment ? 'Change screenshot' : 'Attach screenshot'}
          onClick={() => fileInputRef.current?.click()}
        >
          <ImageAttachIcon />
        </button>
        <button className="feedback-submit" type="submit" disabled={isDisabled} aria-label="Submit bug ticket">
          <IdeaSubmitIcon />
        </button>
      </form>
      {status !== 'idle' ? (
        <p className={`feedback-bar-status feedback-bar-status--${status}`} aria-live="polite">
          {statusCopy}
        </p>
      ) : null}
    </div>
  )
}

function ImageAttachIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect
        x="3"
        y="5"
        width="18"
        height="14"
        rx="2.5"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M3 16l4.5-4.5a1.2 1.2 0 0 1 1.7 0L14 16"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 13l2.2-2.2a1.2 1.2 0 0 1 1.7 0L21 14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8.5" cy="9" r="1.35" fill="currentColor" />
    </svg>
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
