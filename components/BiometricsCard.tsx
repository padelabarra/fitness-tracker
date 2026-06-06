'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { RefreshCw, Heart, Footprints, Battery, Moon } from 'lucide-react'
import type { GarminDailySnapshot } from '@/lib/supabase'

interface BiometricsCardProps {
  snapshot: GarminDailySnapshot | null
  snapshotDate: string  // ISO date string of the snapshot (may be yesterday)
}

function ProgressBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div
        className={`h-2 rounded-full ${color}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function MetricRow({ icon, label, value, unit }: { icon: React.ReactNode; label: string; value: React.ReactNode; unit?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium">
          {value}
          {unit && <span className="text-muted-foreground text-xs ml-1">{unit}</span>}
        </p>
      </div>
    </div>
  )
}

export function BiometricsCard({ snapshot, snapshotDate }: BiometricsCardProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncTriggered, setSyncTriggered] = useState(false)

  const today = new Date().toISOString().split('T')[0]
  const isYesterday = snapshot && snapshotDate !== today

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/garmin/trigger-sync', { method: 'POST' })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        setSyncError(data.error ?? 'Sync trigger failed — try again')
      } else {
        setSyncTriggered(true)
      }
    } catch {
      setSyncError('Sync trigger failed — try again')
    } finally {
      setSyncing(false)
    }
  }

  const steps = snapshot?.steps ?? null
  const restingHr = snapshot?.resting_hr ?? null
  const sleepScore = snapshot?.sleep_score ?? null
  const sleepMin = snapshot?.sleep_duration_min ?? null
  const bodyBattery = snapshot?.body_battery_end ?? null

  const sleepLabel = sleepMin != null
    ? `${Math.floor(sleepMin / 60)}h ${sleepMin % 60}min`
    : '—'

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-base">Biometrics</CardTitle>
        <div className="flex items-center gap-2">
          {isYesterday && (
            <Badge variant="secondary" className="text-xs">Yesterday</Badge>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSync}
            disabled={syncing || syncTriggered}
            className="h-7 px-2"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            <span className="ml-1 text-xs">
              {syncTriggered ? 'Queued' : syncing ? 'Syncing…' : 'Sync'}
            </span>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {syncError && (
          <p className="text-xs text-destructive">{syncError}</p>
        )}
        {syncTriggered && (
          <p className="text-xs text-muted-foreground">Sync queued — data will update in ~2 minutes.</p>
        )}

        {!snapshot && (
          <p className="text-sm text-muted-foreground">No data yet — sync pending</p>
        )}

        {snapshot && (
          <>
            {steps != null && (
              <div className="space-y-1">
                <MetricRow
                  icon={<Footprints className="h-4 w-4" />}
                  label="Steps"
                  value={steps.toLocaleString()}
                  unit={`/ 10,000 (${Math.round((steps / 10000) * 100)}%)`}
                />
                <ProgressBar value={steps} max={10000} color="bg-blue-500" />
              </div>
            )}

            {restingHr != null && (
              <MetricRow
                icon={<Heart className="h-4 w-4" />}
                label="Resting HR"
                value={restingHr}
                unit="bpm"
              />
            )}

            {bodyBattery != null && (
              <div className="space-y-1">
                <MetricRow
                  icon={<Battery className="h-4 w-4" />}
                  label="Body Battery"
                  value={bodyBattery}
                  unit="/ 100"
                />
                <ProgressBar
                  value={bodyBattery}
                  max={100}
                  color={bodyBattery >= 60 ? 'bg-green-500' : bodyBattery >= 30 ? 'bg-yellow-500' : 'bg-red-500'}
                />
              </div>
            )}

            {(sleepScore != null || sleepMin != null) && (
              <MetricRow
                icon={<Moon className="h-4 w-4" />}
                label="Sleep"
                value={sleepScore != null ? `${sleepScore} · ${sleepLabel}` : sleepLabel}
              />
            )}

            {steps == null && restingHr == null && bodyBattery == null && sleepScore == null && (
              <p className="text-sm text-muted-foreground">All fields empty — check sync logs</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
