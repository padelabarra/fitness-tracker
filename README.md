# Fitness Tracker

Marathon training dashboard for Pedro and Renatta. Tracks workouts (via Strava), biometrics (via Garmin Connect), and nutrition (manual + Telegram bot + photo).

**Stack:** Next.js 15 · Supabase · Tailwind · shadcn/ui · Recharts · Vercel · GitHub Actions

---

## Features

- **Weekly Overview** — km, active minutes, avg protein, workout streak; week selector
- **Marathon Progress** — area chart of weekly km vs target across 26-week plan
- **Nutrition Trends** — 14-day calorie/protein chart; log food manually or via photo (Gemini Vision)
- **Consistency Heatmap** — 52-week activity heatmap + activity type donut
- **Garmin Biometrics** _(in progress)_ — steps, sleep score, body battery, resting HR (Pedro only)
- **Performance** _(in progress)_ — VO2max trend, HRV, training readiness, race predictions
- **Activities Feed** _(in progress)_ — last 20 activities with HR zones, filters

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run test:run   # vitest unit tests
```

---

## Environment Variables

Copy `.env.local.example` and fill in values. Variables marked **existing** are already in Vercel; variables marked **new (Garmin)** are needed for the Garmin integration.

| Variable | Where | Notes |
|----------|-------|-------|
| `SUPABASE_URL` | existing | Supabase project URL |
| `SUPABASE_ANON_KEY` | existing | Supabase anon key |
| `AUTH_SECRET` | existing | NextAuth JWT secret |
| `API_SECRET` | existing | Shared secret for Telegram bot + public API |
| `GEMINI_API_KEY` | existing | Google Gemini Vision (photo calorie estimation) |
| `USER1_ID` | existing | `pedro` |
| `USER1_USERNAME` | existing | `pedro` |
| `USER1_PASSWORD_HASH` | existing | bcrypt hash |
| `USER2_ID` | existing | `renatta` |
| `USER2_USERNAME` | existing | `renatta` |
| `USER2_PASSWORD_HASH` | existing | bcrypt hash |
| `STRAVA_CLIENT_ID` | existing | Strava app client ID |
| `STRAVA_CLIENT_SECRET` | existing | Strava app client secret |
| `STRAVA_REFRESH_TOKEN` | existing | Pedro's Strava refresh token |
| `USER_AGE` | existing | Used for HR zone calculation |
| `GARMIN_EMAIL` | **new (Garmin)** | Garmin Connect email (Pedro) |
| `GARMIN_PASSWORD` | **new (Garmin)** | Garmin Connect password (Pedro) |
| `GITHUB_TOKEN` | **new (Garmin)** | PAT with `workflow` scope — for UI sync trigger button |
| `GITHUB_REPO` | **new (Garmin)** | `padelabarra/fitness-tracker` |

---

## Data Pipeline

### Strava (activities)
Runs automatically 3×/day via GitHub Actions (`strava-sync.yml` at 06:00, 14:00, 22:00 UTC).

```bash
# Manual run
/opt/anaconda3/bin/python3 ingestion/strava_sync.py
/opt/anaconda3/bin/python3 ingestion/strava_sync.py --full   # 90-day backfill
```

### Garmin (biometrics) _(in progress)_
Runs automatically daily at 07:00 UTC via GitHub Actions (`garmin-biometrics.yml`).

```bash
# Manual run
/opt/anaconda3/bin/python3 ingestion/garmin_biometrics_sync.py
/opt/anaconda3/bin/python3 ingestion/garmin_biometrics_sync.py --backfill 30
```

### Telegram Food Bot
```bash
/opt/anaconda3/bin/python3 ingestion/telegram_food_bot.py
```

---

## Garmin MCP (Claude sessions)

One-time setup to give Claude live Garmin Connect access in any Claude Code session:

```bash
claude mcp add garmin \
  -e GARMIN_EMAIL=$GARMIN_EMAIL \
  -e GARMIN_PASSWORD=$GARMIN_PASSWORD \
  -- npx -y @nicolasvegam/garmin-connect-mcp
```

---

## Database

Two tables in Supabase (see `ingestion/schema.sql`):
- `workouts` — Strava activities + manual entries
- `nutrition` — food log entries (manual, Telegram, photo)

Two tables being added (Garmin integration):
- `garmin_daily_snapshots` — steps, sleep, body battery, HRV per day
- `garmin_performance` — VO2max, training readiness, race predictions per day

---

## Deployment

Deployed on Vercel. Push to `main` triggers a production deploy.

See `CLAUDE.md` for full architecture notes and coding rules.
