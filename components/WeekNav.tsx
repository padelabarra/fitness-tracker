'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Calendar } from '@/components/ui/calendar'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { startOfWeek, addDays, toISODate } from '@/lib/utils'

interface WeekNavProps {
  monday: string        // YYYY-MM-DD
  weekDates: string     // e.g. "Mar 31 – Apr 6"
  weekNumber: number | null
}

const TRAINING_START_STR = '2026-03-16'

export function WeekNav({ monday, weekDates, weekNumber }: WeekNavProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const currentMonday = toISODate(startOfWeek(new Date()))
  const isCurrentWeek = monday >= currentMonday
  const isFirstWeek = monday <= TRAINING_START_STR

  function navigate(deltaWeeks: number) {
    const base = new Date(monday + 'T00:00:00')
    const next = addDays(base, deltaWeeks * 7)
    const nextMonday = startOfWeek(next)
    router.push(`?week=${toISODate(nextMonday)}`)
  }

  function handleCalendarSelect(date: Date | undefined) {
    if (!date) return
    const mon = startOfWeek(date)
    router.push(`?week=${toISODate(mon)}`)
    setOpen(false)
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => navigate(-1)}
        disabled={isFirstWeek}
        className="px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
        aria-label="Previous week"
      >
        ‹
      </button>

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger
          className="text-sm text-zinc-300 hover:text-white cursor-pointer select-none min-w-[160px] text-center"
        >
          {weekDates}{weekNumber ? ` · Wk ${weekNumber}` : ''}
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 bg-zinc-900 border-zinc-800" side="bottom" align="center">
          <Calendar
            mode="single"
            selected={new Date(monday + 'T00:00:00')}
            onSelect={handleCalendarSelect}
            disabled={(date) => {
              const d = toISODate(date)
              return d < TRAINING_START_STR || d > currentMonday
            }}
            className="bg-zinc-900 text-zinc-100"
          />
        </PopoverContent>
      </Popover>

      <button
        onClick={() => navigate(1)}
        disabled={isCurrentWeek}
        className="px-2 py-1 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed text-lg leading-none"
        aria-label="Next week"
      >
        ›
      </button>
    </div>
  )
}
