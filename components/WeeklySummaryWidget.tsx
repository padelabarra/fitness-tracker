import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getDailySnapshots } from '@/lib/garmin-queries'
import { supabase } from '@/lib/supabase'

interface WeeklySummaryWidgetProps {
  userId: string
}

function getWeekBounds(): { start: string; end: string } {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon...
  const daysToMon = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - daysToMon)
  const sunday = new Date(monday)
  sunday.setDate(monday.getDate() + 6)

  const fmt = (d: Date) => d.toISOString().split('T')[0]
  return { start: fmt(monday), end: fmt(sunday) }
}

export async function WeeklySummaryWidget({ userId }: WeeklySummaryWidgetProps) {
  const { start, end } = getWeekBounds()

  // Fetch workouts for this week
  const { data: workouts } = await supabase
    .from('workouts')
    .select('distance_km, duration_min, date')
    .eq('user_id', userId)
    .gte('date', start)
    .lte('date', end)

  const totalKm = (workouts ?? []).reduce((sum, w) => sum + (w.distance_km ?? 0), 0)
  const totalMin = (workouts ?? []).reduce((sum, w) => sum + (w.duration_min ?? 0), 0)

  // Fetch Garmin snapshots for this week (7 days)
  const snapshots = await getDailySnapshots(userId, 7)
  const weekSnapshots = snapshots.filter(s => s.date >= start && s.date <= end)

  const sleepScores = weekSnapshots
    .map(s => s.sleep_score)
    .filter((v): v is number => v !== null)
  const avgSleepScore = sleepScores.length > 0
    ? Math.round(sleepScores.reduce((a, b) => a + b, 0) / sleepScores.length)
    : null

  const batteryValues = weekSnapshots
    .filter(s => s.body_battery_end !== null)
    .sort((a, b) => a.date.localeCompare(b.date))
  const firstBattery = batteryValues[0]?.body_battery_end ?? null
  const lastBattery = batteryValues[batteryValues.length - 1]?.body_battery_end ?? null
  const batteryTrend =
    firstBattery !== null && lastBattery !== null
      ? lastBattery > firstBattery ? '↑ recovering' : lastBattery < firstBattery ? '↓ digging a hole' : '→ stable'
      : null

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">This Week</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-muted-foreground">Distance</p>
            <p className="text-lg font-semibold">
              {totalKm > 0 ? `${totalKm.toFixed(1)} km` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Active time</p>
            <p className="text-lg font-semibold">
              {totalMin > 0 ? `${Math.floor(totalMin / 60)}h ${totalMin % 60}m` : '—'}
            </p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Avg sleep score</p>
            <p className="text-lg font-semibold">{avgSleepScore ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Body battery</p>
            <p className="text-lg font-semibold">{batteryTrend ?? '—'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
