import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'crypto'
import { supabase } from '@/lib/supabase'
import { toISODate } from '@/lib/utils'
import { auth } from '@/auth'

const VALID_MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snack', 'supplement'] as const

function safeCompareSecrets(a: string, b: string): boolean {
  // Hash both to ensure equal-length buffers for timingSafeEqual
  const bufA = Buffer.from(a.padEnd(64).slice(0, 64))
  const bufB = Buffer.from(b.padEnd(64).slice(0, 64))
  return timingSafeEqual(bufA, bufB)
}

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function POST(request: NextRequest) {
  // Determine userId — browser session takes priority, then Telegram API secret
  let userId: string | null = null

  const session = await auth()
  if (session?.user?.id) {
    userId = session.user.id
  } else {
    // Telegram bot path: validate API_SECRET and use USER1_ID as default
    const expectedSecret = process.env.API_SECRET
    if (!expectedSecret) {
      console.error('API_SECRET env var is not set')
      return NextResponse.json({ error: 'Service misconfigured' }, { status: 503 })
    }
    const providedSecret = request.headers.get('api-secret') ?? ''
    if (!safeCompareSecrets(providedSecret, expectedSecret)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = process.env.USER1_ID ?? 'default'
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const {
    date,
    meal_type,
    food_description,
    calories_approx,
    protein_g,
    notes,
  } = body as Record<string, unknown>

  // Type narrowing and validation
  if (typeof meal_type !== 'string' || typeof food_description !== 'string') {
    return NextResponse.json(
      { error: 'meal_type and food_description must be strings' },
      { status: 400 }
    )
  }

  if (!food_description.trim()) {
    return NextResponse.json({ error: 'food_description cannot be empty' }, { status: 400 })
  }

  if (!VALID_MEAL_TYPES.includes(meal_type as (typeof VALID_MEAL_TYPES)[number])) {
    return NextResponse.json(
      { error: `meal_type must be one of: ${VALID_MEAL_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  // Date validation
  const entryDate = date != null
    ? (typeof date === 'string' && ISO_DATE_RE.test(date) ? date : null)
    : toISODate(new Date())

  if (entryDate === null) {
    return NextResponse.json({ error: 'date must be in YYYY-MM-DD format' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('nutrition')
    .insert({
      user_id: userId,
      date: entryDate,
      meal_type,
      food_description: food_description.trim(),
      calories_approx: typeof calories_approx === 'number' ? calories_approx : null,
      protein_g: typeof protein_g === 'number' ? protein_g : null,
      notes: typeof notes === 'string' ? notes.trim() || null : null,
      source: 'telegram' as const,
    })
    .select()
    .single()

  if (error) {
    console.error('nutrition insert error:', error.message)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }

  return NextResponse.json(data, { status: 201 })
}
