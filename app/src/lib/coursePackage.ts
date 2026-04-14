import type { Course, CoursePackageActivity, CoursePackageProfile, QuizQuestion } from '../types'
import { ensureQuizPolicy } from './quizPolicy'
import { buildCourseTranscriptDownload } from './transcript'

export const COURSE_PACKAGE_EXPORT_SCHEMA_VERSION = 1
const COURSE_PACKAGE_PROFILE_SCHEMA_VERSION = 1
const DEFAULT_EXPORT_LOCALE = 'en-US'

type CoursePackageQuestion = {
  id: string
  prompt: string
  explanation?: string
  difficulty?: QuizQuestion['difficulty']
  options: Array<{
    id: string
    label: string
    isCorrect: boolean
  }>
}

export type CoursePackageExport = {
  schemaVersion: number
  generatedAt: string
  profile: CoursePackageProfile
  course: {
    courseId: string
    title: string
    summary: string
    description: string
    category: string
    topic: Course['topic']
    level: Course['level']
    audience: Course['audience']
    instructorId: string
    status: Course['status']
    version: number
    createdAt: string
    updatedAt: string
    publishedAt?: string
  }
  media: {
    videoMinutes: number
    muxAssetId?: string
    muxPlaybackId?: string
    transcript: ReturnType<typeof buildCourseTranscriptDownload>['video']
  }
  assessment: {
    passThreshold: number
    shownQuestionCount: number
    generatedQuestionCount: number
    questions: CoursePackageQuestion[]
  }
  outline: CoursePackageActivity[]
}

function normalizeCoursePackageProfile(course: Course): CoursePackageProfile {
  const raw = course.packageProfile
  return {
    schemaVersion:
      typeof raw?.schemaVersion === 'number' && Number.isFinite(raw.schemaVersion) && raw.schemaVersion > 0
        ? Math.round(raw.schemaVersion)
        : COURSE_PACKAGE_PROFILE_SCHEMA_VERSION,
    locale: typeof raw?.locale === 'string' && raw.locale.trim() ? raw.locale.trim() : DEFAULT_EXPORT_LOCALE,
    runtimeMode: raw?.runtimeMode === 'multi_sco' ? 'multi_sco' : 'single_sco',
    mediaDelivery: raw?.mediaDelivery === 'packaged_file' ? 'packaged_file' : 'stream',
    manifestIdentifier:
      typeof raw?.manifestIdentifier === 'string' && raw.manifestIdentifier.trim()
        ? raw.manifestIdentifier.trim()
        : course.id,
  }
}

function defaultCourseOutline(course: Course): CoursePackageActivity[] {
  return [
    {
      id: `${course.id}-module-1`,
      title: course.title,
      type: 'video_assessment',
      required: true,
    },
  ]
}

function normalizeCourseOutline(course: Course): CoursePackageActivity[] {
  if (!Array.isArray(course.activityOutline) || course.activityOutline.length === 0) {
    return defaultCourseOutline(course)
  }
  const normalized = course.activityOutline
    .map((entry) => ({
      id: entry.id.trim(),
      title: entry.title.trim(),
      type: entry.type,
      required: entry.required,
    }))
    .filter((entry) => entry.id.length > 0 && entry.title.length > 0)
  return normalized.length > 0 ? normalized : defaultCourseOutline(course)
}

export function buildCoursePackageExport(course: Course): CoursePackageExport {
  const transcriptDownload = buildCourseTranscriptDownload(course)
  const quizPolicy = ensureQuizPolicy(course)

  return {
    schemaVersion: COURSE_PACKAGE_EXPORT_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    profile: normalizeCoursePackageProfile(course),
    course: {
      courseId: course.id,
      title: course.title,
      summary: course.summary,
      description: course.description,
      category: course.category,
      topic: course.topic,
      level: course.level,
      audience: course.audience,
      instructorId: course.instructorId,
      status: course.status,
      version: course.version,
      createdAt: course.createdAt,
      updatedAt: course.updatedAt,
      publishedAt: course.publishedAt,
    },
    media: {
      videoMinutes: course.videoMinutes,
      muxAssetId: course.muxAssetId,
      muxPlaybackId: course.muxPlaybackId,
      transcript: transcriptDownload.video,
    },
    assessment: {
      passThreshold: quizPolicy.passThreshold,
      shownQuestionCount: quizPolicy.shownQuestionCount,
      generatedQuestionCount: quizPolicy.generatedQuestionCount,
      questions: course.quiz.map((question) => ({
        id: question.id,
        prompt: question.prompt,
        explanation: question.explanation,
        difficulty: question.difficulty,
        options: question.options.map((option) => ({
          id: option.id,
          label: option.label,
          isCorrect: option.isCorrect,
        })),
      })),
    },
    outline: normalizeCourseOutline(course),
  }
}
