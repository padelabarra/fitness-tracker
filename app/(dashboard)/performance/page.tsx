import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getLatestPerformance, getPerformanceTrend, getDailySnapshots } from '@/lib/garmin-queries'
import { VO2MaxChart } from '@/components/VO2MaxChart'
import { HRVWidget } from '@/components/HRVWidget'
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
    getDailySnapshots(session.user.id, 14),
  ])

  return (
    <div className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">Performance</h1>

      <div className="grid gap-4 md:grid-cols-2">
        <TrainingReadinessBadge score={latest?.training_readiness ?? null} />
        <TrainingLoadBar load={latest?.training_load_7d ?? null} />
      </div>

      <VO2MaxChart data={trend} />

      <div className="grid gap-4 md:grid-cols-2">
        <HRVWidget snapshots={snapshots} />
        <RacePredictionsTable performance={latest} />
      </div>
    </div>
  )
}
