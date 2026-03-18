import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// --- Constants ---
export const CALORIE_TARGET = 2200
export const PROTEIN_TARGET = 150

// Marathon date: first Sunday of September 2026
export const MARATHON_DATE = new Date(2026, 8, 6)   // September 6, 2026
// Training start: anchor point is 2026-03-15 (Sunday before week 1 Monday)
// Week 1 = Mar 16–22, Week 26 = Marathon week (Sep 6)
export const TRAINING_START = new Date(2026, 2, 15)  // March 15, 2026

// --- Marathon week calculation ---
export function getMarathonWeek(currentDate: Date = new Date()): number | null {
  const msPerWeek = 7 * 24 * 60 * 60 * 1000
  // Normalize both dates to UTC midnight (date-only) to avoid timezone-offset skew
  const cur = Date.UTC(currentDate.getUTCFullYear(), currentDate.getUTCMonth(), currentDate.getUTCDate())
  const start = Date.UTC(TRAINING_START.getUTCFullYear(), TRAINING_START.getUTCMonth(), TRAINING_START.getUTCDate())
  const diff = cur - start
  if (diff < 0) return null
  return Math.min(26, Math.floor(diff / msPerWeek) + 1)
}

// --- Phase target km/week ---
// Returns null for weeks 23+ (pre-race buffer)
export function getPhaseTarget(week: number): number | null {
  if (week < 1) return null
  if (week <= 6) return 40
  if (week <= 12) return 55
  if (week <= 18) return 70
  if (week === 19) return 50
  if (week === 20) return 40
  if (week === 21) return 30
  if (week === 22) return 20
  return null
}

// --- Workout streak ---
// Input: array of ISO date strings (YYYY-MM-DD) from the DB
// Returns: count of consecutive days ending today (or yesterday if no workout today)
export function calculateStreak(dates: string[]): number {
  if (dates.length === 0) return 0

  const uniqueDates = [...new Set(dates)].sort().reverse()
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  let streak = 0
  let checkDate = today

  for (const dateStr of uniqueDates) {
    const d = new Date(dateStr)
    d.setHours(0, 0, 0, 0)
    const diffDays = Math.round((checkDate.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))

    if (diffDays === 0) {
      streak++
      checkDate = new Date(d)
      checkDate.setDate(checkDate.getDate() - 1)
    } else if (diffDays === 1 && streak === 0) {
      // Allow streak starting yesterday
      streak++
      checkDate = new Date(d)
      checkDate.setDate(checkDate.getDate() - 1)
    } else {
      break
    }
  }

  return streak
}

// --- Date helpers ---
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function startOfWeek(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) // Monday start
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function formatPace(durationMin: number, distanceKm: number): string {
  if (!distanceKm || distanceKm === 0) return '—'
  if (!durationMin || durationMin <= 0) return '—'
  const paceDecimal = durationMin / distanceKm
  const mins = Math.floor(paceDecimal)
  const secs = Math.round((paceDecimal - mins) * 60)
  return `${mins}:${secs.toString().padStart(2, '0')} /km`
}
