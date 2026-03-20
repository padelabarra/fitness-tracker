# Fitness Tracker — Claude Code Instructions

## Project Overview
Marathon training dashboard. Strava auto-ingestion + manual food logging.
Dashboard in Next.js 15. Data in Supabase.

## Tech Stack
- Frontend: Next.js 15 (App Router) + Tailwind + shadcn/ui + Recharts
- Database: Supabase (PostgreSQL), RLS disabled (single-user v1)
- Ingestion: Python 3.11 + requests (Strava API) + supabase-py
- Deploy: Vercel

## Database Schema
Two tables: `workouts` and `nutrition`. See ingestion/schema.sql.

## Key Rules
- Always use TypeScript with strict types
- Use supabase client from lib/supabase.ts — never instantiate directly
- All charts use Recharts (Client Components)
- shadcn/ui for all UI components
- Mobile-first responsive design
- No hardcoded credentials — always use env vars
- Server Components query Supabase directly (no API round-trip)
- user_id is always "default" in v1

## Marathon Context
User is training for a marathon on September 6, 2026.
Training started March 16, 2026. 26-week plan, 4 phases.

## Python
Use /opt/anaconda3/bin/python3 (not /usr/bin/python3)

## Commands
- `npm run dev` — local dev
- `npm run test:run` — unit tests (vitest)
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py` — manual Strava sync
- `/opt/anaconda3/bin/python3 ingestion/strava_sync.py --full` — 90-day backfill
