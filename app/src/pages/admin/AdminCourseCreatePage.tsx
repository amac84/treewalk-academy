import { type FormEvent, useRef, useState } from 'react'
import { JourneyTaskFooter } from '../../components/common/JourneyTaskFooter'
import { TranscriptionProgressBar } from '../../components/admin/TranscriptionProgressBar'
import { VideoUploadProgressBar } from '../../components/admin/VideoUploadProgressBar'
import {
  createMuxDirectUpload,
  draftCourseMetadataFromTranscript,
  draftQuizBankFromTranscript,
  type DraftedQuizQuestion,
  isMuxFunctionConfigured,
  muxDurationSecondsToMinutes,
  type TranscriptionPhase,
  putVideoToMuxUpload,
  transcribeVideoFile,
  waitForMuxPlaybackId,
} from '../../lib/muxEdge'
import { buildQuizPolicy } from '../../lib/quizPolicy'
import type { QuizQuestion } from '../../types'
import { COURSE_TOPICS, useCourseWorkflowScope } from './courseWorkflow'

type UploadOutcome =
  | {
      kind: 'success'
      courseId: string
      courseTitle: string
      transcriptOk: boolean
      metadataDrafted?: boolean
      quizDrafted?: boolean
      metadataError?: string
      quizError?: string
      transcriptError?: string
    }
  | {
      kind: 'failed'
      message: string
    }

export function AdminCourseCreatePage() {
  const { store, canCreateCourse } = useCourseWorkflowScope()
  const storeRef = useRef(store)
  storeRef.current = store
  const [error, setError] = useState<string | null>(null)
  const [starterVideoFile, setStarterVideoFile] = useState<File | null>(null)
  const [starterUploadBusy, setStarterUploadBusy] = useState(false)
  const [starterUploadStatus, setStarterUploadStatus] = useState<string | null>(null)
  const [uploadOutcome, setUploadOutcome] = useState<UploadOutcome | null>(null)
  const [transcriptionProgress, setTranscriptionProgress] = useState<{
    phase: TranscriptionPhase
    extractRatio: number | null
  } | null>(null)
  const [byteUploadProgress, setByteUploadProgress] = useState<{
    loaded: number
    total: number
    startedAt: number
  } | null>(null)

  const inferCourseTitleFromFile = (file: File): string => {
    const dot = file.name.lastIndexOf('.')
    const raw = dot > 0 ? file.name.slice(0, dot) : file.name
    return raw.replace(/[_-]+/g, ' ').trim()
  }

  const pickAllowedTopic = (candidate: string): (typeof COURSE_TOPICS)[number] => {
    const match = COURSE_TOPICS.find((topic) => topic.toLowerCase() === candidate.trim().toLowerCase())
    return match ?? 'Technology'
  }

  const normalizeDraftQuiz = (
    courseId: string,
    questions: DraftedQuizQuestion[],
  ): QuizQuestion[] =>
    questions.map((question, questionIndex) => {
      const correctIndex = ['a', 'b', 'c', 'd'].indexOf(question.correctOption)
      return {
        id: `${courseId}-q-${questionIndex + 1}`,
        prompt: question.prompt,
        explanation: question.explanation,
        difficulty: question.difficulty,
        options: question.options.map((label, optionIndex) => ({
          id: `${courseId}-q-${questionIndex + 1}-o-${optionIndex + 1}`,
          label,
          isCorrect: optionIndex === correctIndex,
        })),
      }
    })

  const handleUploadToStartCourse = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!canCreateCourse) {
      setError('You do not have permission to create courses.')
      return
    }
    if (!isMuxFunctionConfigured()) {
      setError(
        import.meta.env.DEV
          ? 'Video upload is not configured. Set VITE_SUPABASE_URL (mux defaults to …/functions/v1/mux) or VITE_MUX_FUNCTION_URL in app/.env, then restart the dev server.'
          : 'Video upload is not set up on this site. Ask your administrator to finish configuration.',
      )
      return
    }
    if (!starterVideoFile) {
      setError('Choose a video file first.')
      return
    }

    const title = inferCourseTitleFromFile(starterVideoFile) || 'New Course'
    const create = store.createCourse({
      title,
      summary: '',
      description: '',
      category: '',
      topic: 'Technology',
      level: 'beginner',
      instructorId: store.currentUserId,
      videoMinutes: 15,
    })
    if (!create.ok) {
      setError(create.message)
      return
    }

    setError(null)
    setUploadOutcome(null)
    setTranscriptionProgress(null)
    setStarterUploadBusy(true)
    setStarterUploadStatus('Preparing upload…')
    store.clearVideoProcessingProgress(create.course.id)
    store.updateCourseVideo(create.course.id, {
      muxStatus: 'uploading',
      muxErrorMessage: undefined,
      transcriptErrorMessage: undefined,
    })

    try {
      const origin = typeof window !== 'undefined' ? window.location.origin : '*'
      const { uploadId, uploadUrl } = await createMuxDirectUpload(origin)
      store.updateCourseVideo(create.course.id, {
        muxUploadId: uploadId,
        muxStatus: 'uploading',
      })
      const uploadStartedAt = Date.now()
      setByteUploadProgress({ loaded: 0, total: starterVideoFile.size, startedAt: uploadStartedAt })
      store.setVideoUploadProgress(create.course.id, {
        loaded: 0,
        total: starterVideoFile.size,
        startedAt: uploadStartedAt,
      })
      setStarterUploadStatus('Uploading video...')
      await putVideoToMuxUpload(uploadUrl, starterVideoFile, {
        onProgress: ({ loaded, total }) => {
          setByteUploadProgress({ loaded, total, startedAt: uploadStartedAt })
          store.setVideoUploadProgress(create.course.id, {
            loaded,
            total,
            startedAt: uploadStartedAt,
          })
        },
      })
      setByteUploadProgress(null)
      store.setVideoUploadProgress(create.course.id, null)
      store.updateCourseVideo(create.course.id, { muxStatus: 'processing' })
      setStarterUploadStatus('Processing video...')
      const { assetId, playbackId, durationSeconds } = await waitForMuxPlaybackId(uploadId)
      store.updateCourseVideo(create.course.id, {
        muxAssetId: assetId,
        muxPlaybackId: playbackId,
        muxStatus: 'ready',
        muxErrorMessage: undefined,
        ...(durationSeconds != null ? { videoMinutes: muxDurationSecondsToMinutes(durationSeconds) } : {}),
      })
      store.updateCourseVideo(create.course.id, {
        transcript: undefined,
        transcriptText: undefined,
        transcriptStatus: 'processing',
        transcriptErrorMessage: undefined,
      })
      setTranscriptionProgress({ phase: 'extracting_audio', extractRatio: 0 })
      store.setVideoTranscriptionProgress(create.course.id, {
        phase: 'extracting_audio',
        extractRatio: 0,
      })
      let latestExtractRatio = 0
      try {
        const transcript = await transcribeVideoFile(starterVideoFile, {
          onPhaseChange: (phase) => {
            setTranscriptionProgress((prev) => ({
              phase,
              extractRatio: phase === 'extracting_audio' ? (prev?.extractRatio ?? 0) : null,
            }))
            store.setVideoTranscriptionProgress(create.course.id, {
              phase,
              extractRatio: phase === 'extracting_audio' ? latestExtractRatio : null,
            })
          },
          onExtractProgress: ({ ratio }) => {
            latestExtractRatio = ratio
            setTranscriptionProgress({ phase: 'extracting_audio', extractRatio: ratio })
            store.setVideoTranscriptionProgress(create.course.id, {
              phase: 'extracting_audio',
              extractRatio: ratio,
            })
          },
        })
        setTranscriptionProgress(null)
        store.setVideoTranscriptionProgress(create.course.id, null)
        store.updateCourseVideo(create.course.id, {
          transcript: transcript.transcript,
          transcriptText: transcript.text,
          transcriptStatus: 'ready',
          transcriptErrorMessage: undefined,
        })
        let metadataDrafted = false
        let quizDrafted = false
        let metadataError: string | undefined
        let quizError: string | undefined
        let finalCourseTitle = create.course.title
        const transcriptForMetadata = transcript.text
        const latestCourse =
          storeRef.current.state.courses.find((entry) => entry.id === create.course.id) ?? create.course
        const quizPolicy = buildQuizPolicy(latestCourse.videoMinutes)

        try {
          setStarterUploadStatus('Drafting title, summary, description, category, and topic...')
          const draftedMetadata = await draftCourseMetadataFromTranscript({
            transcript: transcriptForMetadata,
            courseTitle: latestCourse.title,
            allowedTopics: COURSE_TOPICS,
            courseMinutes: latestCourse.videoMinutes,
          })
          const nextTitle = draftedMetadata.title || latestCourse.title
          const nextSummary = draftedMetadata.summary || latestCourse.summary
          const nextDescription = draftedMetadata.description || latestCourse.description
          const nextCategory = draftedMetadata.category || 'General'
          const nextTopic = pickAllowedTopic(draftedMetadata.topic)
          const saveMetadata = storeRef.current.updateCourseDetails(create.course.id, {
            title: nextTitle,
            summary: nextSummary,
            description: nextDescription,
            category: nextCategory,
            topic: nextTopic,
            level: latestCourse.level,
            instructorId: latestCourse.instructorId,
          })
          if (!saveMetadata.ok) {
            metadataError = saveMetadata.message ?? 'Could not save AI-drafted metadata.'
          } else {
            metadataDrafted = true
            finalCourseTitle = nextTitle
          }
        } catch (metadataDraftError) {
          metadataError =
            metadataDraftError instanceof Error
              ? metadataDraftError.message
              : 'Could not draft metadata from transcript.'
        }

        try {
          setStarterUploadStatus('Generating quiz bank from transcript...')
          const quizDraft = await draftQuizBankFromTranscript({
            transcript: transcriptForMetadata,
            courseTitle: finalCourseTitle || latestCourse.title,
            allowedTopics: COURSE_TOPICS,
            courseMinutes: latestCourse.videoMinutes,
            questionBankSize: quizPolicy.generatedQuestionCount,
            questionsShown: quizPolicy.shownQuestionCount,
          })
          const saveQuiz = storeRef.current.updateCourseQuiz(
            create.course.id,
            normalizeDraftQuiz(create.course.id, quizDraft.questions),
            {
              ...quizPolicy,
              sourceModel: quizDraft.model,
            },
          )
          if (!saveQuiz.ok) {
            quizError = saveQuiz.message ?? 'Could not save AI-generated quiz bank.'
          } else {
            quizDrafted = true
          }
        } catch (quizDraftError) {
          quizError =
            quizDraftError instanceof Error ? quizDraftError.message : 'Could not draft quiz bank from transcript.'
        }
        setStarterUploadStatus(null)
        setUploadOutcome({
          kind: 'success',
          courseId: create.course.id,
          courseTitle: finalCourseTitle,
          transcriptOk: true,
          metadataDrafted,
          quizDrafted,
          metadataError,
          quizError,
        })
      } catch (transcriptError) {
        const transcriptMessage =
          transcriptError instanceof Error ? transcriptError.message : 'Transcript generation failed.'
        store.updateCourseVideo(create.course.id, {
          transcriptStatus: 'error',
          transcriptErrorMessage: transcriptMessage,
        })
        setStarterUploadStatus(null)
        setUploadOutcome({
          kind: 'success',
          courseId: create.course.id,
          courseTitle: create.course.title,
          transcriptOk: false,
          transcriptError: transcriptMessage,
        })
      }
      setTranscriptionProgress(null)
      store.setVideoTranscriptionProgress(create.course.id, null)
      setStarterVideoFile(null)
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Upload failed.'
      store.updateCourseVideo(create.course.id, {
        muxStatus: 'error',
        muxErrorMessage: message,
        transcriptStatus: 'error',
        transcriptErrorMessage: message,
      })
      setStarterUploadStatus(null)
      setTranscriptionProgress(null)
      store.setVideoUploadProgress(create.course.id, null)
      store.setVideoTranscriptionProgress(create.course.id, null)
      setUploadOutcome({ kind: 'failed', message })
    } finally {
      setByteUploadProgress(null)
      setTranscriptionProgress(null)
      store.clearVideoProcessingProgress(create.course.id)
      setStarterUploadBusy(false)
    }
  }

  return (
    <section className="page page-admin page-admin-courses">
      <header className="page-header page-header--compact">
        <p className="section-eyebrow">Admin · Course workflow</p>
        <h1>Create a draft course</h1>
        <p className="page-subtitle">
          This page has one objective: start a new draft from a source video and generate the first transcript.
        </p>
      </header>

      {error ? <p className="inline-error">{error}</p> : null}

      {!canCreateCourse ? (
        <article className="empty-state">
          <h2>Course creation is restricted</h2>
          <p>You need instructor, content admin, or super admin access to create drafts.</p>
        </article>
      ) : (
        <section className="admin-form-shell stack-sm">
          <h2>Upload video to start draft</h2>
          <p className="muted small-copy">
            After upload and transcript, this flow drafts title, summary, description, category, and topic. You can
            still edit everything in Draft prep. The full video is stored for playback; speech is prepared in your
            browser before sending for transcription. Very long recordings may still be too large after compression
            (about 25 MB max per attempt).
          </p>
          {!isMuxFunctionConfigured() ? (
            <p className="inline-error small-copy">
              {import.meta.env.DEV ? (
                <>
                  Set <code>VITE_SUPABASE_URL</code> so the app can call the mux function at{' '}
                  <code>…/functions/v1/mux</code> on that host, or set <code>VITE_MUX_FUNCTION_URL</code> in{' '}
                  <code>app/.env</code>. Deploy the mux Edge Function if needed, then restart <code>npm run dev</code>.
                </>
              ) : (
                <>
                  Video upload is not configured. Your administrator should set{' '}
                  <code>VITE_SUPABASE_URL</code> (or <code>VITE_MUX_FUNCTION_URL</code>, or{' '}
                  <code>VITE_FEEDBACK_FUNCTION_URL</code> pointing at the same Supabase project) in the hosting build
                  environment, redeploy, and ensure the mux Edge Function is deployed.
                </>
              )}
            </p>
          ) : null}
          <form className="stack-sm" onSubmit={(event) => void handleUploadToStartCourse(event)}>
            <input
              type="file"
              accept="video/*"
              disabled={starterUploadBusy || !isMuxFunctionConfigured()}
              onChange={(event) => {
                setStarterUploadStatus(null)
                setUploadOutcome(null)
                setTranscriptionProgress(null)
                setStarterVideoFile(event.target.files?.[0] ?? null)
              }}
              required
            />
            <div className="button-row">
              <button type="submit" disabled={starterUploadBusy || !isMuxFunctionConfigured()}>
                {starterUploadBusy ? 'Uploading...' : 'Upload and create draft'}
              </button>
            </div>
            {uploadOutcome?.kind === 'success' ? (
              <p className="muted small-copy">
                Your draft is ready. Use <strong>Go to draft prep</strong> at the bottom of the page to continue, or choose
                another video above to upload another draft.
              </p>
            ) : null}
            {byteUploadProgress ? (
              <VideoUploadProgressBar
                loaded={byteUploadProgress.loaded}
                total={byteUploadProgress.total}
                startedAt={byteUploadProgress.startedAt}
              />
            ) : null}
            {transcriptionProgress ? (
              <TranscriptionProgressBar
                phase={transcriptionProgress.phase}
                extractRatio={transcriptionProgress.extractRatio}
              />
            ) : null}
            {starterUploadStatus && !byteUploadProgress && !transcriptionProgress ? (
              <p className="meta-line">{starterUploadStatus}</p>
            ) : null}
          </form>

          {uploadOutcome?.kind === 'success' ? (
            <article
              className={`upload-outcome-card${
                uploadOutcome.transcriptOk && uploadOutcome.metadataDrafted && uploadOutcome.quizDrafted
                  ? ' upload-outcome-card--full'
                  : ' upload-outcome-card--partial'
              }`}
              aria-live="polite"
            >
              <h3 className="upload-outcome-card__title">
                {uploadOutcome.transcriptOk && uploadOutcome.metadataDrafted && uploadOutcome.quizDrafted
                  ? 'Draft created successfully'
                  : 'Draft created — review details'}
              </h3>
              <p className="upload-outcome-card__lead">
                Your draft <strong>{uploadOutcome.courseTitle}</strong> is in the catalog
                {store.coursesSyncStatus === 'synced'
                  ? ' and has been saved to the shared database.'
                  : '.'}{' '}
                Use <strong>Go to draft prep</strong> at the bottom of the page to edit details or retry transcript
                generation.
              </p>
              <ul className="upload-outcome-steps">
                <li className="upload-outcome-steps__item upload-outcome-steps__item--ok">
                  <span className="upload-outcome-steps__label">Video</span>
                  <span className="upload-outcome-steps__detail">Uploaded and ready for playback in the course player.</span>
                </li>
                <li
                  className={`upload-outcome-steps__item${uploadOutcome.transcriptOk ? ' upload-outcome-steps__item--ok' : ' upload-outcome-steps__item--warn'}`}
                >
                  <span className="upload-outcome-steps__label">Transcript</span>
                  {uploadOutcome.transcriptOk ? (
                    <span className="upload-outcome-steps__detail">Generated and attached to the course video.</span>
                  ) : (
                    <div className="upload-outcome-steps__detail">
                      <p className="upload-outcome-steps__warn-line">
                        Not generated. The draft still exists; you can re-upload from Draft prep or fix the issue below.
                      </p>
                      {uploadOutcome.transcriptError ? (
                        <pre className="upload-outcome-steps__error-detail">{uploadOutcome.transcriptError}</pre>
                      ) : null}
                    </div>
                  )}
                </li>
                <li
                  className={`upload-outcome-steps__item${uploadOutcome.metadataDrafted ? ' upload-outcome-steps__item--ok' : ' upload-outcome-steps__item--warn'}`}
                >
                  <span className="upload-outcome-steps__label">Catalog metadata</span>
                  {uploadOutcome.transcriptOk ? (
                    uploadOutcome.metadataDrafted ? (
                      <span className="upload-outcome-steps__detail">
                        Title, summary, description, category, and topic were drafted from transcript content.
                      </span>
                    ) : (
                      <div className="upload-outcome-steps__detail">
                        <p className="upload-outcome-steps__warn-line">
                          Metadata auto-drafting did not finish. You can edit these fields in Draft prep.
                        </p>
                        {uploadOutcome.metadataError ? (
                          <pre className="upload-outcome-steps__error-detail">{uploadOutcome.metadataError}</pre>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <span className="upload-outcome-steps__detail">
                      Skipped because transcript generation did not complete.
                    </span>
                  )}
                </li>
                <li
                  className={`upload-outcome-steps__item${uploadOutcome.quizDrafted ? ' upload-outcome-steps__item--ok' : ' upload-outcome-steps__item--warn'}`}
                >
                  <span className="upload-outcome-steps__label">Quiz bank</span>
                  {uploadOutcome.transcriptOk ? (
                    uploadOutcome.quizDrafted ? (
                      <span className="upload-outcome-steps__detail">
                        Quiz bank was generated from transcript content and saved to this draft.
                      </span>
                    ) : (
                      <div className="upload-outcome-steps__detail">
                        <p className="upload-outcome-steps__warn-line">
                          Quiz bank generation did not finish. You can review and edit quiz content in Draft prep.
                        </p>
                        {uploadOutcome.quizError ? (
                          <pre className="upload-outcome-steps__error-detail">{uploadOutcome.quizError}</pre>
                        ) : null}
                      </div>
                    )
                  ) : (
                    <span className="upload-outcome-steps__detail">
                      Skipped because transcript generation did not complete.
                    </span>
                  )}
                </li>
              </ul>
            </article>
          ) : null}

          {uploadOutcome?.kind === 'failed' ? (
            <article className="upload-outcome-card upload-outcome-card--failed" aria-live="assertive">
              <h3 className="upload-outcome-card__title">Upload did not finish</h3>
              <p className="upload-outcome-card__lead">
                Nothing was saved to the catalog from this attempt. Adjust and try again, or check the message below.
              </p>
              <pre className="upload-outcome-steps__error-detail">{uploadOutcome.message}</pre>
            </article>
          ) : null}
        </section>
      )}

      <JourneyTaskFooter
        backTo="/admin/courses"
        backLabel="Workflow overview"
        nextTo="/admin/courses/drafts"
        nextLabel="Next: Draft prep"
      />
    </section>
  )
}
