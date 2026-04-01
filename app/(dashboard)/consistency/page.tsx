import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getWorkoutsForRange } from '@/lib/queries'
import { addDays, startOfWeek, toISODate, calculateStreak } from '@/lib/utils'
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap'
import { ActivityDonut } from '@/components/ActivityDonut'
import { StatCard } from '@/components/StatCard'
import { WeeklyChart } from '@/components/WeeklyChart'
import { LogActivityDialog } from '@/components/LogActivityDialogDynamic'

export default async function ConsistencyPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const today = new Date()
  const oneYearAgo = addDays(today, -365)
  const monday = startOfWeek(today)
  const sunday = addDays(monday, 6)

  const [workouts, weekWorkouts] = await Promise.all([
    getWorkoutsForRange(oneYearAgo, today, userId),
    getWorkoutsForRange(monday, sunday, userId),
  ])

  const minutesByDate = new Map<string, number>()
  for (const w of workouts) {
    minutesByDate.set(w.date, (minutesByDate.get(w.date) ?? 0) + w.duration_min)
  }
  const heatmapData = Array.from(minutesByDate.entries()).map(([date, minutes]) => ({ date, minutes }))

  const dates = workouts.map(w => w.date)
  const currentStreak = calculateStreak(dates)

  const sortedDates = [...new Set(dates)].sort()
  let longest = 0, temp = 0
  for (let i = 0; i < sortedDates.length; i++) {
    if (i === 0) { temp = 1; continue }
    const prev = new Date(sortedDates[i - 1])
    const curr = new Date(sortedDates[i])
    const diff = Math.round((curr.getTime() - prev.getTime()) / (24 * 60 * 60 * 1000))
    temp = diff === 1 ? temp + 1 : 1
    longest = Math.max(longest, temp)
  }

  const activityCounts: Record<string, number> = {}
  for (const w of workouts) {
    activityCounts[w.activity_type] = (activityCounts[w.activity_type] ?? 0) + 1
  }
  const donutData = Object.entries(activityCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  const monthCounts: Record<string, number> = {}
  for (const w of workouts) {
    const month = w.date.slice(0, 7)
    monthCounts[month] = (monthCounts[month] ?? 0) + 1
  }
  const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const weekChartData = days.map((day, i) => {
    const date = toISODate(addDays(monday, i))
    const dayWorkouts = weekWorkouts.filter(w => w.date === date)
    const calories = dayWorkouts.reduce((sum, w) => sum + (w.calories ?? 0), 0)
    return { date: day, calories, protein: 0 }
  })

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Consistency</h1>
        <LogActivityDialog />
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Current streak" value={currentStreak} unit="days" />
        <StatCard label="Longest streak" value={longest} unit="days" />
        <StatCard label="Most active month" value={mostActiveMonth} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">This week — calories burned</h2>
        <WeeklyChart data={weekChartData} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-4 overflow-x-auto">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Last 52 weeks</h2>
        <div className="flex gap-2 text-xs text-zinc-600 mb-2 items-center">
          <span>Less</span>
          {[0, 15, 45, 75].map(min => (
            <span key={min} className="w-3 h-3 rounded-sm inline-block"
              style={{ backgroundColor: min === 0 ? '#27272a' : min < 30 ? '#86efac' : min < 60 ? '#22c55e' : '#15803d' }} />
          ))}
          <span>More</span>
        </div>
        <ConsistencyHeatmap data={heatmapData} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-2">Activity breakdown</h2>
        {donutData.length > 0 ? (
          <ActivityDonut data={donutData} />
        ) : (
          <p className="text-sm text-zinc-600 text-center py-4">No activity data yet</p>
        )}
      </div>
    </div>
  )
}
