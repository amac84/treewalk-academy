import { useId, useState } from 'react'
import { useAppStore } from '../../hooks/useAppStore'
import {
  createMuxDirectUpload,
  putVideoToMuxUpload,
  waitForMuxPlaybackId,
} from '../../lib/muxEdge'
import type { CourseSegment } from '../../types'

type Props = {
  courseId: string
  segment: CourseSegment
}

export function SegmentMuxUpload({ courseId, segment }: Props) {
  const { updateCourseSegmentMux } = useAppStore()
  const inputId = useId()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onFile(file: File | null) {
    if (!file) return
    setError(null)
    setSuccess(null)
    setBusy(true)
    updateCourseSegmentMux(courseId, segment.id, {
      muxStatus: 'uploading',
      muxErrorMessage: undefined,
    })
    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '*'
      const { uploadId, uploadUrl } = await createMuxDirectUpload(origin)
      updateCourseSegmentMux(courseId, segment.id, { muxUploadId: uploadId, muxStatus: 'uploading' })
      await putVideoToMuxUpload(uploadUrl, file)
      updateCourseSegmentMux(courseId, segment.id, { muxStatus: 'processing' })
      const { assetId, playbackId } = await waitForMuxPlaybackId(uploadId)
      updateCourseSegmentMux(courseId, segment.id, {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
        muxStatus: 'ready',
        muxErrorMessage: undefined,
      })
      setSuccess('Video is ready — learners can play this segment.')
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Upload failed.'
      updateCourseSegmentMux(courseId, segment.id, { muxStatus: 'error', muxErrorMessage: msg })
      setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="segment-mux-upload stack-sm">
      <div>
        <strong>{segment.title}</strong>
        {segment.muxPlaybackId ? (
          <span className="muted"> · Mux playback ready</span>
        ) : (
          <span className="muted"> · No playback ID yet</span>
        )}
      </div>
      <div className="mux-upload-row">
        <input
          id={inputId}
          type="file"
          accept="video/*"
          disabled={busy}
          aria-busy={busy}
          onChange={(ev) => {
            const next = ev.target.files?.[0] ?? null
            void onFile(next)
            ev.target.value = ''
          }}
        />
        {busy ? <span className="muted"> Working…</span> : null}
      </div>
      {segment.muxStatus && segment.muxStatus !== 'idle' ? (
        <p className="meta-line">Mux: {segment.muxStatus}</p>
      ) : null}
      {segment.muxErrorMessage ? <p className="inline-error">{segment.muxErrorMessage}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {success ? <p className="meta-line">{success}</p> : null}
    </div>
  )
}
