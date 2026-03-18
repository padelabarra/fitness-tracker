import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { toISODate } from '@/lib/utils'

export async function POST(request: NextRequest) {
  // Auth check
  const secret = request.headers.get('api-secret')
  if (secret !== process.env.API_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { date, meal_type, food_description, calories_approx, protein_g, notes } = body as Record<string, unknown>

  if (!meal_type || !food_description) {
    return NextResponse.json({ error: 'meal_type and food_description are required' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('nutrition')
    .insert({
      user_id: 'default',
      date: date ?? toISODate(new Date()),
      meal_type,
      food_description,
      calories_approx: calories_approx ?? null,
      protein_g: protein_g ?? null,
      notes: notes ?? null,
      source: 'telegram',
    })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
