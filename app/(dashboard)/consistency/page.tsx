import { getWorkoutsForRange } from '@/lib/queries'
import { addDays, calculateStreak } from '@/lib/utils'
import { ConsistencyHeatmap } from '@/components/ConsistencyHeatmap'
import { ActivityDonut } from '@/components/ActivityDonut'
import { StatCard } from '@/components/StatCard'

export default async function ConsistencyPage() {
  const oneYearAgo = addDays(new Date(), -365)
  const workouts = await getWorkoutsForRange(oneYearAgo, new Date())

  // Aggregate minutes by date
  const minutesByDate = new Map<string, number>()
  for (const w of workouts) {
    minutesByDate.set(w.date, (minutesByDate.get(w.date) ?? 0) + w.duration_min)
  }
  const heatmapData = Array.from(minutesByDate.entries()).map(([date, minutes]) => ({ date, minutes }))

  // Streak
  const dates = workouts.map(w => w.date)
  const currentStreak = calculateStreak(dates)

  // Longest streak
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

  // Activity breakdown
  const activityCounts: Record<string, number> = {}
  for (const w of workouts) {
    activityCounts[w.activity_type] = (activityCounts[w.activity_type] ?? 0) + 1
  }
  const donutData = Object.entries(activityCounts)
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)

  // Most active month
  const monthCounts: Record<string, number> = {}
  for (const w of workouts) {
    const month = w.date.slice(0, 7)
    monthCounts[month] = (monthCounts[month] ?? 0) + 1
  }
  const mostActiveMonth = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Consistency</h1>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Current streak" value={currentStreak} unit="days" />
        <StatCard label="Longest streak" value={longest} unit="days" />
        <StatCard label="Most active month" value={mostActiveMonth} />
      </div>

      {/* Heatmap */}
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

      {/* Donut */}
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
