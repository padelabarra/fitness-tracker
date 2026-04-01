'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { supabase, type ActivityType, type Workout } from '@/lib/supabase'
import { toISODate } from '@/lib/utils'

interface LogActivityInput {
  date?: string
  activity_type: ActivityType
  duration_min: number
  distance_km?: number
  calories?: number
  notes?: string
}

export async function logActivity(input: LogActivityInput): Promise<Workout> {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = session.user.id

  const date = input.date ?? toISODate(new Date())

  const { data, error } = await supabase
    .from('workouts')
    .insert({
      user_id: userId,
      date,
      activity_type: input.activity_type,
      duration_min: input.duration_min,
      distance_km: input.distance_km ?? null,
      avg_hr: null,
      max_hr: null,
      calories: input.calories ?? null,
      training_zone: null,
      notes: input.notes ?? null,
      source: 'manual',
      raw_data: null,
    })
    .select()
    .single()

  if (error) throw new Error(`logActivity: ${error.message}`)

  revalidatePath('/consistency')
  return data
}
