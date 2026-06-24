import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getLatestPerformance, getPerformanceTrend, getDailySnapshots } from '@/lib/garmin-queries'
import { TrendChart, type TrendPoint } from '@/components/TrendChart'
import { TrainingReadinessBadge } from '@/components/TrainingReadinessBadge'
import { RacePredictionsTable } from '@/components/RacePredictionsTable'
import { TrainingLoadBar } from '@/components/TrainingLoadBar'

export default async function PerformancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const isPedro = session.user.id === process.env.USER1_ID

  if (!isPedro) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-muted-foreground">Garmin data is not available for this account.</p>
      </div>
    )
  }

  const [latest, trend, snapshots] = await Promise.all([
    getLatestPerformance(session.user.id),
    getPerformanceTrend(session.user.id, 90),
    getDailySnapshots(session.user.id, 30),
  ])

  // Performance trend series (from garmin_performance, 90 days)
  const p = <K extends keyof typeof trend[0]>(key: K): TrendPoint[] =>
    trend.map(d => ({ date: d.date, value: (d[key] as number | null) }))

  const vo2maxData      = p('vo2max')
  const readinessData   = p('training_readiness')
  const hrvWeeklyData   = p('hrv_weekly_avg')
  const trainingLoadData = p('training_load_7d')

  // Daily health series (from garmin_daily_snapshots, 30 days)
  const s = <K extends keyof typeof snapshots[0]>(key: K): TrendPoint[] =>
    snapshots.map(d => ({ date: d.date, value: (d[key] as number | null) }))

  const bodyBatteryData  = s('body_battery_end')
  const restingHRData    = s('resting_hr')
  const sleepScoreData   = s('sleep_score')
  const sleepDurData     = snapshots.map(d => ({
    date: d.date,
    value: d.sleep_duration_min !== null ? Math.round((d.sleep_duration_min / 60) * 10) / 10 : null,
  }))
  const stressData       = s('stress_avg')
  const hrvNightData     = s('hrv_last_night')
  const stepsData        = s('steps')
  const activeCalsData   = s('calories_active')

  return (
    <div className="space-y-8 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Performance</h1>

      {/* ── Status cards ─────────────────────────────────────────── */}
      <div className="grid gap-4 md:grid-cols-3">
        <TrainingReadinessBadge score={latest?.training_readiness ?? null} />
        <TrainingLoadBar load={latest?.training_load_7d ?? null} />
        <RacePredictionsTable performance={latest} />
      </div>

      {/* ── Performance trends (garmin_performance) ──────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Performance Trends</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TrendChart
            title="VO2 Max"
            unit="ml/kg/min"
            data={vo2maxData}
            color="#6366f1"
            type="area"
            domain={[45, 'auto']}
            format="fixed1"
          />
          <TrendChart
            title="Training Readiness"
            unit="score"
            data={readinessData}
            color="#22c55e"
            type="line"
            domain={[0, 100]}
          />
          <TrendChart
            title="HRV Weekly Avg"
            unit="ms"
            data={hrvWeeklyData}
            color="#a855f7"
            type="area"
          />
          <TrendChart
            title="Training Load"
            unit="7-day"
            data={trainingLoadData}
            color="#f97316"
            type="bar"
          />
        </div>
      </section>

      {/* ── Daily health (garmin_daily_snapshots) ────────────────── */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Daily Health</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <TrendChart
            title="Body Battery"
            unit="end of day"
            data={bodyBatteryData}
            color="#3b82f6"
            type="area"
            domain={[0, 100]}
          />
          <TrendChart
            title="Resting Heart Rate"
            unit="bpm"
            data={restingHRData}
            color="#ef4444"
            type="area"
            domain={['auto', 'auto']}
          />
          <TrendChart
            title="Sleep Score"
            unit="/ 100"
            data={sleepScoreData}
            color="#14b8a6"
            type="bar"
            domain={[0, 100]}
          />
          <TrendChart
            title="Sleep Duration"
            unit="hrs"
            data={sleepDurData}
            color="#06b6d4"
            type="bar"
            format="hours"
          />
          <TrendChart
            title="Stress Level"
            unit="avg"
            data={stressData}
            color="#f59e0b"
            type="bar"
            domain={[0, 100]}
          />
          <TrendChart
            title="HRV Last Night"
            unit="ms"
            data={hrvNightData}
            color="#8b5cf6"
            type="area"
          />
          <TrendChart
            title="Steps"
            data={stepsData}
            color="#10b981"
            type="bar"
            format="locale"
          />
          <TrendChart
            title="Active Calories"
            unit="kcal"
            data={activeCalsData}
            color="#eab308"
            type="bar"
          />
        </div>
      </section>
    </div>
  )
}
