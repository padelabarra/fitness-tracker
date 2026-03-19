'use client'

import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface WeekData {
  weekStart: string
  actualKm: number
  targetKm: number | null
  weekNumber: number | null
}

export function MarathonChart({ data }: { data: WeekData[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="weekStart" tick={{ fill: '#71717a', fontSize: 11 }}
          tickFormatter={v => (v as string).slice(5)} />
        <YAxis tick={{ fill: '#71717a', fontSize: 12 }} unit=" km" />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
          formatter={(val: unknown, name: unknown) => [`${val} km`, name as string]}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
        <Area type="monotone" dataKey="actualKm" stroke="#22c55e" fill="url(#actualGrad)"
          strokeWidth={2} name="Actual km" />
        <Line type="monotone" dataKey="targetKm" stroke="#facc15" strokeWidth={2}
          strokeDasharray="5 5" dot={false} name="Target km" connectNulls={false} />
      </AreaChart>
    </ResponsiveContainer>
  )
}
