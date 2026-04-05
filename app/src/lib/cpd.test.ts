import { describe, expect, it } from 'vitest'
import { calculateCpdHours } from './cpd'

describe('calculateCpdHours', () => {
  it('rounds 60 minutes to 1.0 hour', () => {
    expect(calculateCpdHours(60)).toBe(1)
  })

  it('rounds to nearest quarter hour as required by PRD', () => {
    expect(calculateCpdHours(50)).toBe(0.75)
    expect(calculateCpdHours(80)).toBe(1.25)
    expect(calculateCpdHours(90)).toBe(1.5)
  })

  it('supports very short and very long courses', () => {
    expect(calculateCpdHours(5)).toBe(0)
    expect(calculateCpdHours(300)).toBe(5)
  })
})
