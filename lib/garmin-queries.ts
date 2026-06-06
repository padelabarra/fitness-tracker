import 'server-only'
import { supabase, type GarminDailySnapshot, type GarminPerformance } from './supabase'

export async function getLatestDailySnapshot(userId: string): Promise<GarminDailySnapshot | null> {
  const { data, error } = await supabase
    .from('garmin_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestDailySnapshot: ${error.message}`)
  return data
}

export async function getDailySnapshots(userId: string, days: number): Promise<GarminDailySnapshot[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('garmin_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })
  if (error) throw new Error(`getDailySnapshots: ${error.message}`)
  return data ?? []
}

export async function getLatestPerformance(userId: string): Promise<GarminPerformance | null> {
  const { data, error } = await supabase
    .from('garmin_performance')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestPerformance: ${error.message}`)
  return data
}

export async function getPerformanceTrend(userId: string, days: number): Promise<GarminPerformance[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('garmin_performance')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })
  if (error) throw new Error(`getPerformanceTrend: ${error.message}`)
  return data ?? []
}
