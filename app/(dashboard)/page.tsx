import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getWeekStats, getNutritionForRange, getWorkoutsForRange, aggregateDailyNutrition } from '@/lib/queries'
import { startOfWeek, addDays, toISODate, getMarathonWeek } from '@/lib/utils'
import { StatCard } from '@/components/StatCard'
import { WeeklyChart } from '@/components/WeeklyChart'
import { WeekNav } from '@/components/WeekNav'

function parseMondayParam(weekParam: string | undefined): Date {
  if (weekParam) {
    const d = new Date(weekParam + 'T00:00:00')
    if (!isNaN(d.getTime())) return startOfWeek(d)
  }
  return startOfWeek(new Date())
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const { week } = await searchParams
  const monday = parseMondayParam(week)
  const sunday = addDays(monday, 6)
  const currentWeek = getMarathonWeek(monday)

  const [stats, nutritionEntries, workouts] = await Promise.all([
    getWeekStats(userId, monday),
    getNutritionForRange(monday, sunday, userId),
    getWorkoutsForRange(monday, sunday, userId),
  ])

  const dailyNutrition = aggregateDailyNutrition(nutritionEntries)
  const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
  const chartData = days.map((day, i) => {
    const date = toISODate(addDays(monday, i))
    const nutrition = dailyNutrition.find(d => d.date === date)
    const dayWorkouts = workouts.filter(w => w.date === date)
    const calories = dayWorkouts.reduce((sum, w) => sum + (w.calories ?? 0), 0)
    return { date: day, calories, protein: nutrition?.protein ?? 0 }
  })

  const weekDates = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wider">Week {currentWeek ?? '—'} of 26</p>
          <h1 className="text-xl font-semibold">{weekDates}</h1>
        </div>
        <WeekNav
          monday={toISODate(monday)}
          weekDates={weekDates}
          weekNumber={currentWeek}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Km this week" value={stats.kmThisWeek} unit="km" />
        <StatCard label="Active minutes" value={stats.activeMinutes} unit="min" />
        <StatCard label="Avg daily protein" value={stats.avgDailyProtein} unit="g" />
        <StatCard label="Workout streak" value={stats.streak} unit="days" />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">This week</h2>
        <WeeklyChart data={chartData} />
      </div>
    </div>
  )
}
