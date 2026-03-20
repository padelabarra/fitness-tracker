import 'server-only'
import { supabase, type Workout, type NutritionEntry } from './supabase'
import { toISODate, startOfWeek, addDays, getPhaseTarget, getMarathonWeek, calculateStreak } from './utils'

// --- Workout queries ---

export async function getWorkoutsForRange(
  startDate: Date,
  endDate: Date,
  userId: string,
  activityType?: string
): Promise<Workout[]> {
  let query = supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .gte('date', toISODate(startDate))
    .lte('date', toISODate(endDate))
    .order('date', { ascending: false })

  if (activityType) {
    query = query.eq('activity_type', activityType)
  }

  const { data, error } = await query
  if (error) throw new Error(`getWorkoutsForRange: ${error.message}`)
  return data ?? []
}

export async function getWeeklyKmSummary(weeks: number, userId: string): Promise<
  Array<{ weekStart: string; actualKm: number; targetKm: number | null; weekNumber: number | null }>
> {
  const rangeStart = startOfWeek(addDays(new Date(), -(weeks - 1) * 7))
  const rangeEnd = addDays(startOfWeek(new Date()), 6)
  const allRuns = await getWorkoutsForRange(rangeStart, rangeEnd, userId, 'running')

  const results: Array<{ weekStart: string; actualKm: number; targetKm: number | null; weekNumber: number | null }> = []

  for (let i = weeks - 1; i >= 0; i--) {
    const mondayOfWeek = startOfWeek(addDays(new Date(), -i * 7))
    const sundayOfWeek = addDays(mondayOfWeek, 6)
    const weekStartStr = toISODate(mondayOfWeek)
    const weekEndStr = toISODate(sundayOfWeek)

    const weekRuns = allRuns.filter(w => w.date >= weekStartStr && w.date <= weekEndStr)
    const actualKm = weekRuns.reduce((sum, w) => sum + (w.distance_km ?? 0), 0)
    const weekNumber = getMarathonWeek(mondayOfWeek)
    const targetKm = weekNumber !== null ? getPhaseTarget(weekNumber) : null

    results.push({
      weekStart: weekStartStr,
      actualKm: Math.round(actualKm * 10) / 10,
      targetKm,
      weekNumber,
    })
  }

  return results
}

export async function getRecentRuns(limit = 5, userId: string): Promise<Workout[]> {
  const { data, error } = await supabase
    .from('workouts')
    .select('*')
    .eq('user_id', userId)
    .eq('activity_type', 'running')
    .not('distance_km', 'is', null)
    .order('date', { ascending: false })
    .limit(limit)

  if (error) throw new Error(`getRecentRuns: ${error.message}`)
  return data ?? []
}

export async function getWorkoutStreak(userId: string): Promise<number> {
  const today = new Date()
  const sixtyDaysAgo = addDays(today, -60)
  const workouts = await getWorkoutsForRange(sixtyDaysAgo, today, userId)
  const dates = workouts.map(w => w.date)
  return calculateStreak(dates)
}

// --- Nutrition queries ---

export async function getNutritionForRange(
  startDate: Date,
  endDate: Date,
  userId: string
): Promise<NutritionEntry[]> {
  const { data, error } = await supabase
    .from('nutrition')
    .select('*')
    .eq('user_id', userId)
    .gte('date', toISODate(startDate))
    .lte('date', toISODate(endDate))
    .order('date', { ascending: false })
    .order('created_at', { ascending: false })

  if (error) throw new Error(`getNutritionForRange: ${error.message}`)
  return data ?? []
}

export interface DailyNutritionSummary {
  date: string
  calories: number
  protein: number
}

export function aggregateDailyNutrition(entries: NutritionEntry[]): DailyNutritionSummary[] {
  const byDate: Record<string, DailyNutritionSummary> = {}

  for (const entry of entries) {
    if (!byDate[entry.date]) {
      byDate[entry.date] = { date: entry.date, calories: 0, protein: 0 }
    }
    byDate[entry.date].calories += Number(entry.calories_approx ?? 0)
    byDate[entry.date].protein += Number(entry.protein_g ?? 0)
  }

  return Object.values(byDate).sort((a, b) => a.date.localeCompare(b.date))
}

// --- Weekly stats for overview page ---
export interface WeekStats {
  kmThisWeek: number
  activeMinutes: number
  avgDailyProtein: number
  streak: number
}

export async function getWeekStats(userId: string): Promise<WeekStats> {
  const monday = startOfWeek(new Date())
  const sunday = addDays(monday, 6)

  const [workouts, nutritionEntries, streak] = await Promise.all([
    getWorkoutsForRange(monday, sunday, userId),
    getNutritionForRange(monday, sunday, userId),
    getWorkoutStreak(userId),
  ])

  const kmThisWeek = workouts
    .filter(w => w.activity_type === 'running')
    .reduce((sum, w) => sum + (w.distance_km ?? 0), 0)

  const activeMinutes = workouts.reduce((sum, w) => sum + (w.duration_min ?? 0), 0)

  const dailyNutrition = aggregateDailyNutrition(nutritionEntries)
  const avgDailyProtein = dailyNutrition.length > 0
    ? dailyNutrition.reduce((sum, d) => sum + d.protein, 0) / dailyNutrition.length
    : 0

  return {
    kmThisWeek: Math.round(kmThisWeek * 10) / 10,
    activeMinutes,
    avgDailyProtein: Math.round(avgDailyProtein),
    streak,
  }
}
