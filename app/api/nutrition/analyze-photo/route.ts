import { NextRequest, NextResponse } from 'next/server'
import type { MealType } from '@/lib/supabase'

const VALID_MEAL_TYPES: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack', 'supplement']

const PROMPT = `You are a nutrition expert. Analyze this meal photo and estimate its nutritional content.

Return ONLY valid JSON with these exact fields:
{
  "food_description": "concise description of what you see",
  "meal_type": "snack",
  "calories_approx": 450,
  "protein_g": 35
}

Rules:
- meal_type must be one of: breakfast, lunch, dinner, snack, supplement
- Infer meal_type from the food type (e.g. eggs → breakfast, salad → lunch)
- calories_approx must be an integer estimate
- protein_g must be a number estimate
- Always provide estimates even if uncertain — use your best judgment
- Return ONLY the JSON object, no other text`

export async function POST(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 503 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 })
  }

  const imageFile = formData.get('image')
  if (!(imageFile instanceof Blob)) {
    return NextResponse.json({ error: 'image field is required' }, { status: 400 })
  }

  if (!imageFile.type.startsWith('image/')) {
    return NextResponse.json({ error: 'file must be an image' }, { status: 400 })
  }

  const imageBuffer = Buffer.from(await imageFile.arrayBuffer())
  const base64Image = imageBuffer.toString('base64')

  // Call Gemini REST API directly to control thinkingBudget properly
  const body = {
    contents: [{
      parts: [
        { text: PROMPT },
        { inlineData: { mimeType: imageFile.type, data: base64Image } },
      ],
    }],
    generationConfig: {
      responseMimeType: 'application/json',
      thinkingConfig: { thinkingBudget: 0 },
    },
  }

  let raw: string
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      }
    )

    if (!res.ok) {
      const err = await res.text()
      console.error('Gemini API error:', res.status, err)
      return NextResponse.json({ error: `Gemini error: ${res.status}` }, { status: 502 })
    }

    const json = await res.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>
    }
    raw = json.candidates[0].content.parts[0].text
    console.log('Gemini raw response:', raw)
  } catch (err) {
    console.error('Gemini fetch error:', err)
    return NextResponse.json({ error: 'Failed to analyze image' }, { status: 502 })
  }

  let parsed: {
    food_description?: unknown
    meal_type?: unknown
    calories_approx?: unknown
    protein_g?: unknown
  }
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    console.error('Failed to parse Gemini response:', JSON.stringify(raw))
    return NextResponse.json({ error: 'Failed to parse nutrition estimate' }, { status: 502 })
  }

  const meal_type = VALID_MEAL_TYPES.includes(parsed.meal_type as MealType)
    ? (parsed.meal_type as MealType)
    : 'snack'

  return NextResponse.json({
    food_description: typeof parsed.food_description === 'string' ? parsed.food_description : '',
    meal_type,
    calories_approx: typeof parsed.calories_approx === 'number' ? Math.round(parsed.calories_approx) : null,
    protein_g: typeof parsed.protein_g === 'number' ? parsed.protein_g : null,
  })
}
