import { getWeeklyKmSummary, getRecentRuns } from '@/lib/queries'
import { getMarathonWeek, MARATHON_DATE, formatPace } from '@/lib/utils'
import { MarathonChart } from '@/components/MarathonChart'
import { StatCard } from '@/components/StatCard'

export default async function RunningPage() {
  const [weeklySummary, recentRuns] = await Promise.all([
    getWeeklyKmSummary(12),
    getRecentRuns(5),
  ])

  const currentWeek = getMarathonWeek(new Date()) ?? 0
  const weeksLeft = 26 - currentWeek
  const progressPct = Math.round((currentWeek / 26) * 100)

  const totalKm = recentRuns.reduce((sum, r) => sum + (r.distance_km ?? 0), 0)
  const longestRun = Math.max(...recentRuns.map(r => r.distance_km ?? 0), 0)
  const runsWithPace = recentRuns.filter(r => r.distance_km && r.distance_km > 0)
  const avgPace = runsWithPace.length > 0
    ? formatPace(
        runsWithPace.reduce((s, r) => s + r.duration_min, 0) / runsWithPace.length,
        runsWithPace.reduce((s, r) => s + (r.distance_km ?? 0), 0) / runsWithPace.length
      )
    : '—'

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold">Marathon Progress</h1>
        <p className="text-sm text-zinc-500 mt-1">
          {MARATHON_DATE.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })} · {weeksLeft} weeks to go
        </p>
      </div>

      {/* Progress bar */}
      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="flex justify-between text-xs text-zinc-500 mb-2">
          <span>Week {currentWeek}</span>
          <span>Week 26</span>
        </div>
        <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
          <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${progressPct}%` }} />
        </div>
        <p className="text-xs text-zinc-500 mt-2 text-center">{progressPct}% of training plan complete</p>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-6">
        <StatCard label="Longest run" value={longestRun.toFixed(1)} unit="km" />
        <StatCard label="Avg pace" value={avgPace} />
        <StatCard label="Total km (5 runs)" value={totalKm.toFixed(1)} unit="km" />
      </div>

      {/* Chart */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-6">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Weekly km — last 12 weeks</h2>
        <MarathonChart data={weeklySummary} />
      </div>

      {/* Last 5 runs */}
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Last 5 runs</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs text-zinc-500 border-b border-zinc-800">
              <th className="text-left pb-2">Date</th>
              <th className="text-right pb-2">Dist</th>
              <th className="text-right pb-2">Time</th>
              <th className="text-right pb-2">Avg HR</th>
              <th className="text-right pb-2">Zone</th>
            </tr>
          </thead>
          <tbody>
            {recentRuns.map(run => (
              <tr key={run.id} className="border-b border-zinc-800/50">
                <td className="py-2 text-zinc-400">{run.date}</td>
                <td className="py-2 text-right">{run.distance_km?.toFixed(1) ?? '—'} km</td>
                <td className="py-2 text-right">{run.duration_min} min</td>
                <td className="py-2 text-right text-zinc-400">{run.avg_hr ?? '—'}</td>
                <td className="py-2 text-right">
                  <span className="text-xs bg-zinc-800 px-2 py-0.5 rounded-full">{run.training_zone ?? '—'}</span>
                </td>
              </tr>
            ))}
            {recentRuns.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-zinc-600">No runs yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
