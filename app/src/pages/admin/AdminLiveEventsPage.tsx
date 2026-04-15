import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAppStore } from '../../hooks/useAppStore'
import type { CourseAudience } from '../../types'

function toDateTimeLocalValue(input: Date): string {
  const pad = (value: number) => value.toString().padStart(2, '0')
  const year = input.getFullYear()
  const month = pad(input.getMonth() + 1)
  const day = pad(input.getDate())
  const hours = pad(input.getHours())
  const minutes = pad(input.getMinutes())
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

export function AdminLiveEventsPage() {
  const {
    users,
    currentUser,
    liveOccurrences,
    liveRehearsal,
    createLiveOccurrence,
    syncLiveOccurrenceStatus,
    provisionLiveRehearsalStream,
  } = useAppStore()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [startAt, setStartAt] = useState(() => {
    const nextHour = new Date()
    nextHour.setMinutes(0, 0, 0)
    nextHour.setHours(nextHour.getHours() + 1)
    return toDateTimeLocalValue(nextHour)
  })
  const [expectedMinutes, setExpectedMinutes] = useState('60')
  const [audience, setAudience] = useState<CourseAudience>('everyone')
  const [presenterUserId, setPresenterUserId] = useState(() => currentUser?.id ?? '')
  const [message, setMessage] = useState<string | null>(null)
  const [rehearsalLoading, setRehearsalLoading] = useState(false)
  const [busyOccurrenceId, setBusyOccurrenceId] = useState<string | null>(null)

  const presenterOptions = useMemo(
    () => users.filter((user) => user.role === 'instructor' || user.role === 'content_admin' || user.role === 'super_admin'),
    [users],
  )
  const orderedOccurrences = useMemo(
    () => [...liveOccurrences].sort((a, b) => a.startAt.localeCompare(b.startAt)),
    [liveOccurrences],
  )

  async function handleCreateOccurrence() {
    setMessage(null)
    const parsedMinutes = Math.max(30, Math.round(Number(expectedMinutes) || 60))
    const result = await createLiveOccurrence({
      title,
      description,
      startAt: new Date(startAt).toISOString(),
      expectedMinutes: parsedMinutes,
      audience,
      presenterUserIds: presenterUserId ? [presenterUserId] : [],
    })
    if (!result.ok) {
      setMessage(result.message)
      return
    }
    setTitle('')
    setDescription('')
    setExpectedMinutes('60')
    setMessage(`Live occurrence created: ${result.occurrence.title}`)
  }

  async function handleProvisionRehearsal() {
    setMessage(null)
    setRehearsalLoading(true)
    const result = await provisionLiveRehearsalStream()
    setRehearsalLoading(false)
    setMessage(result.ok ? 'Rehearsal stream is ready for presenters.' : result.message ?? 'Could not provision rehearsal stream.')
  }

  async function handleSyncOccurrence(occurrenceId: string) {
    setMessage(null)
    setBusyOccurrenceId(occurrenceId)
    const result = await syncLiveOccurrenceStatus(occurrenceId)
    setBusyOccurrenceId(null)
    setMessage(result.ok ? 'Live status refreshed.' : result.message ?? 'Could not refresh status.')
  }

  return (
    <section className="page page--admin">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Live events</p>
        <h1>Live events operations</h1>
        <p className="page-subtitle">
          Schedule per-occurrence streams, keep rehearsal persistent for self-serve presenter checks, and monitor automatic replay-to-draft conversion.
        </p>
        <p className="muted" style={{ marginTop: '0.75rem' }}>
          <Link className="btn btn-secondary" to="/admin/live-events/presenter-guide">
            Presenter setup: OBS and Mux
          </Link>
        </p>
      </header>

      {message ? <p className="muted">{message}</p> : null}

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Presenter prep</p>
          <h2>Persistent rehearsal stream</h2>
        </div>
        <p className="muted">
          Give every presenter the same rehearsal destination. They can validate camera, microphone, and scene composition before any learner-facing event.
        </p>
        <dl className="admin-definition-list">
          <div>
            <dt>Live stream ID</dt>
            <dd><code>{liveRehearsal?.muxLiveStreamId || 'not provisioned'}</code></dd>
          </div>
          <div>
            <dt>Playback ID</dt>
            <dd><code>{liveRehearsal?.muxPlaybackId || 'not provisioned'}</code></dd>
          </div>
          <div>
            <dt>Stream key</dt>
            <dd><code>{liveRehearsal?.muxStreamKey || 'provision to generate'}</code></dd>
          </div>
        </dl>
        <div className="button-row">
          <button type="button" className="btn btn-primary" disabled={rehearsalLoading} onClick={handleProvisionRehearsal}>
            {rehearsalLoading ? 'Provisioning…' : 'Provision rehearsal stream'}
          </button>
        </div>
      </article>

      <article className="admin-snapshot">
        <div className="admin-snapshot__lead">
          <p className="section-eyebrow">Schedule</p>
          <h2>Create live occurrence</h2>
        </div>
        <div className="admin-form-grid">
          <label>
            Title
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Q3 Tax Strategy Live Session" />
          </label>
          <label>
            Description
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
          </label>
          <label>
            Start
            <input type="datetime-local" value={startAt} onChange={(event) => setStartAt(event.target.value)} />
          </label>
          <label>
            Expected minutes
            <input type="number" min={30} step={5} value={expectedMinutes} onChange={(event) => setExpectedMinutes(event.target.value)} />
          </label>
          <label>
            Audience
            <select value={audience} onChange={(event) => setAudience(event.target.value === 'internal' ? 'internal' : 'everyone')}>
              <option value="everyone">Everyone</option>
              <option value="internal">Internal only</option>
            </select>
          </label>
          <label>
            Presenter
            <select value={presenterUserId} onChange={(event) => setPresenterUserId(event.target.value)}>
              <option value="">Current admin</option>
              {presenterOptions.map((presenter) => (
                <option key={presenter.id} value={presenter.id}>
                  {presenter.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={handleCreateOccurrence}>
            Create live occurrence
          </button>
        </div>
      </article>

      <section className="webinar-list">
        {orderedOccurrences.map((occurrence) => (
          <article key={occurrence.id} className="webinar-item">
            <header className="webinar-item__head">
              <div className="stack-sm">
                <h3>{occurrence.title}</h3>
                <p className="muted">{occurrence.description || 'No description yet.'}</p>
              </div>
              <span className="chip">{occurrence.status}</span>
            </header>
            <div className="stack-sm">
              <p>
                <strong>Starts:</strong> {new Date(occurrence.startAt).toLocaleString()}
              </p>
              <p>
                <strong>Mux live stream:</strong> <code>{occurrence.muxLiveStreamId || 'pending'}</code>
              </p>
              <p>
                <strong>Playback ID:</strong> <code>{occurrence.muxPlaybackId || 'pending'}</code>
              </p>
              <p>
                <strong>Stream key:</strong> <code>{occurrence.muxStreamKey || 'not available yet'}</code>
              </p>
              <p>
                <strong>Conversion:</strong> {occurrence.conversionStatus.replace('_', ' ')}
              </p>
              {occurrence.muxErrorMessage ? (
                <p className="meta-line">Last mux error: {occurrence.muxErrorMessage}</p>
              ) : null}
            </div>
            <div className="button-row">
              <Link className="btn btn-secondary" to={`/webinars/${occurrence.id}/live`}>
                Open learner live room
              </Link>
              <button
                type="button"
                className="btn btn-ghost"
                disabled={busyOccurrenceId === occurrence.id}
                onClick={() => handleSyncOccurrence(occurrence.id)}
              >
                Refresh status
              </button>
              {occurrence.resultingCourseId ? (
                <Link className="btn btn-primary" to={`/courses/${occurrence.resultingCourseId}`}>
                  Open draft course
                </Link>
              ) : null}
            </div>
          </article>
        ))}
      </section>
    </section>
  )
}
