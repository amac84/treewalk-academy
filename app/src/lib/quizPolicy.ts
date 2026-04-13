import { REQUIRED_PASSING_SCORE } from '../constants'
import type { Course, QuizPolicy, QuizQuestion } from '../types'

const SHOWN_MIN = 6
const SHOWN_MAX = 25
const SHOWN_MULTIPLE = 3
const GENERATED_MIN = 20
const GENERATED_MAX = 60

export function computeShownQuestionCount(courseMinutes: number): number {
  const raw = Math.round(courseMinutes * 0.2)
  const bounded = Math.min(SHOWN_MAX, Math.max(SHOWN_MIN, raw))
  const normalized = Math.max(SHOWN_MIN, Math.round(bounded / SHOWN_MULTIPLE) * SHOWN_MULTIPLE)
  return Math.min(SHOWN_MAX, normalized)
}

export function computeGeneratedQuestionCount(shownQuestionCount: number): number {
  const raw = Math.round(shownQuestionCount * 2.5)
  return Math.min(GENERATED_MAX, Math.max(GENERATED_MIN, raw))
}

export function buildQuizPolicy(courseMinutes: number, sourceModel?: string): QuizPolicy {
  const shownQuestionCount = computeShownQuestionCount(courseMinutes)
  const generatedQuestionCount = computeGeneratedQuestionCount(shownQuestionCount)
  return {
    passThreshold: REQUIRED_PASSING_SCORE,
    shownQuestionCount,
    generatedQuestionCount,
    minutesBasis: courseMinutes,
    generatedAt: new Date().toISOString(),
    sourceModel,
  }
}

export function ensureQuizPolicy(course: Pick<Course, 'videoMinutes' | 'quizPolicy' | 'quiz'>): QuizPolicy {
  if (course.quizPolicy) {
    return {
      ...course.quizPolicy,
      shownQuestionCount: Math.max(1, Math.min(course.quizPolicy.shownQuestionCount, course.quiz.length || 1)),
      generatedQuestionCount: Math.max(course.quiz.length, course.quizPolicy.generatedQuestionCount),
    }
  }
  const fallback = buildQuizPolicy(course.videoMinutes)
  return {
    ...fallback,
    shownQuestionCount: Math.min(fallback.shownQuestionCount, Math.max(1, course.quiz.length || 1)),
    generatedQuestionCount: Math.max(course.quiz.length, fallback.generatedQuestionCount),
  }
}

function seededHash(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(seed: number) {
  let t = seed
  return () => {
    t += 0x6d2b79f5
    let x = Math.imul(t ^ (t >>> 15), 1 | t)
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x)
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296
  }
}

export function selectAttemptQuestions(
  quizBank: QuizQuestion[],
  desiredCount: number,
  seedInput: string,
): QuizQuestion[] {
  if (quizBank.length <= desiredCount) return quizBank.slice()
  const rand = mulberry32(seededHash(seedInput))
  const shuffled = quizBank
    .map((question) => ({ question, rank: rand() }))
    .sort((a, b) => a.rank - b.rank)
    .map((item) => item.question)
  return shuffled.slice(0, desiredCount)
}
