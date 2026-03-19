'use client'

import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'

interface ActivityBreakdown {
  name: string
  value: number
}

const COLORS = ['#22c55e', '#22d3ee', '#f97316', '#a78bfa', '#71717a']

export function ActivityDonut({ data }: { data: ActivityBreakdown[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%"
          innerRadius={50} outerRadius={80} paddingAngle={2}>
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{ background: '#18181b', border: '1px solid #27272a', borderRadius: 8 }}
        />
        <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
      </PieChart>
    </ResponsiveContainer>
  )
}
