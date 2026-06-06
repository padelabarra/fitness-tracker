# Fitness Tracker — Claude Code Instructions

## Living Document Rule
**Whenever any important change is made to this project, automatically update every relevant MD and documentation file.** This includes:
- `CLAUDE.md` — reflect new features, schema changes, components, routes, fixes, or architectural decisions
- `ingestion/schema.sql` — keep DDL in sync with any DB migrations
- `README.md` — keep setup and env var sections current
- Any design spec in `docs/superpowers/specs/` if the implementation deviates from it

Do not wait to be asked. Updating docs is part of completing a task, not a separate step.

---

## Project Overview
Marathon training dashboard for **Pedro** and **Renatta**. Strava auto-ingestion + Garmin biometrics + manual food/activity logging. Dashboard in Next.js 15. Data in Supabase. Deployed on Vercel.

Pedro is training for a marathon on **September 6, 2026**.
Training started March 16, 2026. 26-week plan, 4 phases.

**Nutrition targets:** ~1,800 kcal/day, ~120g protein/day (both users).

---

## Tech Stack
- **Frontend:** Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts
- **Database:** Supabase (PostgreSQL), RLS disabled (single-user v1)
- **Ingestion:** Python 3.11 + `garminconnect` + `requests` (Strava API) + `supabase-py`
- **Auth:** NextAuth v5 (Credentials provider), username/password, JWT sessions
- **AI:** Google Gemini Vision for photo-based calorie estimation
- **Deploy:** Vercel
- **CI:** GitHub Actions — Strava sync 3×/day + Garmin biometrics sync daily at 07:00 UTC
- **Garmin MCP:** `@nicolasvegam/garmin-connect-mcp` configured in `~/.claude/settings.json` — gives Claude live Garmin access in any session

---

## Users
| env var | value | Garmin? | Strava? |
|---------|-------|---------|---------|
| `USER1_ID` / `USER1_USERNAME` | `pedro` | Yes | Yes |
| `USER2_ID` / `USER2_USERNAME` | `renatta` | No | Pending credentials |

Garmin biometric features (BiometricsCard, /performance) check `session.user.id === 'pedro'` and degrade gracefully for Renatta.

---

## Environment Variables

### Already set (`.env.local` + Vercel + GH Secrets) — do NOT re-add
| Variable | Purpose |
|----------|---------|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase anon key |
| `API_SECRET` | Shared secret for `/api/public/summary` and Telegram bot |
| `AUTH_SECRET` | NextAuth JWT secret |
| `GEMINI_API_KEY` | Google Gemini Vision (photo calorie estimation) |
| `USER1_ID`, `USER1_USERNAME` | Pedro's auth identity |
| `USER1_PASSWORD_HASH` | bcrypt hash |
| `USER2_ID`, `USER2_USERNAME` | Renatta's auth identity |
| `USER2_PASSWORD_HASH` | bcrypt hash |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN` | Strava OAuth (Pedro) |
| `USER_AGE` | Used for HR zone calculation |

### New vars for Garmin integration — add to `.env.local`, Vercel, and GH Secrets
| Variable | Purpose |
|----------|---------|
| `GARMIN_EMAIL` | Garmin Connect account email (Pedro) |
| `GARMIN_PASSWORD` | Garmin Connect password (Pedro) |
| `GITHUB_TOKEN` | PAT with `workflow` scope — used by `/api/garmin/trigger-sync` to dispatch GH Actions |
| `GITHUB_REPO` | `"padelabarra/fitness-tracker"` |

> `USER1_ID` doubles as the Garmin user_id in the DB — no separate `GARMIN_USER_ID` needed.

---

## Database Schema
See `ingestion/schema.sql` for full DDL.

### `workouts`
Strava activities + manually logged workouts.
- `id`, `user_id`, `date`, `activity_type`, `duration_min`, `distance_km`, `avg_hr`, `max_hr`, `calories`, `training_zone`, `notes`, `source` (`garmin`|`strava`|`manual`), `raw_data` (jsonb)
- Generated columns: `garmin_activity_id` (from `raw_data->>'activity_id'`), `strava_activity_id`
- Dedup indexes on both generated columns
- `activity_type` values: `running`, `rowing`, `gym_upper`, `gym_lower`, `hiking`, `weights`, `cycling`, `swimming`, `tennis`, `soccer`, `boxing`, `basketball`, `volleyball`, `yoga`, `pilates`, `crossfit`, `climbing`, `other`

### `nutrition`
Manual + Telegram + photo-logged food entries.
- `id`, `user_id`, `date`, `meal_type` (`breakfast`|`lunch`|`dinner`|`snack`|`supplement`), `food_description`, `calories_approx`, `protein_g`, `notes`, `source` (`telegram`|`manual`|`photo`)

### `garmin_daily_snapshots` _(in-progress — Garmin integration)_
One row per user per day. Upsert on `(user_id, date)`.
- `steps`, `resting_hr`, `sleep_score`, `sleep_duration_min`, `body_battery_end`, `stress_avg`, `calories_active`, `hrv_last_night`, `raw_json`

### `garmin_performance` _(in-progress — Garmin integration)_
One row per user per day. Upsert on `(user_id, date)`.
- `vo2max`, `hrv_weekly_avg`, `training_readiness`, `training_load_7d`, `race_pred_5k_sec`, `race_pred_half_sec`, `race_pred_marathon_sec`, `raw_json`

---

## App Structure

### Pages (`app/(dashboard)/`)
| Route | File | Users | Description |
|-------|------|-------|-------------|
| `/` | `page.tsx` | All | Weekly Overview — stat cards + chart + BiometricsCard (Pedro) + WeeklySummaryWidget |
| `/running` | `running/page.tsx` | All | Marathon Progress — area chart + runs table |
| `/nutrition` | `nutrition/page.tsx` | All | Nutrition Trends — 14-day chart + Log Food dialog |
| `/consistency` | `consistency/page.tsx` | All | Consistency Heatmap — 52-week SVG + activity donut |
| `/performance` | `performance/page.tsx` | Pedro | VO2max, HRV, training readiness, race predictions _(in-progress)_ |
| `/activities` | `activities/page.tsx` | All | Activity feed from `workouts` table _(in-progress)_ |
| `/insights` | `insights/page.tsx` | Pedro | Nutrition × training correlation _(stretch)_ |
| `/login` | `app/login/page.tsx` | — | Login page |

### Components (`components/`)
| Component | Type | Description |
|-----------|------|-------------|
| `StatCard` | Server | Metric card with label/value/delta |
| `WeeklyChart` | Client | Combined bar+line chart (calories + protein) for the week |
| `MarathonChart` | Client | Area chart of weekly km over training plan |
| `NutritionChart` | Client | 14-day stacked bar chart (calories by meal) |
| `ActivityDonut` | Client | Recharts donut of activity type breakdown |
| `ConsistencyHeatmap` | Client | 52-week SVG heatmap (use local date formatting — avoids hydration mismatch) |
| `LogFoodDialog` | Client | Log food manually or via Gemini Vision photo |
| `LogFoodDialogDynamic` | Client | Dynamic import wrapper |
| `LogActivityDialog` | Client | Manually log a workout |
| `LogActivityDialogDynamic` | Client | Dynamic import wrapper |
| `WeekNav` | Client | Prev/next week arrows — drives Weekly Overview |
| `SignOutButton` | Client | Sign-out action |
| `BiometricsCard` | Client | Steps, resting HR, body battery, sleep — Pedro only _(in-progress)_ |
| `WeeklySummaryWidget` | Server | Weekly totals + avg sleep + body battery trend _(in-progress)_ |
| `VO2MaxChart` | Client | Recharts AreaChart of VO2max trend _(in-progress)_ |
| `HRVWidget` | Client | HRV weekly avg + trend arrow _(in-progress)_ |
| `TrainingReadinessBadge` | Client | Color-coded readiness score _(in-progress)_ |
| `RacePredictionsTable` | Server | 5K / Half / Full predictions formatted as pace _(in-progress)_ |
| `TrainingLoadBar` | Client | 7-day training load bar _(in-progress)_ |

### API Routes (`app/api/`)
| Route | Method | Auth | Description |
|-------|--------|------|-------------|
| `/api/nutrition` | POST | `API_SECRET` header | Log nutrition (Telegram bot) |
| `/api/nutrition/analyze-photo` | POST | Session | Gemini Vision calorie estimation |
| `/api/public/summary` | GET | `API_SECRET` header | Public workout + nutrition JSON |
| `/api/garmin/trigger-sync` | POST | Session (Pedro) | Dispatches GH Actions `workflow_dispatch` _(in-progress)_ |

### Server Actions (`app/actions/`)
- `nutrition.ts` — `logFood()`
- `workouts.ts` — `logActivity()`

### Library (`lib/`)
- `supabase.ts` — Supabase client singleton + all TypeScript types (`Workout`, `NutritionEntry`, `GarminDailySnapshot`, `GarminPerformance`)
- `queries.ts` — Supabase query functions for workouts + nutrition
- `garmin-queries.ts` — Supabase query functions for Garmin tables _(in-progress)_
- `utils.ts` — `marathonWeek()`, `currentStreak()`, `phaseTargets()`, `formatPace()`, timezone-safe date helpers

### Auth (`auth.ts`, `middleware.ts`)
- NextAuth v5 Credentials provider; JWT sessions
- `middleware.ts` protects all routes except `/login` and `/api/public/*`
- Credentials read at runtime (not build time) to avoid env var interpolation issues

---

## Ingestion (`ingestion/`)

### `strava_sync.py`
- Strava OAuth2 (refresh token flow), fetches `DetailedActivity` per activity
- Upserts into `workouts` on `strava_activity_id`
- `--full` flag for 90-day backfill
- Env: `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER_AGE`

### `garmin_biometrics_sync.py` _(in-progress)_
- Uses `garminconnect` library (same as `garmin_sync.py`)
- Fetches: daily summary, sleep, HRV, VO2max, training readiness, training load, race predictions
- Upserts `garmin_daily_snapshots` + `garmin_performance` for `USER1_ID` (Pedro)
- `--date YYYY-MM-DD` for specific date; `--backfill N` for N-day backfill
- Env: `GARMIN_EMAIL`, `GARMIN_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `USER1_ID`

### `telegram_food_bot.py`
- Telegram bot → Gemini macro parsing → POST `/api/nutrition`

### `garmin_sync.py`
- Legacy Garmin activity sync (superseded by Strava); kept for reference and test coverage

### GitHub Actions
| Workflow | Schedule | Purpose |
|----------|----------|---------|
| `.github/workflows/strava-sync.yml` | 06:00, 14:00, 22:00 UTC | Strava activity ingestion (Pedro; Renatta slot commented out) |
| `.github/workflows/garmin-biometrics.yml` | 07:00 UTC | Garmin biometrics sync (Pedro only) _(in-progress)_ |

Both workflows support `workflow_dispatch` for manual triggers.

---

## Key Rules
- Always use TypeScript with strict types
- Use supabase client from `lib/supabase.ts` — never instantiate directly
- All Garmin API calls are server-side only — never expose `GARMIN_EMAIL`/`GARMIN_PASSWORD` client-side
- All charts use Recharts (Client Components)
- shadcn/ui for all UI components
- Mobile-first responsive design
- No hardcoded credentials — always use env vars
- Server Components query Supabase directly (no API round-trip)
- `user_id` values: `"pedro"` and `"renatta"` (was `"default"` in v1 — historical rows may still have `"default"`)
- Use local date formatting in Client Components (avoids SSR hydration mismatch — learned from ConsistencyHeatmap)
- Garmin-only features guard with `session.user.id === 'pedro'`; show graceful empty state for Renatta

---

## Tests
- **Unit tests:** vitest (`npm run test:run`) — covers `lib/utils.ts`
- **Python tests:** pytest in `ingestion/tests/` — covers `strava_sync.py` and `garmin_sync.py`

---

## Python
Use `/opt/anaconda3/bin/python3` (not `/usr/bin/python3`)

---

## Commands
- `npm run dev` — local dev
- `npm run test:run` — unit tests (vitest)
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py` — manual Strava sync
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py --full` — 90-day Strava backfill
- `/opt/anaconda3/bin/python3 ingestion/garmin_biometrics_sync.py` — manual Garmin sync _(in-progress)_
- `/opt/anaconda3/bin/python3 ingestion/garmin_biometrics_sync.py --backfill 30` — 30-day Garmin backfill _(in-progress)_

### Garmin MCP (Claude sessions only)
```bash
# One-time setup — run once in terminal:
claude mcp add garmin \
  -e GARMIN_EMAIL=$GARMIN_EMAIL \
  -e GARMIN_PASSWORD=$GARMIN_PASSWORD \
  -- npx -y @nicolasvegam/garmin-connect-mcp
```
After setup, Claude can call `get_daily_summary`, `get_sleep_data`, `get_hrv`, `get_vo2max`, etc. in any session. Not used by the app itself — only for live exploration.

---

## Known Issues / Design Decisions
- RLS is disabled (single-user v1); needs enabling for multi-user production
- Renatta's Strava sync slot is pre-wired in `strava-sync.yml` but commented out pending her credentials
- `activity_type` check constraint covers all Strava sport types
- Garmin tables (`garmin_daily_snapshots`, `garmin_performance`) not yet created — pending implementation
- Historical `workouts` rows may have `user_id = "default"` from before multi-user migration

---

## Design Specs
- `docs/superpowers/specs/2026-04-01-fitness-tracker-enhancements-design.md` — manual activity logging, week selector, photo analysis speed
- `docs/superpowers/specs/2026-06-06-garmin-integration-design.md` — full Garmin integration (current in-progress work)
