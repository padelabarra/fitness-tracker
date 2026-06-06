'use client'

import { useState } from 'react'
import type { Workout } from '@/lib/supabase'

interface Props { activities: Workout[] }

type Filter = 'all' | 'run' | 'cycling' | 'strength' | 'other'

const ACTIVITY_MAP: Record<string, string> = {
  running: '🏃 Run',
  cycling: '🚴 Cycling',
  rowing: '🚣 Rowing',
  swimming: '🏊 Swimming',
  gym_upper: '💪 Strength',
  gym_lower: '💪 Strength',
  weights: '💪 Strength',
  crossfit: '💪 Strength',
  hiking: '🥾 Hiking',
  tennis: '🎾 Tennis',
  soccer: '⚽ Soccer',
  basketball: '🏀 Basketball',
  volleyball: '🏐 Volleyball',
  boxing: '🥊 Boxing',
  yoga: '🧘 Yoga',
  pilates: '🧘 Pilates',
  climbing: '🧗 Climbing',
  other: '🏋️ Other',
}

const STRENGTH_TYPES = new Set(['gym_upper', 'gym_lower', 'weights', 'crossfit'])
const RUN_CYCLING_STRENGTH = ['running', 'cycling', 'gym_upper', 'gym_lower', 'weights', 'crossfit']

const FILTER_TYPES: Record<Filter, (a: Workout) => boolean> = {
  all: () => true,
  run: a => a.activity_type === 'running',
  cycling: a => a.activity_type === 'cycling',
  strength: a => STRENGTH_TYPES.has(a.activity_type),
  other: a => !RUN_CYCLING_STRENGTH.includes(a.activity_type),
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'run', label: 'Run' },
  { key: 'cycling', label: 'Cycling' },
  { key: 'strength', label: 'Strength' },
  { key: 'other', label: 'Other' },
]

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function getActivityEmoji(activityType: string): string {
  const entry = ACTIVITY_MAP[activityType] ?? '🏋️ Other'
  return entry.split(' ')[0]
}

function getActivityLabel(activityType: string): string {
  const entry = ACTIVITY_MAP[activityType]
  if (!entry) return 'Other'
  const parts = entry.split(' ')
  return parts.slice(1).join(' ')
}

export function ActivityFeed({ activities }: Props) {
  const [filter, setFilter] = useState<Filter>('all')

  const filtered = activities.filter(FILTER_TYPES[filter])

  return (
    <div className="space-y-4">
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No activities found.</p>
      )}

      <div className="divide-y rounded-xl border border-zinc-800 bg-zinc-900 px-4">
        {filtered.map(activity => (
          <div key={activity.id} className="py-3 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-lg flex-shrink-0">
                {getActivityEmoji(activity.activity_type)}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">
                  {getActivityLabel(activity.activity_type)}
                </p>
                <p className="text-xs text-muted-foreground">{formatDate(activity.date)}</p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-right flex-shrink-0">
              {activity.distance_km != null && (
                <div>
                  <p className="text-sm font-medium">{Number(activity.distance_km).toFixed(1)} km</p>
                </div>
              )}
              <div>
                <p className="text-sm font-medium">{activity.duration_min} min</p>
              </div>
              {activity.avg_hr != null && (
                <div className="hidden sm:block">
                  <p className="text-sm text-muted-foreground">{activity.avg_hr} bpm</p>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
