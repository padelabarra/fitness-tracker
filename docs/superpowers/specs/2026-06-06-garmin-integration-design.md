# Garmin Connect Integration — Design Spec
**Date:** 2026-06-06  
**Status:** Approved  
**Scope:** Full Garmin biometric integration for Pedro (daily snapshot + performance metrics), new UI pages, automatic sync pipeline

---

## 1. Goals

- Surface Garmin biometric data (steps, sleep, body battery, HRV, VO2max, training readiness, race predictions) in the fitness dashboard
- Keep sync fully automatic — no manual steps after initial setup
- Garmin MCP configured in Claude settings for live exploration in any Claude session
- Pedro only for Garmin data; Renatta's pages degrade gracefully

---

## 2. Architecture

```
Garmin Watch → Garmin Connect API
                    ↑ live reads (MCP, any Claude session)
                    ↑ daily batch reads (Python, GitHub Actions 7am UTC)
                         ↓ upsert
                   Supabase DB
                   ├── garmin_daily_snapshots
                   └── garmin_performance
                         ↓ read (server components)
              Next.js App
              ├── / (Overview: +BiometricsCard, +WeeklySummary)
              ├── /performance  (new — Pedro only)
              ├── /activities   (new — all users, reads workouts table)
              └── /insights     (new stretch — nutrition × training correlation)
```

**Two independent Garmin access paths:**
- **MCP** (`@nicolasvegam/garmin-connect-mcp`): configured once in `~/.claude/settings.json`; gives Claude live read access to Garmin Connect in any session. Used for exploration, debugging, and ad-hoc queries — not for automated sync.
- **Python pipeline**: `garmin_biometrics_sync.py` runs daily via GitHub Actions; writes structured data to Supabase; is the source of truth for the dashboard.

---

## 3. Garmin MCP Setup (one-time, manual)

User runs in terminal:
```bash
claude mcp add garmin \
  -e GARMIN_EMAIL=$GARMIN_EMAIL \
  -e GARMIN_PASSWORD=$GARMIN_PASSWORD \
  -- npx -y @nicolasvegam/garmin-connect-mcp
```

After this, Claude can call `get_user_profile`, `get_last_activity`, `get_daily_summary`, etc. in any Claude Code session. No app code depends on this.

---

## 4. Supabase Schema

### `garmin_daily_snapshots`
One row per user per calendar day. Upsert on `(user_id, date)`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| user_id | TEXT NOT NULL | 'pedro' in v1 |
| date | DATE NOT NULL | calendar date of snapshot |
| steps | INTEGER | daily step count |
| resting_hr | INTEGER | bpm |
| sleep_score | INTEGER | 0–100 Garmin score |
| sleep_duration_min | INTEGER | total sleep minutes |
| body_battery_end | INTEGER | end-of-day body battery (0–100) |
| stress_avg | INTEGER | daily avg stress (0–100) |
| calories_active | INTEGER | active (non-resting) kcal |
| hrv_last_night | NUMERIC | last night's HRV ms |
| raw_json | JSONB | full Garmin API response |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW(), updated on upsert |

Constraint: `UNIQUE(user_id, date)`

### `garmin_performance`
One row per user per day (written when Garmin computes new values — may not update daily).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | gen_random_uuid() |
| user_id | TEXT NOT NULL | |
| date | DATE NOT NULL | |
| vo2max | NUMERIC | ml/kg/min |
| hrv_weekly_avg | NUMERIC | 7-day HRV average ms |
| training_readiness | INTEGER | 0–100 Garmin score |
| training_load_7d | NUMERIC | acute training load |
| race_pred_5k_sec | INTEGER | predicted 5K time in seconds |
| race_pred_half_sec | INTEGER | predicted half-marathon in seconds |
| race_pred_marathon_sec | INTEGER | predicted marathon in seconds |
| raw_json | JSONB | |
| created_at | TIMESTAMPTZ | DEFAULT NOW() |
| updated_at | TIMESTAMPTZ | DEFAULT NOW() |

Constraint: `UNIQUE(user_id, date)`

**Not building `garmin_activities`** — activity data already lives in `workouts` (Strava source). Activities feed reads from `workouts`.

---

## 5. Python Sync Script

**File:** `ingestion/garmin_biometrics_sync.py`  
**Library:** `garminconnect` (already used in `garmin_sync.py` — stays consistent with existing codebase)  
**New dependency:** already used; ensure it's pinned in `ingestion/requirements.txt`

### What it fetches
For a given date (default: today):

| Garmin endpoint | Target table | Fields |
|-----------------|-------------|--------|
| daily summary | garmin_daily_snapshots | steps, resting_hr, calories_active, stress_avg, body_battery_end |
| sleep data | garmin_daily_snapshots | sleep_score, sleep_duration_min |
| HRV status | garmin_daily_snapshots | hrv_last_night |
| VO2max | garmin_performance | vo2max |
| training readiness | garmin_performance | training_readiness |
| training status | garmin_performance | training_load_7d, hrv_weekly_avg |
| race predictions | garmin_performance | race_pred_5k_sec, race_pred_half_sec, race_pred_marathon_sec |

### Error handling
- Each fetch wrapped in try/except; failures log a warning and continue (partial data is fine)
- Script exits 0 even on partial failure (don't break GH Actions on rate limits)
- Logs what was fetched at the end

### CLI flags
```bash
python3 garmin_biometrics_sync.py              # today
python3 garmin_biometrics_sync.py --date 2026-06-01  # specific date
python3 garmin_biometrics_sync.py --backfill 30      # last 30 days
```

### Env vars
- `GARMIN_EMAIL` — Garmin Connect account email (new)
- `GARMIN_PASSWORD` — Garmin Connect password (new)
- `SUPABASE_URL` — already in env
- `SUPABASE_ANON_KEY` — already in env
- User ID is read from `USER1_ID` env var (already = "pedro") — no separate `GARMIN_USER_ID` needed

---

## 6. GitHub Actions

**New workflow:** `.github/workflows/garmin-biometrics.yml`  
**Schedule:** `cron: '0 7 * * *'` (7:00 UTC daily)  
**Separate from Strava sync** — failures are isolated  
**`workflow_dispatch`** input: optional `date` string for backfills

Secrets needed in GitHub:
- `GARMIN_EMAIL`
- `GARMIN_PASSWORD`
- `GARMIN_USER_ID` (= "pedro")
- `SUPABASE_URL` (already exists)
- `SUPABASE_ANON_KEY` (already exists)

---

## 7. Manual Sync API + Trigger Button

**Route:** `POST /app/api/garmin/trigger-sync/route.ts`  
**Auth:** server-side session check (Pedro only)  
**Action:** calls GitHub API `POST /repos/{owner}/{repo}/actions/workflows/garmin-biometrics.yml/dispatches`  
**Returns:** `{ triggered: true }` or error

Additional env var needed:
- `GITHUB_TOKEN` — personal access token with `workflow` scope (or use `GITHUB_TOKEN` from Actions if self-triggering, but simpler to use a PAT for UI → GH API calls)
- `GITHUB_REPO` — e.g. `"padelabarra/fitness-tracker"`

**UI:** Manual sync button on the BiometricsCard. Shows "Last synced: X hours ago" computed from `garmin_daily_snapshots.updated_at` for today's row.

---

## 8. New Lib File

**`lib/garmin-queries.ts`** (server-only, follows pattern of `lib/queries.ts`)

Functions:
```ts
getLatestDailySnapshot(userId: string): Promise<GarminDailySnapshot | null>
getDailySnapshots(userId: string, days: number): Promise<GarminDailySnapshot[]>
getLatestPerformance(userId: string): Promise<GarminPerformance | null>
getPerformanceTrend(userId: string, days: number): Promise<GarminPerformance[]>
```

Types defined in `lib/supabase.ts` alongside `Workout` and `NutritionEntry`.

---

## 9. UI Changes

### 9a. Overview Page (`/`) — Additions

**BiometricsCard component** (Pedro only, hidden for Renatta)
- Steps with progress bar toward 10,000 goal
- Resting HR (bpm)
- Body Battery (end-of-day, 0–100 visual gauge)
- Sleep score + duration (e.g. "72 · 7h 20min")
- "Last synced: X hours ago" + manual sync button (→ trigger-sync API)
- If no data for today: shows last available date with a note

**WeeklySummaryWidget** (below existing chart)
- Total distance (km) — from workouts
- Total active minutes — from workouts
- Avg sleep score for the week — from garmin_daily_snapshots
- Body battery trend: first day vs last day of week (↑ recovering / ↓ digging a hole)

### 9b. New `/performance` Page (Pedro only)

Components:
- **VO2MaxChart**: Recharts AreaChart, last 90 days of `vo2max` values
- **HRVWidget**: current week avg, arrow vs prior week, spark line
- **TrainingReadinessBadge**: large colored circle with score; green ≥70, yellow 40–69, red <40; includes Garmin's readiness message
- **RacePredictionsTable**: 5K, Half, Full rows — times formatted as `H:MM:SS` and `mm:ss/km` pace
- **TrainingLoadBar**: 7-day load as horizontal bar with contextual label (easy/moderate/high)

### 9c. New `/activities` Page (both users)

- Reads from existing `workouts` table (Strava data)
- Last 20 activities, descending by date
- Per row: activity type icon, date, distance (km), duration (min), avg HR
- Click-to-expand: HR zones from `raw_data.hr_zones`, notes field
- Filter chips: All / Run / Cycling / Strength / Other
- No Garmin data needed — pure Strava/manual activities

### 9d. Navigation

Add to sidebar (`app/(dashboard)/layout.tsx`) and bottom tabs:
- "Performance" link (shows for Pedro only, or shown but with empty state for Renatta)
- "Activities" link (shows for all users)

### 9e. Stretch: `/insights` Page

Shown only if both nutrition AND garmin_daily_snapshots data exist for the user.

- 14-day rolling window
- Combo chart: protein intake (bars) vs next-day training readiness (line)
- Combo chart: calories (bars) vs body battery end-of-day (line)

---

## 10. Error & Empty States

| Scenario | Behavior |
|----------|----------|
| Garmin sync hasn't run yet | Show "No data yet — sync pending" with last sync time |
| Today's snapshot missing, yesterday exists | Show yesterday's data with "as of yesterday" label |
| All data missing | Hide Garmin cards, show a "Connect Garmin" explainer |
| Renatta views /performance | Show "Garmin data not available for this account" |
| GitHub API trigger fails | Toast error: "Sync trigger failed — try again" |
| Partial Garmin data (e.g. sleep missing) | Render available fields, show "—" for missing |

---

## 11. Deliverables Summary

**New files:**
- `ingestion/garmin_biometrics_sync.py`
- `.github/workflows/garmin-biometrics.yml`
- `app/api/garmin/trigger-sync/route.ts`
- `lib/garmin-queries.ts`
- `components/BiometricsCard.tsx`
- `components/WeeklySummaryWidget.tsx`
- `components/VO2MaxChart.tsx`
- `components/HRVWidget.tsx`
- `components/TrainingReadinessBadge.tsx`
- `components/RacePredictionsTable.tsx`
- `components/TrainingLoadBar.tsx`
- `app/(dashboard)/performance/page.tsx`
- `app/(dashboard)/activities/page.tsx`
- `app/(dashboard)/insights/page.tsx` (stretch)

**Modified files:**
- `app/(dashboard)/page.tsx` — add BiometricsCard + WeeklySummaryWidget
- `app/(dashboard)/layout.tsx` — add nav links
- `lib/supabase.ts` — add GarminDailySnapshot + GarminPerformance types
- `ingestion/requirements.txt` — pin `garminconnect` version
- `ingestion/schema.sql` — add new table DDL
- `CLAUDE.md` — update with new features

**Env vars — already in `.env.local` / Vercel (do not re-add):**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — Supabase connection
- `API_SECRET` — shared API secret for external endpoints
- `AUTH_SECRET` — NextAuth secret
- `GEMINI_API_KEY` — photo calorie estimation
- `USER1_ID` (= "pedro"), `USER1_USERNAME`, `USER2_ID` (= "renatta"), `USER2_USERNAME`

**New env vars to add (`.env.local` locally, Vercel + GH Secrets for CI):**
- `GARMIN_EMAIL` — Garmin Connect account email
- `GARMIN_PASSWORD` — Garmin Connect password
- `GITHUB_TOKEN` — PAT with `workflow` scope (for UI → trigger-sync button)
- `GITHUB_REPO` (= "padelabarra/fitness-tracker")

> Note: `GARMIN_USER_ID` is not a separate var — use `USER1_ID` ("pedro") already in env.

**New Supabase tables:**
- `garmin_daily_snapshots`
- `garmin_performance`

**MCP setup (one-time terminal command):**
```bash
claude mcp add garmin \
  -e GARMIN_EMAIL=$GARMIN_EMAIL \
  -e GARMIN_PASSWORD=$GARMIN_PASSWORD \
  -- npx -y @nicolasvegam/garmin-connect-mcp
```
