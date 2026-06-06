'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { NutritionEntry, GarminDailySnapshot, GarminPerformance } from '@/lib/supabase'

interface Props {
  nutrition: NutritionEntry[]
  snapshots: GarminDailySnapshot[]
  performance: GarminPerformance[]
}

interface DayData {
  date: string
  protein: number | null
  calories: number | null
  bodyBattery: number | null
  nextDayReadiness: number | null
}

function buildDayData(
  nutrition: NutritionEntry[],
  snapshots: GarminDailySnapshot[],
  performance: GarminPerformance[],
): DayData[] {
  // Build a map of date → aggregated nutrition
  const nutMap = new Map<string, { protein: number; calories: number }>()
  for (const entry of nutrition) {
    const existing = nutMap.get(entry.date) ?? { protein: 0, calories: 0 }
    nutMap.set(entry.date, {
      protein: existing.protein + (entry.protein_g ?? 0),
      calories: existing.calories + (entry.calories_approx ?? 0),
    })
  }

  // Build a map of date → snapshot
  const snapMap = new Map<string, GarminDailySnapshot>()
  for (const snap of snapshots) {
    snapMap.set(snap.date, snap)
  }

  // Build a map of date → performance (for training_readiness)
  const perfMap = new Map<string, GarminPerformance>()
  for (const perf of performance) {
    perfMap.set(perf.date, perf)
  }

  // Get all unique dates, sorted
  const allDates = Array.from(
    new Set([...nutMap.keys(), ...snapMap.keys(), ...perfMap.keys()])
  ).sort()

  return allDates.map((date, i) => {
    const nut = nutMap.get(date) ?? null
    const snap = snapMap.get(date) ?? null
    // "next-day readiness" = readiness from performance of date+1
    const nextDate = allDates[i + 1]
    const nextPerf = nextDate ? (perfMap.get(nextDate) ?? null) : null

    return {
      date: date.slice(5), // MM-DD
      protein: nut ? Math.round(nut.protein) : null,
      calories: nut ? Math.round(nut.calories) : null,
      bodyBattery: snap?.body_battery_end ?? null,
      nextDayReadiness: nextPerf?.training_readiness ?? null,
    }
  })
}

export function InsightsChart({ nutrition, snapshots, performance }: Props) {
  const data = buildDayData(nutrition, snapshots, performance)
  const hasReadiness = data.some(d => d.nextDayReadiness !== null)

  return (
    <div className="space-y-6">
      {hasReadiness && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Protein vs Next-Day Readiness</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
                <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis yAxisId="left" tick={{ fill: '#71717a', fontSize: 11 }} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
                />
                <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
                <Bar yAxisId="left" dataKey="protein" name="Protein (g)" fill="#6366f1" opacity={0.8} radius={[3, 3, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="nextDayReadiness" name="Next-day readiness" stroke="#f59e0b" strokeWidth={2} dot={false} connectNulls />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calories vs Body Battery</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={200}>
            <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
              <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fill: '#71717a', fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip
                contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
              />
              <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
              <Bar yAxisId="left" dataKey="calories" name="Calories" fill="#10b981" opacity={0.8} radius={[3, 3, 0, 0]} />
              <Line yAxisId="right" type="monotone" dataKey="bodyBattery" name="Body battery" stroke="#f43f5e" strokeWidth={2} dot={false} connectNulls />
            </ComposedChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
