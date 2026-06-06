'use client'

import { LineChart, Line, ResponsiveContainer } from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import type { GarminDailySnapshot } from '@/lib/supabase'

interface Props { snapshots: GarminDailySnapshot[] }

export function HRVWidget({ snapshots }: Props) {
  const withHrv = snapshots.filter(s => s.hrv_last_night !== null)

  const thisWeek = withHrv.slice(-7).map(s => s.hrv_last_night as number)
  const priorWeek = withHrv.slice(-14, -7).map(s => s.hrv_last_night as number)

  const avg = (arr: number[]) =>
    arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null

  const currentAvg = avg(thisWeek)
  const priorAvg = avg(priorWeek)
  const delta = currentAvg !== null && priorAvg !== null ? currentAvg - priorAvg : null

  const sparkData = withHrv.slice(-14).map(s => ({ v: s.hrv_last_night }))

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">HRV</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {currentAvg === null ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            <div className="flex items-end gap-2">
              <span className="text-3xl font-bold">{currentAvg}</span>
              <span className="text-sm text-muted-foreground mb-1">ms this week</span>
              {delta !== null && (
                <span className={`text-sm mb-1 ${delta > 0 ? 'text-green-500' : 'text-red-500'}`}>
                  {delta > 0 ? '+' : ''}{delta} vs prior week
                </span>
              )}
            </div>
            <ResponsiveContainer width="100%" height={50}>
              <LineChart data={sparkData}>
                <Line type="monotone" dataKey="v" stroke="#6366f1" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </>
        )}
      </CardContent>
    </Card>
  )
}
