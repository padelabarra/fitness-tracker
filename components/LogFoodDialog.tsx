'use client'

import { useState, useTransition, useRef } from 'react'
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
import type { MealType, NutritionSource } from '@/lib/supabase'

interface FormState {
  meal_type: MealType | ''
  food_description: string
  calories: string
  protein: string
}

const EMPTY_FORM: FormState = {
  meal_type: '',
  food_description: '',
  calories: '',
  protein: '',
}

export function LogFoodDialog() {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()
  const [phase, setPhase] = useState<'idle' | 'compressing' | 'uploading' | 'analyzing'>('idle')
  const [analyzeError, setAnalyzeError] = useState<string | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [source, setSource] = useState<NutritionSource>('manual')
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleField(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function compressImage(file: File): Promise<File> {
    const MAX_PX = 800
    const QUALITY = 0.7
    return new Promise((resolve, reject) => {
      const img = new Image()
      const url = URL.createObjectURL(file)
      img.onload = () => {
        URL.revokeObjectURL(url)
        const { width, height } = img
        const scale = Math.min(1, MAX_PX / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(width * scale)
        canvas.height = Math.round(height * scale)
        const ctx = canvas.getContext('2d')
        if (!ctx) { resolve(file); return }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        canvas.toBlob(blob => {
          if (!blob) { resolve(file); return }
          resolve(new File([blob], file.name, { type: 'image/jpeg' }))
        }, 'image/jpeg', QUALITY)
      }
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Failed to load image')) }
      img.src = url
    })
  }

  async function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setPreview(URL.createObjectURL(file))
    setPhase('compressing')
    setAnalyzeError(null)

    let compressed: File
    try {
      compressed = await compressImage(file)
    } catch {
      compressed = file
    }

    setPhase('uploading')

    try {
      const fd = new FormData()
      fd.append('image', compressed)

      setPhase('analyzing')
      const res = await fetch('/api/nutrition/analyze-photo', { method: 'POST', body: fd })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `HTTP ${res.status}`)
      }

      const data = await res.json() as {
        food_description: string
        meal_type: MealType
        calories_approx: number | null
        protein_g: number | null
      }

      setForm({
        meal_type: data.meal_type,
        food_description: data.food_description,
        calories: data.calories_approx != null ? String(data.calories_approx) : '',
        protein: data.protein_g != null ? String(data.protein_g) : '',
      })
      setSource('photo')
    } catch (err) {
      console.error('Photo analysis failed:', err)
      setAnalyzeError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setPhase('idle')
    }
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!form.meal_type) return

    startTransition(async () => {
      await logFood({
        meal_type: form.meal_type as MealType,
        food_description: form.food_description,
        calories_approx: form.calories ? Number(form.calories) : undefined,
        protein_g: form.protein ? Number(form.protein) : undefined,
        source,
      })
      setOpen(false)
      setForm(EMPTY_FORM)
      setPreview(null)
      setSource('manual')
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleOpenChange(val: boolean) {
    setOpen(val)
    if (!val) {
      setForm(EMPTY_FORM)
      setPreview(null)
      setSource('manual')
      setPhase('idle')
      setAnalyzeError(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={<Button size="sm" className="gap-2" />}>
        + Log Food
      </DialogTrigger>
      <DialogContent className="bg-zinc-900 border-zinc-800">
        <DialogHeader>
          <DialogTitle>Log Food</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Photo analyzer */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handlePhotoChange}
            />
            <Button
              type="button"
              variant="outline"
              className="w-full border-zinc-700 bg-zinc-800 hover:bg-zinc-700 gap-2"
              onClick={() => fileInputRef.current?.click()}
              disabled={phase !== 'idle'}
            >
              {phase === 'idle' && '📷 Analyze Photo'}
              {phase === 'compressing' && <><span className="animate-spin">⟳</span> Compressing…</>}
              {phase === 'uploading' && <><span className="animate-spin">⟳</span> Uploading…</>}
              {phase === 'analyzing' && <><span className="animate-spin">⟳</span> Analyzing…</>}
            </Button>
            {preview && (
              <div className="mt-2 flex justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={preview}
                  alt="Meal preview"
                  className="h-28 rounded-md object-cover border border-zinc-700"
                />
              </div>
            )}
            {analyzeError && (
              <p className="mt-1.5 text-xs text-red-400">⚠ {analyzeError}</p>
            )}
          </div>

          <div>
            <Label>Meal type</Label>
            <Select
              name="meal_type"
              required
              value={form.meal_type}
              onValueChange={v => handleField('meal_type', v ?? '')}
            >
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
            <Input
              name="food_description"
              required
              placeholder="e.g. Chicken salad, 300g"
              className="mt-1.5 bg-zinc-800 border-zinc-700"
              value={form.food_description}
              onChange={e => handleField('food_description', e.target.value)}
            />
          </div>
          {source === 'photo' ? (
            <div className="rounded-md bg-zinc-800 border border-zinc-700 px-3 py-2 text-sm text-zinc-300 flex gap-4">
              <span>~{form.calories} kcal</span>
              <span>{form.protein}g protein</span>
              <button type="button" className="ml-auto text-xs text-zinc-500 hover:text-zinc-300 underline"
                onClick={() => setSource('manual')}>edit</button>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Calories (approx)</Label>
                <Input
                  name="calories"
                  type="number"
                  min={0}
                  placeholder="450"
                  className="mt-1.5 bg-zinc-800 border-zinc-700"
                  value={form.calories}
                  onChange={e => handleField('calories', e.target.value)}
                />
              </div>
              <div>
                <Label>Protein (g)</Label>
                <Input
                  name="protein"
                  type="number"
                  min={0}
                  step={0.1}
                  placeholder="35"
                  className="mt-1.5 bg-zinc-800 border-zinc-700"
                  value={form.protein}
                  onChange={e => handleField('protein', e.target.value)}
                />
              </div>
            </div>
          )}
          <Button type="submit" disabled={isPending || phase !== 'idle'} className="w-full">
            {isPending ? 'Saving…' : 'Save'}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
