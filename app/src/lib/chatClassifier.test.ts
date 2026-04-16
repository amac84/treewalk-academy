import { describe, expect, it } from 'vitest'
import { classifyLiveChatMessage } from './chatClassifier'

describe('classifyLiveChatMessage', () => {
  it('classifies direct question prompts as questions', () => {
    const result = classifyLiveChatMessage('How do I submit my CPD credits?')
    expect(result.kind).toBe('question')
    expect(result.score).toBeGreaterThanOrEqual(0.55)
    expect(result.reasons).toContain('contains_question_mark')
    expect(result.reasons).toContain('starts_with_question_word')
  })

  it('classifies plain discussion text as chat', () => {
    const result = classifyLiveChatMessage('Thanks everyone, this framework is very helpful.')
    expect(result.kind).toBe('chat')
    expect(result.score).toBeLessThan(0.55)
  })

  it('applies URL-only penalty', () => {
    const result = classifyLiveChatMessage('https://example.com/resource')
    expect(result.kind).toBe('chat')
    expect(result.reasons).toContain('url_only_penalty')
  })

  it('adds fuzzy starter signal for typo variants', () => {
    const result = classifyLiveChatMessage('cn you', { threshold: 0.1 })
    expect(result.kind).toBe('question')
    expect(result.reasons).toContain('fuzzy_matches_question_starter')
  })
})
