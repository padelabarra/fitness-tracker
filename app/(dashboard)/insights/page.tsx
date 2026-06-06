import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { supabase } from '@/lib/supabase'
import { getDailySnapshots, getPerformanceTrend } from '@/lib/garmin-queries'
import type { NutritionEntry } from '@/lib/supabase'
import { InsightsChart } from '@/components/InsightsChart'

export default async function InsightsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const fourteenDaysAgo = new Date()
  fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14)
  const since = fourteenDaysAgo.toISOString().split('T')[0]

  const [nutritionResult, snapshots, performance] = await Promise.all([
    supabase
      .from('nutrition')
      .select('*')
      .eq('user_id', session.user.id)
      .gte('date', since)
      .order('date', { ascending: true }),
    getDailySnapshots(session.user.id, 14),
    getPerformanceTrend(session.user.id, 14),
  ])

  const nutrition: NutritionEntry[] = nutritionResult.data ?? []

  const hasData = nutrition.length > 0 && snapshots.length > 0

  if (!hasData) {
    return (
      <div className="p-4 md:p-6">
        <h1 className="text-2xl font-bold mb-4">Insights</h1>
        <p className="text-muted-foreground">
          Insights appear once you have both nutrition logs and Garmin biometric data.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Insights</h1>
      <p className="text-sm text-muted-foreground">14-day rolling window</p>
      <InsightsChart nutrition={nutrition} snapshots={snapshots} performance={performance} />
    </div>
  )
}
