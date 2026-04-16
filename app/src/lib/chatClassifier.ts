export type ClassifiedMessageKind = 'question' | 'chat'

export interface ChatClassificationResult {
  score: number
  kind: ClassifiedMessageKind
  reasons: string[]
}

export interface ClassifyLiveChatMessageOptions {
  threshold?: number
}

const DEFAULT_QUESTION_THRESHOLD = 0.55
const QUESTION_STARTER_REGEX = /^(how|what|when|where|why|who|which|can|could|would|should|is|are|do|does|did|has|have|may|might)\b/i
const QUESTION_INTENT_REGEX = /\b(clarify|explain|help|confirm|walk\s+me\s+through)\b/i
const ONLY_URL_REGEX = /^https?:\/\/\S+$/i

const FUZZY_STARTER_PHRASES = [
  'how do',
  'how can',
  'what is',
  'when does',
  'where can',
  'why is',
  'who can',
  'can you',
  'could you',
  'would you',
  'should we',
] as const

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  if (value < 0) return 0
  if (value > 1) return 1
  return value
}

function normalizeMessageInput(input: string): string {
  return input.replace(/\s+/g, ' ').trim()
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0
  if (!a.length) return b.length
  if (!b.length) return a.length
  const columns = b.length + 1
  const matrix = Array.from({ length: a.length + 1 }, () => new Array<number>(columns).fill(0))

  for (let row = 0; row <= a.length; row += 1) matrix[row][0] = row
  for (let col = 0; col <= b.length; col += 1) matrix[0][col] = col

  for (let row = 1; row <= a.length; row += 1) {
    for (let col = 1; col <= b.length; col += 1) {
      const cost = a[row - 1] === b[col - 1] ? 0 : 1
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost,
      )
    }
  }

  return matrix[a.length][b.length]
}

function fuzzyStarterSimilarity(input: string): number {
  const words = input.toLowerCase().split(' ').filter(Boolean)
  const prefix = words.slice(0, 3).join(' ')
  if (!prefix) return 0

  let best = 0
  for (const phrase of FUZZY_STARTER_PHRASES) {
    const distance = levenshteinDistance(prefix, phrase)
    const maxLen = Math.max(prefix.length, phrase.length)
    if (maxLen === 0) continue
    const similarity = 1 - distance / maxLen
    if (similarity > best) best = similarity
  }
  return clamp01(best)
}

export function classifyLiveChatMessage(
  input: string,
  options?: ClassifyLiveChatMessageOptions,
): ChatClassificationResult {
  const normalized = normalizeMessageInput(input)
  if (!normalized) {
    return { score: 0, kind: 'chat', reasons: ['empty_message'] }
  }

  let score = 0
  const reasons: string[] = []

  if (normalized.includes('?')) {
    score += 0.58
    reasons.push('contains_question_mark')
  }

  if (QUESTION_STARTER_REGEX.test(normalized)) {
    score += 0.28
    reasons.push('starts_with_question_word')
  }

  if (QUESTION_INTENT_REGEX.test(normalized)) {
    score += 0.14
    reasons.push('contains_question_intent_keyword')
  }

  const fuzzySimilarity = fuzzyStarterSimilarity(normalized)
  if (fuzzySimilarity >= 0.72) {
    score += 0.22 * fuzzySimilarity
    reasons.push('fuzzy_matches_question_starter')
  }

  if (ONLY_URL_REGEX.test(normalized)) {
    score -= 0.35
    reasons.push('url_only_penalty')
  }

  const tokenCount = normalized.split(' ').filter(Boolean).length
  if (tokenCount === 1 && !normalized.includes('?')) {
    score -= 0.2
    reasons.push('single_word_penalty')
  }

  const boundedScore = clamp01(score)
  const threshold = options?.threshold ?? DEFAULT_QUESTION_THRESHOLD
  return {
    score: boundedScore,
    kind: boundedScore >= threshold ? 'question' : 'chat',
    reasons,
  }
}

export const liveChatClassifierConstants = {
  defaultQuestionThreshold: DEFAULT_QUESTION_THRESHOLD,
  fuzzyStarterPhrases: FUZZY_STARTER_PHRASES,
}
