import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { ClipboardEvent, FormEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { submitFeedback } from '../../lib/feedback'

type SubmitStatus = 'idle' | 'saving' | 'success' | 'error'

const IMAGE_ACCEPT = 'image/png,image/jpeg,image/jpg,image/webp,image/gif'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const ALLOWED_IMAGE_MIME = new Set(['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif'])

function inferImageTypeFromMagic(bytes: Uint8Array): string | null {
  if (bytes.length < 12) {
    return null
  }
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return 'image/png'
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }
  if (
    bytes[0] === 0x47 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x38 &&
    (bytes[4] === 0x37 || bytes[4] === 0x39) &&
    bytes[5] === 0x61
  ) {
    return 'image/gif'
  }
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'image/webp'
  }
  return null
}

function extForMime(mime: string): string {
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    return 'jpg'
  }
  if (mime === 'image/png') {
    return 'png'
  }
  if (mime === 'image/webp') {
    return 'webp'
  }
  if (mime === 'image/gif') {
    return 'gif'
  }
  return 'png'
}

/** Normalize to a File with correct MIME (sniffs magic when type is missing — common on Windows paste). */
async function prepareImageFile(file: File): Promise<File | null> {
  let mime = (file.type === 'image/jpg' ? 'image/jpeg' : file.type).toLowerCase()
  if (!mime || mime === 'application/octet-stream') {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())
    const inferred = inferImageTypeFromMagic(head)
    if (!inferred) {
      return null
    }
    mime = inferred
  } else if (mime === 'image/jpg') {
    mime = 'image/jpeg'
  }

  if (!ALLOWED_IMAGE_MIME.has(mime)) {
    return null
  }

  const name = `screenshot-${Date.now()}.${extForMime(mime)}`
  return new File([file], name, { type: mime })
}

function pickImageFileFromDataTransfer(data: DataTransfer | null): File | null {
  if (!data) {
    return null
  }

  const { items, files } = data

  if (items?.length) {
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind !== 'file') {
        continue
      }
      const f = item.getAsFile()
      if (!f) {
        continue
      }
      const t = (item.type || f.type || '').toLowerCase()
      if (t.startsWith('image/')) {
        return f
      }
      if (!t || t === 'application/octet-stream') {
        return f
      }
    }
  }

  if (files?.length) {
    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      if (file.type.startsWith('image/')) {
        return file
      }
      if (!file.type || file.type === 'application/octet-stream') {
        return file
      }
    }
  }

  return null
}

export function GlobalFeedbackBar() {
  const location = useLocation()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState('')
  const [attachment, setAttachment] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [status, setStatus] = useState<SubmitStatus>('idle')
  const [statusCopy, setStatusCopy] = useState('')

  useLayoutEffect(() => {
    if (!attachment) {
      setPreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(attachment)
    setPreviewUrl(url)
    return () => {
      URL.revokeObjectURL(url)
    }
  }, [attachment])

  function clearAttachment() {
    setAttachment(null)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

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
      clearAttachment()
    } catch {
      setStatus('error')
      setStatusCopy('Network error while submitting ticket.')
    }
  }

  const applyPastedOrDroppedImage = useCallback(
    async (raw: File) => {
      if (raw.size > MAX_IMAGE_BYTES) {
        setStatus('error')
        setStatusCopy('Image is too large (max 5MB).')
        return
      }
      const prepared = await prepareImageFile(raw)
      if (!prepared) {
        setStatus('error')
        setStatusCopy('Could not read image. Try PNG or JPEG, or use the attach button.')
        return
      }
      if (prepared.size > MAX_IMAGE_BYTES) {
        setStatus('error')
        setStatusCopy('Image is too large (max 5MB).')
        return
      }
      setAttachment(prepared)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
      setStatus('idle')
      setStatusCopy('')
    },
    [],
  )

  function onPasteCapture(event: ClipboardEvent<Element>) {
    const raw = pickImageFileFromDataTransfer(event.clipboardData)
    if (!raw) {
      return
    }
    event.preventDefault()
    event.stopPropagation()
    void applyPastedOrDroppedImage(raw)
  }

  return (
    <div className="feedback-bar-shell" role="complementary" aria-label="Bug feedback submission">
      <form className="feedback-bar" onSubmit={onSubmit} onPasteCapture={onPasteCapture}>
        <div className="feedback-bar-body">
          {attachment ? (
            <div className="feedback-attachment-preview">
              <div className="feedback-attachment-chip">
                {previewUrl ? (
                  <img src={previewUrl} alt="" className="feedback-attachment-thumb" />
                ) : (
                  <div className="feedback-attachment-skeleton" aria-hidden="true" />
                )}
                <button
                  type="button"
                  className="feedback-attachment-remove"
                  aria-label="Remove attached image"
                  onClick={() => {
                    clearAttachment()
                    if (status !== 'idle') {
                      setStatus('idle')
                      setStatusCopy('')
                    }
                  }}
                >
                  ×
                </button>
              </div>
              <span className="feedback-attachment-label">Image attached</span>
            </div>
          ) : null}
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
              placeholder="Describe what happened, or paste a screenshot (Ctrl+V)…"
              autoComplete="off"
              maxLength={500}
              aria-label="Bug report"
            />
          </div>
        </div>
        <div className="feedback-bar-trailing">
          <input
            ref={fileInputRef}
            type="file"
            className="feedback-file-input"
            accept={IMAGE_ACCEPT}
            tabIndex={-1}
            aria-hidden="true"
            onChange={(event) => {
              const raw = event.target.files?.[0] ?? null
              if (!raw) {
                setAttachment(null)
                return
              }
              void (async () => {
                await applyPastedOrDroppedImage(raw)
              })()
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
        </div>
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
