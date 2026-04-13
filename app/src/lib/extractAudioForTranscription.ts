import type { FFmpeg } from '@ffmpeg/ffmpeg'

/** Keep in sync with `package.json` dependency `@ffmpeg/core`. */
const FFMPEG_CORE_VERSION = '0.12.10'
/**
 * Load core from a CDN so the ~31 MiB `.wasm` is not emitted into `dist/`.
 * Cloudflare Pages rejects static assets larger than 25 MiB.
 */
const FFMPEG_CORE_BASE = `https://cdn.jsdelivr.net/npm/@ffmpeg/core@${FFMPEG_CORE_VERSION}/dist/esm`

export type ExtractAudioProgress = { ratio: number }

/** True when we should demux to audio before sending to the transcription API. */
export function isVideoLikeForTranscription(file: File): boolean {
  if (file.type.startsWith('video/')) {
    return true
  }
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return ['mp4', 'mpeg', 'mpg', 'webm', 'mov', 'mkv', 'avi', 'wmv', 'ogv', 'm4v'].includes(ext)
}

let ffmpegInstance: FFmpeg | null = null
let loadPromise: Promise<FFmpeg> | null = null

async function getFFmpeg(): Promise<FFmpeg> {
  if (ffmpegInstance?.loaded) {
    return ffmpegInstance
  }
  if (loadPromise) {
    return loadPromise
  }

  loadPromise = (async () => {
    const { FFmpeg } = await import('@ffmpeg/ffmpeg')
    const ffmpeg = new FFmpeg()
    await ffmpeg.load({
      coreURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.js`,
      wasmURL: `${FFMPEG_CORE_BASE}/ffmpeg-core.wasm`,
    })
    ffmpegInstance = ffmpeg
    return ffmpeg
  })()

  return loadPromise
}

/**
 * Demux + encode to compact mono MP3 (or AAC fallback) for speech transcription.
 * Loads ffmpeg.wasm on first use (large one-time download).
 */
export async function extractAudioFromVideoForTranscription(
  file: File,
  options?: { onProgress?: (p: ExtractAudioProgress) => void },
): Promise<File> {
  const { fetchFile } = await import('@ffmpeg/util')
  const ffmpeg = await getFFmpeg()
  const inputName = 'input-media'
  const outputMp3 = 'out-transcribe.mp3'
  const outputM4a = 'out-transcribe.m4a'

  const onProg = (event: { progress: number }) => {
    const ratio = Number.isFinite(event.progress) ? Math.min(1, Math.max(0, event.progress)) : 0
    options?.onProgress?.({ ratio })
  }
  ffmpeg.on('progress', onProg)

  try {
    await ffmpeg.writeFile(inputName, await fetchFile(file))

    const baseArgs = ['-i', inputName, '-vn', '-map', '0:a:0', '-ac', '1', '-ar', '16000'] as const

    let outName = outputMp3
    let mime = 'audio/mpeg'
    let outBase = 'transcription-audio.mp3'

    const mp3Code = await ffmpeg.exec([...baseArgs, '-c:a', 'libmp3lame', '-b:a', '32k', outputMp3])
    if (mp3Code !== 0) {
      const aacCode = await ffmpeg.exec([...baseArgs, '-c:a', 'aac', '-b:a', '32k', outputM4a])
      if (aacCode !== 0) {
        throw new Error(
          'Could not extract speech audio from this video. The file may be unsupported, damaged, or have no audio track.',
        )
      }
      outName = outputM4a
      mime = 'audio/mp4'
      outBase = 'transcription-audio.m4a'
    }

    const data = await ffmpeg.readFile(outName)
    await ffmpeg.deleteFile(inputName).catch(() => {})
    await ffmpeg.deleteFile(outputMp3).catch(() => {})
    await ffmpeg.deleteFile(outputM4a).catch(() => {})

    if (typeof data === 'string') {
      throw new Error('Audio extraction returned an unexpected result.')
    }
    if (data.byteLength === 0) {
      throw new Error('Audio extraction produced an empty file.')
    }

    const bytes = Uint8Array.from(data)
    const blob = new Blob([bytes], { type: mime })
    return new File([blob], outBase, { type: mime })
  } finally {
    ffmpeg.off('progress', onProg)
    options?.onProgress?.({ ratio: 1 })
  }
}
