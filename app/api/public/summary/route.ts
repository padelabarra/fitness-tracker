import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { timingSafeEqual } from 'crypto';

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-api-secret') ?? '';
  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 90);

  // Resolve userId from ?user= param, validated against known users
  const allowedUsers = [process.env.USER1_ID, process.env.USER2_ID].filter(Boolean) as string[]
  const requestedUser = searchParams.get('user')
  const userId = (requestedUser && allowedUsers.includes(requestedUser))
    ? requestedUser
    : (process.env.USER1_ID ?? 'default')

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  // Fetch workouts
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('date, activity_type, duration_min, distance_km, calories, training_zone, avg_hr')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  // Fetch nutrition
  const { data: nutrition, error: nErr } = await supabase
    .from('nutrition')
    .select('date, meal_type, food_description, calories_approx, protein_g')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  // Aggregate daily calories + protein for chart use
  const dailyNutrition: Record<string, { calories: number; protein: number }> = {};
  for (const entry of nutrition ?? []) {
    if (!dailyNutrition[entry.date]) {
      dailyNutrition[entry.date] = { calories: 0, protein: 0 };
    }
    dailyNutrition[entry.date].calories += entry.calories_approx ?? 0;
    dailyNutrition[entry.date].protein  += entry.protein_g ?? 0;
  }

  return NextResponse.json({
    workouts,
    nutrition_log: nutrition,
    daily_nutrition: Object.entries(dailyNutrition)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    generated_at: new Date().toISOString(),
  });
}
