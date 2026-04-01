# Fitness Tracker Enhancements — Design Spec
**Date:** 2026-04-01  
**Status:** Approved

---

## Overview

Three independent features to add to the fitness tracker:

1. **Manual activity logging** — `LogActivityDialog` in the Consistency tab + weekly sports chart
2. **Week selector on Overview** — arrows + calendar picker to view any training week
3. **Faster photo analysis** — client-side image compression + staged progress feedback

---

## Feature 1: Manual Activity Logging

### Goal
Allow the user to manually log workouts directly from the app, in addition to Strava auto-sync.

### UI
- Add `"+ Log Activity"` button in the Consistency page header (same pattern as `"+ Log Food"` in Nutrition — `flex items-center justify-between` with the `h1` on the left, button on the right)
- Below the button (above the heatmap), add a **weekly sports chart** showing calories burned per day for the current week (bars only, no protein line — reuses `WeeklyChart` data shape with `protein: 0`)

### LogActivityDialog Component
New file: `components/LogActivityDialog.tsx`

Fields:
| Field | Type | Required | Notes |
|---|---|---|---|
| Date | date input | yes | defaults to today |
| Activity type | select | yes | see expanded list below |
| Duration | number (min) | yes | |
| Distance | number (km) | no | shown for all types, user fills if relevant |
| Calories burned | number | no | |
| Notes | text | no | |

**Expanded `ActivityType`** — update union in `lib/supabase.ts` and use as text in DB (no migration needed, column is already text):

```
running | rowing | gym_upper | gym_lower | hiking | weights |
cycling | swimming | tennis | soccer | boxing | basketball |
volleyball | yoga | pilates | crossfit | climbing | other
```

Display labels in dialog (e.g. `gym_upper` → "Gym (Upper)", `gym_lower` → "Gym (Lower)").

### Server Action
New file: `app/actions/workouts.ts`

```ts
export async function logActivity(input: LogActivityInput): Promise<Workout>
```

- Requires auth (same pattern as `logFood`)
- Inserts into `workouts` with `source: 'manual'`
- Calls `revalidatePath('/consistency')`

### Weekly Sports Chart Data
Fetch `getWorkoutsForRange(monday, sunday, userId)` in the Consistency page (current week) — this query already exists in `lib/queries.ts`. Map to `{ date: 'Mon'…'Sun', calories: number, protein: 0 }`. Pass to `WeeklyChart`. The protein line will render at 0 (flat, invisible against the chart baseline) — this is acceptable given the chart's purpose here is calories-only. The Consistency page fetches this data independently of `getWeekStats`; no changes to `getWeekStats` are required for Feature 1.

---

## Feature 2: Week Selector on Overview

### Goal
Let the user browse any past (or current) training week from the Overview tab.

### Approach
Keep `app/(dashboard)/page.tsx` as a **Server Component**. Add a `WeekNav` client component that manages URL navigation. The page reads `searchParams.week` (a `YYYY-MM-DD` Monday date string) and falls back to the current week's Monday.

### WeekNav Component
New file: `components/WeekNav.tsx` — `'use client'`

Layout:
```
← [Apr 7 – Apr 13  •  Week 4]  →
         (label is a Popover trigger)
```

- `←` / `→` buttons call `router.push(?week=YYYY-MM-DD)` ±7 days
- Center label opens a shadcn `Popover` containing a shadcn `Calendar` (single date mode)
- On calendar date select: snap to that week's Monday, push URL, close popover
- Disables `→` when the selected week is the current week (no future weeks)
- Minimum navigable week: training start (2026-03-16, Week 1)

### Overview Page Changes
- Accept `searchParams: { week?: string }` prop
- Derive `monday` from `searchParams.week` (parse + validate) or fall back to `startOfWeek(new Date())`
- Pass `monday` to all existing queries (`getWeekStats`, `getNutritionForRange`, `getWorkoutsForRange`)
- **Note:** `getWeekStats` currently hardcodes `startOfWeek(new Date())` internally — refactor it to accept a `monday: Date` parameter

### No new queries needed
All existing queries already accept arbitrary date ranges.

---

## Feature 3: Faster Photo Analysis

### Goal
Reduce perceived and actual latency of the Gemini photo analysis on mobile, where camera images can be 5–10 MB.

### Changes to `LogFoodDialog.tsx`

**Image compression** (before fetch):
- Use Canvas API to resize the image to max 800px on the longest side
- Re-encode as JPEG at 70% quality
- Typically reduces a 5 MB phone photo to ~60–100 KB

**Progress states:**
```ts
type AnalyzePhase = 'idle' | 'compressing' | 'uploading' | 'analyzing'
```

Replace the single `isAnalyzing: boolean` with `phase: AnalyzePhase`.

Button label:
| Phase | Label |
|---|---|
| idle | `📷 Analyze Photo` |
| compressing | `⟳ Compressing…` |
| uploading | `⟳ Uploading…` |
| analyzing | `⟳ Analyzing…` |

No changes to `app/api/nutrition/analyze-photo/route.ts` or the Gemini model.

---

## Implementation Order

1. Install missing shadcn/ui components: `npx shadcn@latest add calendar popover`
2. `lib/supabase.ts` — expand `ActivityType` union
3. `app/actions/workouts.ts` — `logActivity` server action
4. `components/LogActivityDialog.tsx` — new dialog component (uses `getWorkoutsForRange` which already exists in `lib/queries.ts`)
5. `lib/queries.ts` — add `monday: Date` param to `getWeekStats` (Feature 2 only; Consistency page uses `getWorkoutsForRange` directly, not `getWeekStats`)
6. `components/WeekNav.tsx` — week navigation client component (uses shadcn `Popover` + `Calendar`)
7. `app/(dashboard)/page.tsx` — wire up `searchParams` + `WeekNav`
8. `app/(dashboard)/consistency/page.tsx` — add button + weekly chart
9. `components/LogFoodDialog.tsx` — image compression + phase progress

---

## Out of Scope
- Editing or deleting logged activities
- Strava re-sync or deduplication with manual entries
- Any changes to the Gemini model or API route
