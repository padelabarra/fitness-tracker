import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getNutritionForRange, aggregateDailyNutrition } from '@/lib/queries'
import { addDays, toISODate, CALORIE_TARGET, PROTEIN_TARGET } from '@/lib/utils'
import { NutritionChart } from '@/components/NutritionChart'
import { LogFoodDialog } from '@/components/LogFoodDialogDynamic'

const MEAL_ICONS: Record<string, string> = {
  breakfast: '🌅', lunch: '☀️', dinner: '🌙', snack: '🍎', supplement: '💊'
}

export default async function NutritionPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')
  const userId = session.user.id

  const today = toISODate(new Date())
  const fourteenDaysAgo = addDays(new Date(), -13)

  const entries = await getNutritionForRange(fourteenDaysAgo, new Date(), userId)
  const todayEntries = entries.filter(e => e.date === today)
  const dailySummary = aggregateDailyNutrition(entries)

  const todayCalories = todayEntries.reduce((s, e) => s + (e.calories_approx ?? 0), 0)
  const todayProtein = todayEntries.reduce((s, e) => s + Number(e.protein_g ?? 0), 0)

  const caloriePct = Math.min(100, Math.round((todayCalories / CALORIE_TARGET) * 100))
  const proteinPct = Math.min(100, Math.round((todayProtein / PROTEIN_TARGET) * 100))

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-semibold">Nutrition</h1>
        <LogFoodDialog />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Today</h2>
        <div className="space-y-3">
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Calories</span>
              <span className="tabular-nums">{todayCalories} / {CALORIE_TARGET} kcal</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-orange-500 rounded-full" style={{ width: `${caloriePct}%` }} />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-sm mb-1">
              <span>Protein</span>
              <span className="tabular-nums">{todayProtein.toFixed(0)} / {PROTEIN_TARGET}g</span>
            </div>
            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
              <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${proteinPct}%` }} />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">Last 14 days</h2>
        <NutritionChart data={dailySummary} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-3">Today&apos;s meals</h2>
        {todayEntries.length === 0 ? (
          <p className="text-sm text-zinc-600 text-center py-4">No entries yet</p>
        ) : (
          <div className="space-y-2">
            {todayEntries.map(entry => (
              <div key={entry.id} className="flex items-center gap-3 py-2 border-b border-zinc-800/50">
                <span className="text-lg">{MEAL_ICONS[entry.meal_type] ?? '🍽️'}</span>
                <div className="flex-1">
                  <p className="text-sm">{entry.food_description}</p>
                  <p className="text-xs text-zinc-500 capitalize">{entry.meal_type}</p>
                </div>
                <div className="text-right text-xs text-zinc-400">
                  {entry.calories_approx && <p>{entry.calories_approx} kcal</p>}
                  {entry.protein_g && <p>{Number(entry.protein_g).toFixed(0)}g prot</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
