import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props { load: number | null }

function getLoadLabel(load: number): { label: string; color: string } {
  if (load < 100) return { label: 'Very Light', color: 'bg-blue-400' }
  if (load < 200) return { label: 'Light', color: 'bg-green-400' }
  if (load < 300) return { label: 'Moderate', color: 'bg-yellow-400' }
  if (load < 400) return { label: 'High', color: 'bg-orange-400' }
  return { label: 'Very High', color: 'bg-red-500' }
}

export function TrainingLoadBar({ load }: Props) {
  const maxLoad = 500
  const pct = load !== null ? Math.min(100, Math.round((load / maxLoad) * 100)) : 0
  const meta = load !== null ? getLoadLabel(load) : null

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">7-Day Training Load</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {load === null ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            <div className="flex justify-between text-sm">
              <span className="font-medium">{Math.round(load)}</span>
              <span className="text-muted-foreground">{meta?.label}</span>
            </div>
            <div className="w-full bg-muted rounded-full h-3">
              <div
                className={`h-3 rounded-full ${meta?.color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
