import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatSecondsAsTime, formatPaceFromSeconds } from '@/lib/utils'
import type { GarminPerformance } from '@/lib/supabase'

interface Props { performance: GarminPerformance | null }

const RACES = [
  { label: '5K', key: 'race_pred_5k_sec' as const, km: 5 },
  { label: 'Half Marathon', key: 'race_pred_half_sec' as const, km: 21.0975 },
  { label: 'Marathon', key: 'race_pred_marathon_sec' as const, km: 42.195 },
]

export function RacePredictionsTable({ performance }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Race Predictions</CardTitle></CardHeader>
      <CardContent>
        {!performance ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <div className="space-y-3">
            {RACES.map(race => {
              const secs = performance[race.key]
              return (
                <div key={race.label} className="flex items-center justify-between">
                  <span className="text-sm font-medium">{race.label}</span>
                  <div className="text-right">
                    <span className="text-sm font-semibold">{formatSecondsAsTime(secs)}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {formatPaceFromSeconds(secs, race.km)}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
