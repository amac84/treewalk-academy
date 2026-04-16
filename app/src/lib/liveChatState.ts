import { classifyLiveChatMessage } from './chatClassifier'
import type {
  LiveChatClassificationSource,
  LiveChatMessage,
  LiveChatMessageKind,
} from '../types'

export const LIVE_CHAT_TABLE = 'live_chat_messages'
export const MAX_LIVE_CHAT_MESSAGE_LENGTH = 500
export const MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE = 500
export const MAX_LIVE_CHAT_USER_NAME_LENGTH = 120

export interface LiveChatMessageRow {
  id: string
  occurrence_id: string
  user_id: string
  user_name_snapshot: string
  body: string
  message_kind: LiveChatMessageKind
  classification_source: LiveChatClassificationSource
  question_score: number
  is_deleted: boolean
  created_at: string
  updated_at: string
}

export interface BuildLiveChatInsertRowInput {
  id: string
  occurrenceId: string
  userId: string
  userNameSnapshot: string
  body: string
  forceKind?: LiveChatMessageKind
}

function normalizeLiveChatBody(body: string): string {
  return body.replace(/\r\n/g, '\n').trim()
}

function normalizeUserNameSnapshot(value: string): string {
  const normalized = value.trim()
  if (!normalized) return 'Participant'
  if (normalized.length <= MAX_LIVE_CHAT_USER_NAME_LENGTH) return normalized
  return normalized.slice(0, MAX_LIVE_CHAT_USER_NAME_LENGTH)
}

export function validateLiveChatBody(body: string): { ok: true; value: string } | { ok: false; message: string } {
  const normalized = normalizeLiveChatBody(body)
  if (!normalized) {
    return { ok: false, message: 'Message cannot be empty.' }
  }
  if (normalized.length > MAX_LIVE_CHAT_MESSAGE_LENGTH) {
    return {
      ok: false,
      message: `Message must be ${MAX_LIVE_CHAT_MESSAGE_LENGTH} characters or fewer.`,
    }
  }
  return { ok: true, value: normalized }
}

function roundScore(value: number): number {
  return Math.max(0, Math.min(1, Math.round(value * 1000) / 1000))
}

function getOverrideQuestionScore(kind: LiveChatMessageKind): number {
  return kind === 'question' ? 1 : 0
}

export function buildLiveChatInsertRow(input: BuildLiveChatInsertRowInput): LiveChatMessageRow {
  const body = normalizeLiveChatBody(input.body)
  const auto = classifyLiveChatMessage(body)
  const messageKind = input.forceKind ?? auto.kind
  const classificationSource: LiveChatClassificationSource = input.forceKind ? 'user_override' : 'auto'
  const questionScore = input.forceKind ? getOverrideQuestionScore(messageKind) : auto.score
  const nowIso = new Date().toISOString()
  return {
    id: input.id,
    occurrence_id: input.occurrenceId,
    user_id: input.userId,
    user_name_snapshot: normalizeUserNameSnapshot(input.userNameSnapshot),
    body,
    message_kind: messageKind,
    classification_source: classificationSource,
    question_score: roundScore(questionScore),
    is_deleted: false,
    created_at: nowIso,
    updated_at: nowIso,
  }
}

export function toLiveChatMessage(row: LiveChatMessageRow): LiveChatMessage {
  return {
    id: row.id,
    occurrenceId: row.occurrence_id,
    userId: row.user_id,
    userNameSnapshot: row.user_name_snapshot,
    body: row.body,
    messageKind: row.message_kind,
    classificationSource: row.classification_source,
    questionScore: row.question_score,
    isDeleted: row.is_deleted,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export function upsertLiveChatMessageList(
  existing: LiveChatMessage[],
  incoming: LiveChatMessage,
): LiveChatMessage[] {
  const withoutMatch = existing.filter((item) => item.id !== incoming.id)
  const next = [...withoutMatch, incoming]
  next.sort((a, b) => {
    const byCreated = a.createdAt.localeCompare(b.createdAt)
    if (byCreated !== 0) return byCreated
    return a.id.localeCompare(b.id)
  })
  if (next.length <= MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE) return next
  return next.slice(next.length - MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE)
}

export function upsertLiveChatMessageMap(
  existing: Record<string, LiveChatMessage[]>,
  incoming: LiveChatMessage,
): Record<string, LiveChatMessage[]> {
  const occurrenceId = incoming.occurrenceId
  const bucket = existing[occurrenceId] ?? []
  return {
    ...existing,
    [occurrenceId]: upsertLiveChatMessageList(bucket, incoming),
  }
}

export function replaceLiveChatMessageMapForOccurrence(
  existing: Record<string, LiveChatMessage[]>,
  occurrenceId: string,
  incoming: LiveChatMessage[],
): Record<string, LiveChatMessage[]> {
  const sorted = [...incoming].sort((a, b) => {
    const byCreated = a.createdAt.localeCompare(b.createdAt)
    if (byCreated !== 0) return byCreated
    return a.id.localeCompare(b.id)
  })
  const bounded =
    sorted.length <= MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE
      ? sorted
      : sorted.slice(sorted.length - MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE)
  return {
    ...existing,
    [occurrenceId]: bounded,
  }
}

export function removeLiveChatMessageFromMap(
  existing: Record<string, LiveChatMessage[]>,
  occurrenceId: string,
  messageId: string,
): Record<string, LiveChatMessage[]> {
  const current = existing[occurrenceId] ?? []
  const filtered = current.filter((item) => item.id !== messageId)
  return {
    ...existing,
    [occurrenceId]: filtered,
  }
}

export function findLiveChatMessage(
  existing: Record<string, LiveChatMessage[]>,
  messageId: string,
): { occurrenceId: string; message: LiveChatMessage } | null {
  for (const [occurrenceId, bucket] of Object.entries(existing)) {
    const found = bucket.find((message) => message.id === messageId)
    if (found) return { occurrenceId, message: found }
  }
  return null
}

export function canReclassifyLiveChatMessage(
  message: LiveChatMessage,
  currentUserId: string | null | undefined,
): boolean {
  if (!currentUserId) return false
  if (message.isDeleted) return false
  return message.userId === currentUserId
}

export function buildLiveChatReclassifyPatch(nextKind: LiveChatMessageKind): Pick<
  LiveChatMessageRow,
  'message_kind' | 'classification_source' | 'question_score'
> {
  return {
    message_kind: nextKind,
    classification_source: 'user_override',
    question_score: getOverrideQuestionScore(nextKind),
  }
}
