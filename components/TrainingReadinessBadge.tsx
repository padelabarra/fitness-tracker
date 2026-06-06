import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Props { score: number | null }

function getColor(score: number): string {
  if (score >= 70) return 'bg-green-500'
  if (score >= 40) return 'bg-yellow-500'
  return 'bg-red-500'
}

function getLabel(score: number): string {
  if (score >= 70) return 'Ready to train'
  if (score >= 40) return 'Moderate readiness'
  return 'Rest recommended'
}

export function TrainingReadinessBadge({ score }: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Training Readiness</CardTitle></CardHeader>
      <CardContent className="flex items-center gap-4">
        {score === null ? (
          <p className="text-sm text-muted-foreground">No data available</p>
        ) : (
          <>
            <div className={`flex items-center justify-center rounded-full w-16 h-16 text-white font-bold text-xl ${getColor(score)}`}>
              {score}
            </div>
            <p className="text-sm text-muted-foreground">{getLabel(score)}</p>
          </>
        )}
      </CardContent>
    </Card>
  )
}
