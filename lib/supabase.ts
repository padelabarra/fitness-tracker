import 'server-only'
import { createClient } from '@supabase/supabase-js'

export type ActivityType = 'running' | 'rowing' | 'gym_upper' | 'gym_lower' | 'hiking' | 'weights' | 'other'
export type TrainingZone = 'Z1' | 'Z2' | 'Z3' | 'Z4' | 'Z5'
export type MealType = 'breakfast' | 'lunch' | 'dinner' | 'snack' | 'supplement'
export type WorkoutSource = 'garmin' | 'strava' | 'manual'
export type NutritionSource = 'telegram' | 'manual' | 'photo'

export interface Workout {
  id: string
  user_id: string
  date: string           // ISO date YYYY-MM-DD
  activity_type: ActivityType
  duration_min: number
  distance_km: number | null
  avg_hr: number | null
  max_hr: number | null
  calories: number | null
  training_zone: TrainingZone | null
  notes: string | null
  source: WorkoutSource
  raw_data: Record<string, unknown> | null
  created_at: string
}

export interface NutritionEntry {
  id: string
  user_id: string
  date: string           // ISO date YYYY-MM-DD
  meal_type: MealType
  food_description: string
  calories_approx: number | null
  protein_g: number | null
  notes: string | null
  source: NutritionSource
  created_at: string
}

const supabaseUrl = process.env.SUPABASE_URL
const supabaseKey = process.env.SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error(
    'Missing Supabase env vars: SUPABASE_URL and SUPABASE_ANON_KEY must be set in .env.local'
  )
}

export const supabase = createClient(supabaseUrl, supabaseKey)
