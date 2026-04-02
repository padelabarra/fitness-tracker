'use client'

function toLocalDateStr(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// Color thresholds based on total active minutes per day
function getDayColor(minutes: number): string {
  if (minutes === 0) return '#27272a'        // zinc-800
  if (minutes < 30)  return '#86efac'        // green-300
  if (minutes < 60)  return '#22c55e'        // green-500
  return '#15803d'                           // green-700
}

interface DayData {
  date: string   // ISO YYYY-MM-DD
  minutes: number
}

interface ConsistencyHeatmapProps {
  data: DayData[]
}

export function ConsistencyHeatmap({ data }: ConsistencyHeatmapProps) {
  const dataMap = new Map(data.map(d => [d.date, d.minutes]))

  // Build 52 weeks of dates ending today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  // Align to Monday of the current week
  const dayOfWeek = today.getDay()
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const lastMonday = new Date(today)
  lastMonday.setDate(today.getDate() + mondayOffset + 6) // end on sunday

  const startDate = new Date(lastMonday)
  startDate.setDate(lastMonday.getDate() - 52 * 7 + 1)

  const weeks: Date[][] = []
  const current = new Date(startDate)

  for (let w = 0; w < 52; w++) {
    const week: Date[] = []
    for (let d = 0; d < 7; d++) {
      week.push(new Date(current))
      current.setDate(current.getDate() + 1)
    }
    weeks.push(week)
  }

  const cellSize = 12
  const cellGap = 2
  const stride = cellSize + cellGap

  return (
    <svg
      width={52 * stride}
      height={7 * stride}
      style={{ display: 'block', maxWidth: '100%' }}
      suppressHydrationWarning
    >
      {weeks.map((week, wi) =>
        week.map((day, di) => {
          const dateStr = toLocalDateStr(day)
          const minutes = dataMap.get(dateStr) ?? 0
          const isFuture = day > today
          return (
            <rect
              key={dateStr}
              x={wi * stride}
              y={di * stride}
              width={cellSize}
              height={cellSize}
              rx={2}
              fill={isFuture ? '#18181b' : getDayColor(minutes)}
            >
              <title>{dateStr}: {minutes} min</title>
            </rect>
          )
        })
      )}
    </svg>
  )
}
