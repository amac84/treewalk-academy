import { useEffect, useState } from 'react'

function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n < 0) {
    return '—'
  }
  const units = ['B', 'KB', 'MB', 'GB'] as const
  let v = n
  let u = 0
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024
    u += 1
  }
  return u === 0 ? `${Math.round(v)} ${units[u]}` : `${v.toFixed(u >= 2 ? 2 : 1)} ${units[u]}`
}

function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) {
    return '—'
  }
  const s = Math.floor(ms / 1000)
  const m = Math.floor(s / 60)
  const sec = s % 60
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`
}

type Props = {
  loaded: number
  total: number
  startedAt: number
}

/**
 * Live byte upload progress (direct video upload). Re-renders on a short interval so elapsed/ETA update smoothly.
 */
export function VideoUploadProgressBar({ loaded, total, startedAt }: Props) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(id)
  }, [])

  const elapsed = now - startedAt
  const knownTotal = total > 0
  const pct = knownTotal ? Math.min(100, (loaded / total) * 100) : 0
  const rate = loaded > 0 && elapsed > 300 ? loaded / elapsed : 0
  const remainingMs =
    rate > 0 && knownTotal && loaded < total ? ((total - loaded) / rate) * 1000 : null

  const showEta = remainingMs != null && remainingMs > 750 && loaded > 0 && loaded < total

  return (
    <div className="video-upload-progress stack-sm" role="group" aria-label="Video upload progress">
      <div
        className="video-upload-progress__bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={knownTotal ? Math.round(pct) : undefined}
        aria-valuetext={
          knownTotal
            ? `${formatBytes(loaded)} of ${formatBytes(total)} uploaded`
            : 'Upload in progress'
        }
      >
        <div
          className={
            knownTotal
              ? 'video-upload-progress__bar-fill'
              : 'video-upload-progress__bar-fill video-upload-progress__bar-fill--indeterminate'
          }
          style={knownTotal ? { width: `${pct}%` } : undefined}
        />
      </div>
      <div className="video-upload-progress__meta">
        {knownTotal ? (
          <>
            <span>
              {formatBytes(loaded)} / {formatBytes(total)}
            </span>
            <span className="video-upload-progress__pct">{pct.toFixed(1)}%</span>
          </>
        ) : (
          <span>{formatBytes(loaded)} sent</span>
        )}
        <span className="muted">Elapsed {formatDuration(elapsed)}</span>
        {showEta ? <span className="muted">~{formatDuration(remainingMs)} left</span> : null}
      </div>
    </div>
  )
}
