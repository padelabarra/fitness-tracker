'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GarminPerformance } from '@/lib/supabase'

interface Props { data: GarminPerformance[] }

export function VO2MaxChart({ data }: Props) {
  const chartData = data
    .filter(d => d.vo2max !== null)
    .map(d => ({
      date: d.date.slice(5), // MM-DD
      vo2max: d.vo2max,
    }))

  if (chartData.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">VO2 Max</CardTitle></CardHeader>
        <CardContent><p className="text-sm text-muted-foreground">No data available</p></CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">VO2 Max (ml/kg/min)</CardTitle></CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={180}>
          <AreaChart data={chartData}>
            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
            <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} />
            <Tooltip formatter={(v) => [typeof v === 'number' ? v.toFixed(1) : v, 'VO2 Max']} />
            <Area type="monotone" dataKey="vo2max" stroke="#6366f1" fill="#6366f120" strokeWidth={2} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
