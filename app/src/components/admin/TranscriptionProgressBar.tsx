import type { TranscriptionPhase } from '../../lib/muxEdge'

type Props = {
  phase: TranscriptionPhase
  extractRatio?: number | null
}

const clampPercent = (ratio: number) => Math.max(0, Math.min(100, Math.round(ratio * 100)))

export function TranscriptionProgressBar({ phase, extractRatio }: Props) {
  const isExtracting = phase === 'extracting_audio'
  const determinate = isExtracting && typeof extractRatio === 'number'
  const pct = determinate ? clampPercent(extractRatio) : 0

  return (
    <div className="video-upload-progress stack-sm" role="group" aria-label="Transcription progress">
      <div
        className="video-upload-progress__bar-track"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={determinate ? pct : undefined}
        aria-valuetext={
          determinate
            ? `Audio extraction ${pct}% complete`
            : isExtracting
              ? 'Audio extraction in progress'
              : 'Transcribing audio'
        }
      >
        <div
          className={
            determinate
              ? 'video-upload-progress__bar-fill'
              : 'video-upload-progress__bar-fill video-upload-progress__bar-fill--indeterminate'
          }
          style={determinate ? { width: `${pct}%` } : undefined}
        />
      </div>

      <div className="video-upload-progress__meta">
        {isExtracting ? (
          <>
            <span>Extracting speech audio...</span>
            {determinate ? <span className="video-upload-progress__pct">{pct}%</span> : null}
          </>
        ) : (
          <span>Transcribing audio. This may take a minute.</span>
        )}
        {isExtracting ? (
          <span className="muted">
            Runs in your browser (first use downloads a helper — one-time, may take a moment).
          </span>
        ) : null}
      </div>
    </div>
  )
}
