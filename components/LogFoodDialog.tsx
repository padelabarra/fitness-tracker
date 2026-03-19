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
import { logFood } from '@/app/actions/nutrition'
import type { MealType } from '@/lib/supabase'

export function LogFoodDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = e.currentTarget
    const data = new FormData(form)

    startTransition(async () => {
      await logFood({
        meal_type: data.get('meal_type') as MealType,
        food_description: data.get('food_description') as string,
        calories_approx: data.get('calories') ? Number(data.get('calories')) : undefined,
        protein_g: data.get('protein') ? Number(data.get('protein')) : undefined,
      })
      setOpen(false)
      form.reset()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" className="gap-2" />}>
        + Log Food
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle>Log Food</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Meal type</Label>
            <Select name="meal_type" required>
              <SelectTrigger className="mt-1.5 bg-zinc-800 border-zinc-700">
                <SelectValue placeholder="Select meal type" />
              </SelectTrigger>
              <SelectContent className="bg-zinc-800 border-zinc-700">
                {(['breakfast', 'lunch', 'dinner', 'snack', 'supplement'] as const).map(t => (
                  <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Description</Label>
            <Input name="food_description" required placeholder="e.g. Chicken salad, 300g"
              className="mt-1.5 bg-zinc-800 border-zinc-700" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Calories (approx)</Label>
              <Input name="calories" type="number" min={0} placeholder="450"
                className="mt-1.5 bg-zinc-800 border-zinc-700" />
            </div>
            <div>
              <Label>Protein (g)</Label>
              <Input name="protein" type="number" min={0} step={0.1} placeholder="35"
                className="mt-1.5 bg-zinc-800 border-zinc-700" />
            </div>
          </div>
          <Button type="submit" disabled={isPending} className="w-full">
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
