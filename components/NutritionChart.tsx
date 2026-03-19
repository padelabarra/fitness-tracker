'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend
} from 'recharts'

interface DayData {
  date: string
  calories: number
  protein: number
}

export function NutritionChart({ data }: { data: DayData[] }) {
  return (
    <ResponsiveContainer width="100%" height={240}>
      <ComposedChart data={data} margin={{ top: 8, right: 40, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
        <XAxis dataKey="date" tick={{ fill: '#71717a', fontSize: 11 }} tickFormatter={v => (v as string).slice(5)} />
        <YAxis yAxisId="cal" tick={{ fill: '#71717a', fontSize: 12 }} />
        <YAxis yAxisId="prot" orientation="right" tick={{ fill: '#71717a', fontSize: 12 }} />
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
        <Bar yAxisId="cal" dataKey="calories" fill="#f97316" name="Calories" radius={[3, 3, 0, 0]} />
        <Line yAxisId="prot" type="monotone" dataKey="protein" stroke="#22d3ee" strokeWidth={2} dot={false} name="Protein (g)" />
      </ComposedChart>
    </ResponsiveContainer>
  )
}
