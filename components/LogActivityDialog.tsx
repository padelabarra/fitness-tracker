'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { logActivity } from '@/app/actions/workouts'
import type { ActivityType } from '@/lib/supabase'

interface FormState {
  date: string
  activity_type: ActivityType | ''
  duration_min: string
  distance_km: string
  calories: string
  notes: string
}

const ACTIVITY_LABELS: Record<ActivityType, string> = {
  running: 'Running',
  rowing: 'Rowing',
  gym_upper: 'Gym (Upper)',
  gym_lower: 'Gym (Lower)',
  hiking: 'Hiking',
  weights: 'Weights',
  cycling: 'Cycling',
  swimming: 'Swimming',
  tennis: 'Tennis',
  soccer: 'Soccer',
  boxing: 'Boxing',
  basketball: 'Basketball',
  volleyball: 'Volleyball',
  yoga: 'Yoga',
  pilates: 'Pilates',
  crossfit: 'CrossFit',
  climbing: 'Climbing',
  other: 'Other',
}

const ACTIVITY_TYPES = Object.keys(ACTIVITY_LABELS) as ActivityType[]

function todayISO(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const EMPTY_FORM: FormState = {
  date: todayISO(),
  activity_type: '',
  duration_min: '',
  distance_km: '',
  calories: '',
  notes: '',
}

export function LogActivityDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, date: todayISO() })

  function handleField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.activity_type || !form.duration_min) return

    startTransition(async () => {
      await logActivity({
        date: form.date,
        activity_type: form.activity_type as ActivityType,
        duration_min: Number(form.duration_min),
        distance_km: form.distance_km ? Number(form.distance_km) : undefined,
        calories: form.calories ? Number(form.calories) : undefined,
        notes: form.notes || undefined,
      })
      setOpen(false)
      setForm({ ...EMPTY_FORM, date: todayISO() })
    })
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) setForm({ ...EMPTY_FORM, date: todayISO() })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" className="gap-2" />}>
        + Log Activity
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle>Log Activity</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                required
                className="mt-1.5 bg-zinc-800 border-zinc-700"
                value={form.date}
                onChange={e => handleField('date', e.target.value)}
              />
            </div>
            <div>
              <Label>Duration (min)</Label>
              <Input
                type="number"
                min={1}
                required
                placeholder="45"
                className="mt-1.5 bg-zinc-800 border-zinc-700"
                value={form.duration_min}
                onChange={e => handleField('duration_min', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Activity type</Label>
            <Select
              required
              value={form.activity_type}
              onValueChange={v => handleField('activity_type', v ?? '')}
            >
              <SelectTrigger className="mt-1.5 bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Select activity" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700 max-h-64">
                {ACTIVITY_TYPES.map(t => (
                  <SelectItem key={t} value={t}>{ACTIVITY_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Distance (km)</Label>
              <Input
                type="number"
                min={0}
                step={0.1}
                placeholder="5.0"
                className="mt-1.5 bg-zinc-800 border-zinc-700"
                value={form.distance_km}
                onChange={e => handleField('distance_km', e.target.value)}
              />
            </div>
            <div>
              <Label>Calories burned</Label>
              <Input
                type="number"
                min={0}
                placeholder="400"
                className="mt-1.5 bg-zinc-800 border-zinc-700"
                value={form.calories}
                onChange={e => handleField('calories', e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Input
              placeholder="Optional notes"
              className="mt-1.5 bg-zinc-800 border-zinc-700"
              value={form.notes}
              onChange={e => handleField('notes', e.target.value)}
            />
          </div>

          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
