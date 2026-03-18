'use server'

import { revalidatePath } from 'next/cache'
import { supabase, type MealType } from '@/lib/supabase'
import { toISODate } from '@/lib/utils'

interface LogFoodInput {
  date?: string  // ISO date, defaults to today
  meal_type: MealType
  food_description: string
  calories_approx?: number
  protein_g?: number
  notes?: string
}

export async function logFood(input: LogFoodInput) {
  const date = input.date ?? toISODate(new Date())

  const { data, error } = await supabase
    .from('nutrition')
    .insert({
      user_id: 'default',
      date,
      meal_type: input.meal_type,
      food_description: input.food_description,
      calories_approx: input.calories_approx ?? null,
      protein_g: input.protein_g ?? null,
      notes: input.notes ?? null,
      source: 'manual',
    })
    .select()
    .single()

  if (error) throw new Error(`logFood: ${error.message}`)

  revalidatePath('/nutrition')
  return data
}
