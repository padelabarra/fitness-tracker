'use client'

import {
  AreaChart, Area,
  BarChart, Bar,
  LineChart, Line,
  XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export type ChartType = 'area' | 'bar' | 'line'

export interface TrendPoint {
  date: string
  value: number | null
}

interface Props {
  title: string
  unit?: string
  data: TrendPoint[]
  color?: string
  type?: ChartType
  domain?: [number | 'auto', number | 'auto']
  formatter?: (v: number) => string
}

export function TrendChart({
  title,
  unit,
  data,
  color = '#6366f1',
  type = 'area',
  domain = ['auto', 'auto'],
  formatter,
}: Props) {
  const chartData = data
    .filter(d => d.value !== null)
    .map(d => ({ date: d.date.slice(5), value: d.value }))

  const tooltipFormatter = (v: unknown) => {
    const num = typeof v === 'number' ? v : null
    if (num === null) return ['—', title]
    const label = formatter ? formatter(num) : `${num}${unit ? ` ${unit}` : ''}`
    return [label, title]
  }

  const label = unit ? `${title} (${unit})` : title

  const axisProps = { tick: { fontSize: 11 } }
  const gridProps = { strokeDasharray: '3 3', stroke: '#f0f0f0' }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{label}</CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-[180px] gap-1">
            <p className="text-sm text-muted-foreground">No data yet</p>
            <p className="text-xs text-muted-foreground">Will populate as your watch syncs</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            {type === 'bar' ? (
              <BarChart data={chartData}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis domain={domain} {...axisProps} />
                <Tooltip formatter={tooltipFormatter} />
                <Bar dataKey="value" fill={color} radius={[2, 2, 0, 0]} />
              </BarChart>
            ) : type === 'line' ? (
              <LineChart data={chartData}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis domain={domain} {...axisProps} />
                <Tooltip formatter={tooltipFormatter} />
                <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2} dot={false} />
              </LineChart>
            ) : (
              <AreaChart data={chartData}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="date" {...axisProps} />
                <YAxis domain={domain} {...axisProps} />
                <Tooltip formatter={tooltipFormatter} />
                <Area type="monotone" dataKey="value" stroke={color} fill={`${color}20`} strokeWidth={2} dot={false} />
              </AreaChart>
            )}
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  )
}
