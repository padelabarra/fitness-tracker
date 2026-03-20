# Garmin → Strava Migration Guide
### Claude Code Instructions — Fitness Tracker

> **Scope:** Replace the Garmin ingestion pipeline with Strava OAuth2, update the DB schema, TypeScript types, and expose a public API for personal website integration (workouts + calorie intake).

---

## Prerequisites (do manually before running any code)

1. Go to https://www.strava.com/settings/api and create an app.
   - App Name: anything (e.g. "Fitness Tracker")
   - Website: `http://localhost` (or your Vercel domain)
   - Authorization Callback Domain: `localhost`
2. Copy **Client ID** and **Client Secret** — you'll need them below.
3. Do a one-time OAuth authorization to get your **Refresh Token**:
   - Open in browser (replace `YOUR_CLIENT_ID`):
     ```
     https://www.strava.com/oauth/authorize?client_id=YOUR_CLIENT_ID&response_type=code&redirect_uri=http://localhost&approval_prompt=force&scope=activity:read_all
     ```
   - After approving, copy the `code=` value from the redirect URL.
   - Exchange it for tokens (run in terminal, replace placeholders):
     ```bash
     curl -X POST https://www.strava.com/oauth/token \
       -d client_id=YOUR_CLIENT_ID \
       -d client_secret=YOUR_CLIENT_SECRET \
       -d code=YOUR_CODE \
       -d grant_type=authorization_code
     ```
   - Save the `refresh_token` from the JSON response — this never expires and is what goes in `.env`.

---

## Step 1 — Update Environment Variables

**File: `ingestion/.env`** (or `.env.example`)

Remove:
```
GARMIN_EMAIL=
GARMIN_PASSWORD=
```

Add:
```
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REFRESH_TOKEN=
```

Keep unchanged:
```
SUPABASE_URL=
SUPABASE_ANON_KEY=
USER_MAX_HR=
USER_AGE=32
TRACKER_API_URL=
API_SECRET=
```

**File: `.env.local`** (Next.js frontend) — no changes needed.

---

## Step 2 — Database Schema Migration

Open a new terminal and run these SQL statements against your Supabase project (Dashboard → SQL Editor, or via `psql`).

```sql
-- 1. Add new strava_activity_id column
ALTER TABLE workouts
  ADD COLUMN strava_activity_id BIGINT
    GENERATED ALWAYS AS ((raw_data->>'activity_id')::BIGINT) STORED;

-- 2. Add unique constraint on strava_activity_id (for upsert deduplication)
CREATE UNIQUE INDEX IF NOT EXISTS workouts_strava_activity_id_unique
  ON workouts (strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;

-- 3. Update source enum: add 'strava', keep 'garmin' for historical rows
--    (PostgreSQL doesn't support DROP on enum values, so we just ADD)
ALTER TYPE workout_source ADD VALUE IF NOT EXISTS 'strava';

-- 4. Keep garmin_activity_id for historical rows — no action needed.
--    New rows will use strava_activity_id.
```

Then update `ingestion/schema.sql` to reflect the final schema (for documentation / fresh installs):
- Add `strava_activity_id BIGINT GENERATED ALWAYS AS ((raw_data->>'activity_id')::BIGINT) STORED`
- Add `'strava'` to the `workout_source` enum
- Keep `garmin_activity_id` column and old index for historical data

---

## Step 3 — Update Python Requirements

**File: `ingestion/requirements.txt`**

Remove:
```
garminconnect==0.2.22
```

Add:
```
requests==2.32.3
```

Then run:
```bash
/opt/anaconda3/bin/pip install requests==2.32.3
```

---

## Step 4 — Create `ingestion/strava_sync.py`

Create this new file (replaces `garmin_sync.py`):

```python
#!/usr/bin/env python3
"""
Strava → Supabase ingestion script.

Usage:
  python strava_sync.py           # incremental: last 2 days
  python strava_sync.py --full    # backfill: last 90 days
"""

import argparse
import json
import os
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from dotenv import load_dotenv
from supabase import create_client, Client

load_dotenv()

# ── Config ────────────────────────────────────────────────────────────────────
STRAVA_CLIENT_ID     = os.environ["STRAVA_CLIENT_ID"]
STRAVA_CLIENT_SECRET = os.environ["STRAVA_CLIENT_SECRET"]
STRAVA_REFRESH_TOKEN = os.environ["STRAVA_REFRESH_TOKEN"]

SUPABASE_URL      = os.environ["SUPABASE_URL"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

USER_MAX_HR = int(os.getenv("USER_MAX_HR") or (220 - int(os.getenv("USER_AGE", "32"))))

LAST_SYNC_FILE = Path(__file__).parent / "last_sync.txt"

STRAVA_TOKEN_URL      = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"

# ── Strava type → schema type ─────────────────────────────────────────────────
STRAVA_TYPE_MAP: dict[str, str] = {
    "Run":              "running",
    "TrailRun":         "running",
    "VirtualRun":       "running",
    "Walk":             "hiking",
    "Hike":             "hiking",
    "Rowing":           "rowing",
    "VirtualRow":       "rowing",
    "WeightTraining":   "weights",
    "Workout":          "gym_upper",  # generic workout
    "Crossfit":         "gym_upper",
    "Yoga":             "other",
    "Ride":             "other",
    "VirtualRide":      "other",
    "Swim":             "other",
}


def get_access_token() -> str:
    """Exchange refresh token for a short-lived access token."""
    resp = requests.post(STRAVA_TOKEN_URL, data={
        "client_id":     STRAVA_CLIENT_ID,
        "client_secret": STRAVA_CLIENT_SECRET,
        "refresh_token": STRAVA_REFRESH_TOKEN,
        "grant_type":    "refresh_token",
    }, timeout=30)
    resp.raise_for_status()
    return resp.json()["access_token"]


def map_activity_type(strava_type: str) -> str:
    return STRAVA_TYPE_MAP.get(strava_type, "other")


def calculate_hr_zone(avg_hr: float | None) -> str | None:
    if avg_hr is None:
        return None
    pct = avg_hr / USER_MAX_HR
    if pct < 0.60:  return "Z1"
    if pct < 0.70:  return "Z2"
    if pct < 0.80:  return "Z3"
    if pct < 0.90:  return "Z4"
    return "Z5"


def build_workout_row(activity: dict) -> dict:
    """Transform a Strava activity dict into a DB-ready row."""
    start_dt = datetime.fromisoformat(activity["start_date_local"].replace("Z", "+00:00"))
    date_str  = start_dt.strftime("%Y-%m-%d")

    distance_km = (activity.get("distance") or 0) / 1000
    duration_min = round((activity.get("moving_time") or 0) / 60)
    avg_hr  = activity.get("average_heartrate")
    max_hr  = activity.get("max_heartrate")
    cal     = activity.get("kilojoules")
    # Strava reports kilojoules; approx calories = kJ * 0.239
    calories = round(cal * 0.239) if cal else activity.get("calories")

    return {
        "user_id":       "default",
        "date":          date_str,
        "activity_type": map_activity_type(activity.get("type", "other")),
        "duration_min":  duration_min,
        "distance_km":   round(distance_km, 2) if distance_km > 0 else None,
        "avg_hr":        round(avg_hr) if avg_hr else None,
        "max_hr":        round(max_hr) if max_hr else None,
        "calories":      calories,
        "training_zone": calculate_hr_zone(avg_hr),
        "notes":         activity.get("name"),
        "source":        "strava",
        "raw_data":      {"activity_id": str(activity["id"])},
    }


def read_last_sync() -> datetime:
    try:
        return datetime.fromisoformat(LAST_SYNC_FILE.read_text().strip())
    except Exception:
        return datetime.now(timezone.utc) - timedelta(days=2)


def write_last_sync() -> None:
    LAST_SYNC_FILE.write_text(datetime.now(timezone.utc).isoformat())


def fetch_activities(access_token: str, after: datetime, before: datetime) -> list[dict]:
    """Fetch all activities in [after, before] with pagination."""
    headers = {"Authorization": f"Bearer {access_token}"}
    activities: list[dict] = []
    page = 1
    after_ts  = int(after.timestamp())
    before_ts = int(before.timestamp())

    while True:
        resp = requests.get(STRAVA_ACTIVITIES_URL, headers=headers, params={
            "after":   after_ts,
            "before":  before_ts,
            "per_page": 100,
            "page":    page,
        }, timeout=30)
        resp.raise_for_status()
        batch = resp.json()
        if not batch:
            break
        activities.extend(batch)
        page += 1

    return activities


def sync(full: bool = False) -> None:
    supabase: Client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)

    now   = datetime.now(timezone.utc)
    after = now - timedelta(days=90) if full else read_last_sync() - timedelta(days=1)

    print(f"[strava_sync] fetching activities from {after.date()} → {now.date()}")
    access_token = get_access_token()
    activities   = fetch_activities(access_token, after, now)
    print(f"[strava_sync] {len(activities)} activities retrieved")

    if not activities:
        write_last_sync()
        return

    rows = [build_workout_row(a) for a in activities]

    # Upsert using strava_activity_id (stored in raw_data->>'activity_id')
    result = (
        supabase.table("workouts")
        .upsert(rows, on_conflict="strava_activity_id")
        .execute()
    )
    print(f"[strava_sync] upserted {len(rows)} rows")
    write_last_sync()


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="90-day backfill")
    args = parser.parse_args()
    sync(full=args.full)
```

---

## Step 5 — Update TypeScript Types

**File: `lib/supabase.ts`**

Find the `WorkoutSource` type alias and update it:

```typescript
// BEFORE
export type WorkoutSource = 'garmin' | 'manual';

// AFTER
export type WorkoutSource = 'garmin' | 'strava' | 'manual';
```

> Keep `'garmin'` in the union so TypeScript doesn't break on historical rows.

---

## Step 6 — Update `CLAUDE.md`

In the project root `CLAUDE.md`, update the sync commands:

```markdown
## Commands
- `npm run dev` — local dev
- `npm run test:run` — unit tests (vitest)
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py` — manual Strava sync
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py --full` — 90-day backfill
```

---

## Step 7 — Public API for Personal Website

Create a new Next.js route that exposes workout + nutrition data for your personal website. This endpoint is read-only and protected by the same `API_SECRET` env var.

**File: `app/api/public/summary/route.ts`** (create new file)

```typescript
import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { timingSafeEqual } from 'crypto';

function verifySecret(req: NextRequest): boolean {
  const secret = process.env.API_SECRET;
  if (!secret) return false;
  const provided = req.headers.get('x-api-secret') ?? '';
  try {
    return timingSafeEqual(Buffer.from(secret), Buffer.from(provided));
  } catch {
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!verifySecret(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get('days') ?? '30'), 90);

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = since.toISOString().split('T')[0];

  // Fetch workouts
  const { data: workouts, error: wErr } = await supabase
    .from('workouts')
    .select('date, activity_type, duration_min, distance_km, calories, training_zone, avg_hr')
    .eq('user_id', 'default')
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (wErr) return NextResponse.json({ error: wErr.message }, { status: 500 });

  // Fetch nutrition
  const { data: nutrition, error: nErr } = await supabase
    .from('nutrition')
    .select('date, meal_type, food_description, calories_approx, protein_g')
    .eq('user_id', 'default')
    .gte('date', sinceStr)
    .order('date', { ascending: false });

  if (nErr) return NextResponse.json({ error: nErr.message }, { status: 500 });

  // Aggregate daily calories + protein for chart use
  const dailyNutrition: Record<string, { calories: number; protein: number }> = {};
  for (const entry of nutrition ?? []) {
    if (!dailyNutrition[entry.date]) {
      dailyNutrition[entry.date] = { calories: 0, protein: 0 };
    }
    dailyNutrition[entry.date].calories += entry.calories_approx ?? 0;
    dailyNutrition[entry.date].protein  += entry.protein_g ?? 0;
  }

  return NextResponse.json({
    workouts,
    nutrition_log: nutrition,
    daily_nutrition: Object.entries(dailyNutrition)
      .map(([date, v]) => ({ date, ...v }))
      .sort((a, b) => b.date.localeCompare(a.date)),
    generated_at: new Date().toISOString(),
  });
}
```

**Usage from your personal website:**

```javascript
const res = await fetch('https://your-vercel-domain.vercel.app/api/public/summary?days=30', {
  headers: { 'x-api-secret': 'YOUR_API_SECRET' }
});
const { workouts, daily_nutrition } = await res.json();
```

The response shape:
```jsonc
{
  "workouts": [
    { "date": "2026-03-19", "activity_type": "running", "distance_km": 12.4,
      "duration_min": 75, "calories": 680, "training_zone": "Z3", "avg_hr": 148 }
  ],
  "nutrition_log": [ ... ],        // raw meal entries
  "daily_nutrition": [
    { "date": "2026-03-19", "calories": 2150, "protein": 142 }
  ],
  "generated_at": "2026-03-19T..."
}
```

---

## Step 7b — Update the Test File

**File: `ingestion/tests/test_garmin_sync.py`**

This file imports from `garmin_sync`. Either:

- **Option A (recommended):** Rename it to `test_strava_sync.py` and update the import:
  ```python
  # BEFORE
  from garmin_sync import map_activity_type, calculate_hr_zone, format_last_sync_date

  # AFTER
  from strava_sync import map_activity_type, calculate_hr_zone
  ```
  Then update any test cases that reference Garmin-specific type strings (e.g. `'trail_running'`) to use Strava type strings (e.g. `'TrailRun'`).

- **Option B:** Keep the old test file for the archived `garmin_sync.py` and just create a new `test_strava_sync.py` alongside it.

---

## Step 8 — Test the Migration

Open two terminals and run these in parallel:

**Terminal 1 — Run the full Strava backfill:**
```bash
cd fitness-tracker/ingestion
/opt/anaconda3/bin/python3 strava_sync.py --full
```

**Terminal 2 — Verify data landed in Supabase + run unit tests:**
```bash
cd fitness-tracker
npm run test:run
```

Then manually verify in the Supabase dashboard:
```sql
SELECT date, activity_type, source, strava_activity_id
FROM workouts
WHERE source = 'strava'
ORDER BY date DESC
LIMIT 10;
```

---

## Step 9 — Update Vercel Environment Variables

In the Vercel dashboard (or via CLI), add the three new env vars:
```
STRAVA_CLIENT_ID
STRAVA_CLIENT_SECRET
STRAVA_REFRESH_TOKEN
```

These are only needed by the ingestion script (Python), **not** by the Next.js app — so you only need them if you run the sync from a server/cron. The Next.js app reads only `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `API_SECRET`.

---

## File Change Summary

| Action | File |
|--------|------|
| **Create** | `ingestion/strava_sync.py` |
| **Create** | `app/api/public/summary/route.ts` |
| **Edit**   | `ingestion/requirements.txt` — swap garminconnect → requests |
| **Edit**   | `ingestion/.env` — swap GARMIN_* → STRAVA_* |
| **Edit**   | `ingestion/schema.sql` — add strava_activity_id, strava source |
| **Edit**   | `lib/supabase.ts` — add `'strava'` to WorkoutSource union |
| **Edit**   | `CLAUDE.md` — update sync commands |
| **SQL**    | Run migration in Supabase SQL Editor (Step 2) |
| **Keep**   | `ingestion/garmin_sync.py` — leave for historical reference |
