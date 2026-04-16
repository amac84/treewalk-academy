import { describe, expect, it } from 'vitest'
import type { LiveChatMessage } from '../types'
import {
  buildLiveChatInsertRow,
  canReclassifyLiveChatMessage,
  findLiveChatMessage,
  MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE,
  MAX_LIVE_CHAT_MESSAGE_LENGTH,
  MAX_LIVE_CHAT_USER_NAME_LENGTH,
  upsertLiveChatMessageMap,
  validateLiveChatBody,
} from './liveChatState'

describe('liveChatState send behavior', () => {
  it('builds auto-classified question rows for normal sends', () => {
    const row = buildLiveChatInsertRow({
      id: 'chat-1',
      occurrenceId: 'occ-1',
      userId: 'u-1',
      userNameSnapshot: 'Alex',
      body: 'What time does this session end?',
    })
    expect(row.message_kind).toBe('question')
    expect(row.classification_source).toBe('auto')
    expect(row.question_score).toBeGreaterThan(0)
  })

  it('uses user override when sender forces message type', () => {
    const row = buildLiveChatInsertRow({
      id: 'chat-2',
      occurrenceId: 'occ-1',
      userId: 'u-1',
      userNameSnapshot: 'Alex',
      body: 'Can we get the replay link?',
      forceKind: 'chat',
    })
    expect(row.message_kind).toBe('chat')
    expect(row.classification_source).toBe('user_override')
    expect(row.question_score).toBe(0)
  })

  it('rejects messages above max length', () => {
    const body = 'x'.repeat(MAX_LIVE_CHAT_MESSAGE_LENGTH + 1)
    const validation = validateLiveChatBody(body)
    expect(validation.ok).toBe(false)
  })

  it('truncates very long user display names', () => {
    const row = buildLiveChatInsertRow({
      id: 'chat-3',
      occurrenceId: 'occ-1',
      userId: 'u-1',
      userNameSnapshot: 'A'.repeat(MAX_LIVE_CHAT_USER_NAME_LENGTH + 20),
      body: 'Quick update',
    })
    expect(row.user_name_snapshot.length).toBe(MAX_LIVE_CHAT_USER_NAME_LENGTH)
  })
})

describe('liveChatState reclassify behavior', () => {
  const baseMessage: LiveChatMessage = {
    id: 'chat-1',
    occurrenceId: 'occ-1',
    userId: 'u-1',
    userNameSnapshot: 'Alex',
    body: 'Example',
    messageKind: 'chat',
    classificationSource: 'auto',
    questionScore: 0.2,
    isDeleted: false,
    createdAt: '2026-04-15T00:00:00.000Z',
    updatedAt: '2026-04-15T00:00:00.000Z',
  }

  it('allows reclassify only for message author', () => {
    expect(canReclassifyLiveChatMessage(baseMessage, 'u-1')).toBe(true)
    expect(canReclassifyLiveChatMessage(baseMessage, 'u-2')).toBe(false)
  })

  it('upserts by id when realtime events repeat', () => {
    const map1 = upsertLiveChatMessageMap({}, baseMessage)
    const map2 = upsertLiveChatMessageMap(map1, {
      ...baseMessage,
      body: 'Updated body',
      updatedAt: '2026-04-15T00:01:00.000Z',
    })
    const located = findLiveChatMessage(map2, baseMessage.id)
    expect(located).not.toBeNull()
    expect(located?.message.body).toBe('Updated body')
    expect(map2['occ-1']).toHaveLength(1)
  })

  it('keeps only the most recent bounded message window', () => {
    let map: Record<string, LiveChatMessage[]> = {}
    const startTs = Date.parse('2026-04-15T00:00:00.000Z')
    for (let i = 0; i < MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE + 12; i += 1) {
      const createdAt = new Date(startTs + i * 1000).toISOString()
      map = upsertLiveChatMessageMap(map, {
        ...baseMessage,
        id: `chat-${i}`,
        body: `Message ${i}`,
        createdAt,
        updatedAt: createdAt,
      })
    }
    expect(map['occ-1']).toHaveLength(MAX_LIVE_CHAT_MESSAGES_PER_OCCURRENCE)
    expect(map['occ-1'][0]?.id).toBe('chat-12')
  })
})
