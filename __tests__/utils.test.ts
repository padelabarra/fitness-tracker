import { describe, it, expect } from 'vitest'
import {
  CALORIE_TARGET,
  PROTEIN_TARGET,
  getMarathonWeek,
  calculateStreak,
  getPhaseTarget,
  formatPace,
  toISODate,
  cn,
} from '@/lib/utils'

describe('constants', () => {
  it('calorie target is 2200', () => {
    expect(CALORIE_TARGET).toBe(2200)
  })
  it('protein target is 150', () => {
    expect(PROTEIN_TARGET).toBe(150)
  })
})

describe('getMarathonWeek', () => {
  it('returns 1 for the first week of training', () => {
    // Training starts 2026-03-16 (week 1), marathon 2026-09-06
    const result = getMarathonWeek(new Date('2026-03-17'))
    expect(result).toBe(1)
  })
  it('returns correct week mid-plan', () => {
    const result = getMarathonWeek(new Date('2026-06-01'))
    expect(result).toBeGreaterThan(1)
    expect(result).toBeLessThan(27)
  })
  it('returns 26 at marathon week', () => {
    const result = getMarathonWeek(new Date('2026-09-06'))
    expect(result).toBe(26)
  })
})

describe('getPhaseTarget', () => {
  it('returns 40 for week 1 (phase 1)', () => {
    expect(getPhaseTarget(1)).toBe(40)
  })
  it('returns 55 for week 7 (phase 2)', () => {
    expect(getPhaseTarget(7)).toBe(55)
  })
  it('returns 70 for week 13 (phase 3)', () => {
    expect(getPhaseTarget(13)).toBe(70)
  })
  it('returns taper values for weeks 19-22', () => {
    expect(getPhaseTarget(19)).toBe(50)
    expect(getPhaseTarget(20)).toBe(40)
    expect(getPhaseTarget(21)).toBe(30)
    expect(getPhaseTarget(22)).toBe(20)
  })
  it('returns null for weeks 23+', () => {
    expect(getPhaseTarget(23)).toBeNull()
    expect(getPhaseTarget(26)).toBeNull()
  })
})

describe('formatPace', () => {
  it('formats pace correctly', () => {
    expect(formatPace(30, 5)).toBe('6:00 /km')
  })
  it('returns em dash for zero distance', () => {
    expect(formatPace(30, 0)).toBe('—')
  })
  it('handles fractional seconds', () => {
    expect(formatPace(25, 4)).toBe('6:15 /km')
  })
})

describe('calculateStreak', () => {
  it('returns 0 for empty array', () => {
    expect(calculateStreak([])).toBe(0)
  })
  it('returns 1 for single today entry', () => {
    const today = new Date()
    const todayStr = toISODate(today)
    expect(calculateStreak([todayStr])).toBe(1)
  })
  it('counts consecutive days ending today', () => {
    const today = new Date()
    const dates = [0, 1, 2].map(d => {
      const dt = new Date(today)
      dt.setDate(dt.getDate() - d)
      return toISODate(dt)
    })
    expect(calculateStreak(dates)).toBe(3)
  })
  it('stops at first gap', () => {
    const today = new Date()
    const d0 = new Date(today)
    const d2 = new Date(today)
    d2.setDate(d2.getDate() - 2)  // gap: day 1 missing
    const dates = [d0, d2].map(d => toISODate(d))
    expect(calculateStreak(dates)).toBe(1)
  })
})
