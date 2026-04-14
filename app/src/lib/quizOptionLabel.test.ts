import { describe, expect, it } from 'vitest'
import { quizOptionBody } from './quizOptionLabel'

describe('quizOptionBody', () => {
  it('strips leading letter + ) and spacing', () => {
    expect(quizOptionBody('a) The availability of templates.')).toBe(
      'The availability of templates.',
    )
  })

  it('leaves labels without a prefix unchanged', () => {
    expect(quizOptionBody('Documenting alternatives and rationale')).toBe(
      'Documenting alternatives and rationale',
    )
  })

  it('does not strip words that start with a letter followed by space', () => {
    expect(quizOptionBody('a broad summary only')).toBe('a broad summary only')
  })
})
