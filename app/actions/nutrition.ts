'use server'

import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { supabase, type MealType, type NutritionSource } from '@/lib/supabase'
import { toISODate } from '@/lib/utils'

interface LogFoodInput {
  date?: string
  meal_type: MealType
  food_description: string
  calories_approx?: number
  protein_g?: number
  notes?: string
  source?: NutritionSource
}

export async function logFood(input: LogFoodInput) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')
  const userId = session.user.id

  const date = input.date ?? toISODate(new Date())

  const { data, error } = await supabase
    .from('nutrition')
    .insert({
      user_id: userId,
      date,
      meal_type: input.meal_type,
      food_description: input.food_description,
      calories_approx: input.calories_approx ?? null,
      protein_g: input.protein_g ?? null,
      notes: input.notes ?? null,
      source: input.source ?? 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(`logFood: ${error.message}`)

  revalidatePath('/nutrition')
  return data
}
