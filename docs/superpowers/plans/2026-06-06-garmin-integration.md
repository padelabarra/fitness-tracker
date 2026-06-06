# Garmin Connect Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full Garmin biometric integration — daily snapshot sync (steps, sleep, body battery, HRV), performance metrics (VO2max, training readiness, race predictions), and three new UI pages — while keeping all Garmin API calls server-side and auto-syncing via GitHub Actions.

**Architecture:** Python `garmin_biometrics_sync.py` runs daily at 07:00 UTC via GitHub Actions, upserts into two new Supabase tables (`garmin_daily_snapshots`, `garmin_performance`). Next.js server components read exclusively from Supabase — no client-side Garmin calls. Garmin MCP is configured separately for Claude live-access in sessions; the app never uses it.

**Tech Stack:** Python 3.11 + `garminconnect` (already in repo), Supabase upsert with `on_conflict`, Next.js 15 Server Components, Recharts (existing), lucide-react (existing), GitHub Actions `workflow_dispatch`, `lib/garmin-queries.ts` following the pattern of `lib/queries.ts`.

**Spec:** `docs/superpowers/specs/2026-06-06-garmin-integration-design.md`

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| Modify | `ingestion/schema.sql` | Add DDL for 2 new tables |
| Modify | `lib/supabase.ts` | Add `GarminDailySnapshot` + `GarminPerformance` types |
| Create | `lib/garmin-queries.ts` | Supabase query functions for Garmin tables |
| Modify | `lib/utils.ts` | Add `formatSecondsAsTime` + `formatPaceFromSeconds` helpers |
| Create | `ingestion/garmin_biometrics_sync.py` | Python sync script (core pipeline) |
| Modify | `ingestion/requirements.txt` | Pin `garminconnect` version |
| Create | `ingestion/tests/test_garmin_biometrics_sync.py` | Python unit tests for pure functions |
| Create | `.github/workflows/garmin-biometrics.yml` | Daily GH Actions cron + workflow_dispatch |
| Create | `app/api/garmin/trigger-sync/route.ts` | API route that fires GitHub workflow_dispatch |
| Create | `components/BiometricsCard.tsx` | Client — steps/sleep/body battery/resting HR + sync button |
| Create | `components/WeeklySummaryWidget.tsx` | Server — weekly stats + Garmin sleep/battery trend |
| Create | `components/VO2MaxChart.tsx` | Client — Recharts area chart of VO2max trend |
| Create | `components/HRVWidget.tsx` | Server — HRV weekly avg + trend arrow |
| Create | `components/TrainingReadinessBadge.tsx` | Server — colored circle with readiness score |
| Create | `components/RacePredictionsTable.tsx` | Server — 5K/Half/Full predictions formatted as pace |
| Create | `components/TrainingLoadBar.tsx` | Server — 7-day training load bar |
| Create | `components/ActivityFeed.tsx` | Client — filterable, expandable activity list |
| Modify | `app/(dashboard)/page.tsx` | Add BiometricsCard + WeeklySummaryWidget (Pedro only) |
| Create | `app/(dashboard)/performance/page.tsx` | Performance page (Pedro only) |
| Create | `app/(dashboard)/activities/page.tsx` | Activities feed page (all users) |
| Create | `app/(dashboard)/insights/page.tsx` | Nutrition × training correlation (stretch) |
| Create | `components/InsightsChart.tsx` | Client — combo charts for insights page |
| Modify | `app/(dashboard)/layout.tsx` | Add Activities + Performance nav links |
| Modify | `__tests__/utils.test.ts` | Tests for new time-formatting utils |
| Modify | `ingestion/schema.sql` | (same as first row — kept for reference) |
| Modify | `CLAUDE.md` | Remove "in-progress" tags as features ship |

---

## Phase 1 — Database & Types

### Task 1: Supabase Schema DDL

**Files:**
- Modify: `ingestion/schema.sql`
- Run: Supabase SQL Editor (Dashboard → SQL Editor)

- [ ] **Step 1: Append DDL to `ingestion/schema.sql`**

Add the following block at the end of `ingestion/schema.sql`:

```sql
-- garmin_daily_snapshots: one row per user per calendar day
CREATE TABLE garmin_daily_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  steps INTEGER,
  resting_hr INTEGER,
  sleep_score INTEGER,
  sleep_duration_min INTEGER,
  body_battery_end INTEGER,
  stress_avg INTEGER,
  calories_active INTEGER,
  hrv_last_night NUMERIC,
  raw_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX garmin_daily_snapshots_user_date_idx
  ON garmin_daily_snapshots(user_id, date);

-- garmin_performance: one row per user per day (updates when Garmin recomputes)
CREATE TABLE garmin_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  date DATE NOT NULL,
  vo2max NUMERIC,
  hrv_weekly_avg NUMERIC,
  training_readiness INTEGER,
  training_load_7d NUMERIC,
  race_pred_5k_sec INTEGER,
  race_pred_half_sec INTEGER,
  race_pred_marathon_sec INTEGER,
  raw_json JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, date)
);

CREATE INDEX garmin_performance_user_date_idx
  ON garmin_performance(user_id, date);
```

- [ ] **Step 2: Run DDL in Supabase SQL Editor**

Go to Supabase Dashboard → SQL Editor, paste the SQL above, and run it.

Verify in the Table Editor that `garmin_daily_snapshots` and `garmin_performance` appear with the correct columns.

- [ ] **Step 3: Commit schema file**

```bash
git add ingestion/schema.sql
git commit -m "feat: add garmin_daily_snapshots and garmin_performance tables"
```

---

### Task 2: TypeScript Types

**Files:**
- Modify: `lib/supabase.ts`

- [ ] **Step 1: Add Garmin types to `lib/supabase.ts`**

Open `lib/supabase.ts` and add the following two interfaces after the `NutritionEntry` interface (before the `const supabaseUrl` line):

```typescript
export interface GarminDailySnapshot {
  id: string
  user_id: string
  date: string             // ISO date YYYY-MM-DD
  steps: number | null
  resting_hr: number | null
  sleep_score: number | null
  sleep_duration_min: number | null
  body_battery_end: number | null
  stress_avg: number | null
  calories_active: number | null
  hrv_last_night: number | null
  raw_json: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface GarminPerformance {
  id: string
  user_id: string
  date: string
  vo2max: number | null
  hrv_weekly_avg: number | null
  training_readiness: number | null
  training_load_7d: number | null
  race_pred_5k_sec: number | null
  race_pred_half_sec: number | null
  race_pred_marathon_sec: number | null
  raw_json: Record<string, unknown>
  created_at: string
  updated_at: string
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/supabase.ts
git commit -m "feat: add GarminDailySnapshot and GarminPerformance TypeScript types"
```

---

### Task 3: Utility Functions for Time Formatting

**Files:**
- Modify: `lib/utils.ts`
- Modify: `__tests__/utils.test.ts`

These are needed by `RacePredictionsTable` and must be tested before the component uses them.

- [ ] **Step 1: Write failing tests in `__tests__/utils.test.ts`**

Add this block at the end of the existing test file:

```typescript
import { formatSecondsAsTime, formatPaceFromSeconds } from '@/lib/utils'

describe('formatSecondsAsTime', () => {
  it('formats sub-hour as mm:ss', () => {
    expect(formatSecondsAsTime(305)).toBe('5:05')
  })
  it('formats hours correctly', () => {
    expect(formatSecondsAsTime(3723)).toBe('1:02:03')
  })
  it('returns — for null', () => {
    expect(formatSecondsAsTime(null)).toBe('—')
  })
})

describe('formatPaceFromSeconds', () => {
  it('calculates pace per km correctly for 5K', () => {
    // 1200 seconds / 5 km = 240 sec/km = 4:00/km
    expect(formatPaceFromSeconds(1200, 5)).toBe('4:00/km')
  })
  it('returns — for null', () => {
    expect(formatPaceFromSeconds(null, 5)).toBe('—')
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npm run test:run
```

Expected: FAIL — `formatSecondsAsTime` and `formatPaceFromSeconds` not found in utils.

- [ ] **Step 3: Add the functions to `lib/utils.ts`**

Add these two exported functions at the end of `lib/utils.ts`:

```typescript
export function formatSecondsAsTime(seconds: number | null): string {
  if (seconds === null) return '—'
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatPaceFromSeconds(totalSec: number | null, distanceKm: number): string {
  if (!totalSec) return '—'
  const secPerKm = totalSec / distanceKm
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')}/km`
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/utils.ts __tests__/utils.test.ts
git commit -m "feat: add formatSecondsAsTime and formatPaceFromSeconds utils"
```

---

### Task 4: Garmin Queries Library

**Files:**
- Create: `lib/garmin-queries.ts`

- [ ] **Step 1: Create `lib/garmin-queries.ts`**

```typescript
import 'server-only'
import { supabase, type GarminDailySnapshot, type GarminPerformance } from './supabase'

export async function getLatestDailySnapshot(userId: string): Promise<GarminDailySnapshot | null> {
  const { data, error } = await supabase
    .from('garmin_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestDailySnapshot: ${error.message}`)
  return data
}

export async function getDailySnapshots(userId: string, days: number): Promise<GarminDailySnapshot[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('garmin_daily_snapshots')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })
  if (error) throw new Error(`getDailySnapshots: ${error.message}`)
  return data ?? []
}

export async function getLatestPerformance(userId: string): Promise<GarminPerformance | null> {
  const { data, error } = await supabase
    .from('garmin_performance')
    .select('*')
    .eq('user_id', userId)
    .order('date', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw new Error(`getLatestPerformance: ${error.message}`)
  return data
}

export async function getPerformanceTrend(userId: string, days: number): Promise<GarminPerformance[]> {
  const since = new Date()
  since.setDate(since.getDate() - days)
  const sinceStr = since.toISOString().split('T')[0]
  const { data, error } = await supabase
    .from('garmin_performance')
    .select('*')
    .eq('user_id', userId)
    .gte('date', sinceStr)
    .order('date', { ascending: true })
  if (error) throw new Error(`getPerformanceTrend: ${error.message}`)
  return data ?? []
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/garmin-queries.ts
git commit -m "feat: add garmin-queries lib (getLatestDailySnapshot, getLatestPerformance, trend queries)"
```

---

## Phase 2 — Data Pipeline

### Task 5: Python Sync Script

**Files:**
- Create: `ingestion/garmin_biometrics_sync.py`
- Create: `ingestion/tests/test_garmin_biometrics_sync.py`
- Modify: `ingestion/requirements.txt`

- [ ] **Step 1: Pin `garminconnect` in `ingestion/requirements.txt`**

Open `ingestion/requirements.txt` and add:

```
garminconnect==0.2.22
```

(This version was previously used in `garmin_sync.py` before the Strava migration.)

Install locally:
```bash
/opt/anaconda3/bin/pip install garminconnect==0.2.22
```

- [ ] **Step 2: Write failing tests in `ingestion/tests/test_garmin_biometrics_sync.py`**

```python
import pytest
import sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))

from garmin_biometrics_sync import fetch_daily_snapshot, fetch_performance


class MockGarmin:
    def get_stats(self, date_str):
        return {
            'totalSteps': 8500,
            'restingHeartRate': 52,
            'activeKilocalories': 400,
            'averageStressLevel': 30,
        }

    def get_sleep_data(self, date_str):
        return {
            'dailySleepDTO': {
                'sleepTimeSeconds': 27000,
                'sleepScores': {'overall': {'value': 75}},
            }
        }

    def get_hrv_data(self, date_str):
        return {'hrvSummary': {'lastNight': 48.5}}

    def get_body_battery(self, start, end):
        return [{'bodyBatteryStatList': [
            {'bodyBatteryLevel': 80},
            {'bodyBatteryLevel': 42},
        ]}]

    def get_max_metrics(self, date_str):
        return [{'generic': {'vo2MaxPreciseValue': 51.0}}]

    def get_training_readiness(self, date_str):
        return [{'score': 72}]

    def get_training_status(self, start, end):
        return [{'acuteTrainingLoad': 280.5, 'hrvWeeklyAverage': 49.2}]

    def get_race_predictions(self):
        return {'time5K': 1320, 'timeHalfMarathon': 5580, 'timeMarathon': 11700}


class FailingGarmin(MockGarmin):
    def get_sleep_data(self, date_str):
        raise Exception("Rate limited")

    def get_hrv_data(self, date_str):
        raise Exception("Network error")


def test_snapshot_steps():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['steps'] == 8500


def test_snapshot_resting_hr():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['resting_hr'] == 52


def test_snapshot_sleep_duration_minutes():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['sleep_duration_min'] == 450  # 27000 / 60


def test_snapshot_sleep_score():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['sleep_score'] == 75


def test_snapshot_hrv_last_night():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['hrv_last_night'] == 48.5


def test_snapshot_body_battery_takes_last_entry():
    result = fetch_daily_snapshot(MockGarmin(), '2026-06-01')
    assert result['body_battery_end'] == 42  # last in stat list


def test_snapshot_partial_failure_still_returns_available_data():
    result = fetch_daily_snapshot(FailingGarmin(), '2026-06-01')
    assert result['steps'] == 8500          # stats still succeeded
    assert result.get('sleep_score') is None  # sleep failed gracefully


def test_performance_vo2max():
    result = fetch_performance(MockGarmin(), '2026-06-01')
    assert result['vo2max'] == 51.0


def test_performance_training_readiness():
    result = fetch_performance(MockGarmin(), '2026-06-01')
    assert result['training_readiness'] == 72


def test_performance_training_load():
    result = fetch_performance(MockGarmin(), '2026-06-01')
    assert result['training_load_7d'] == 280.5


def test_performance_hrv_weekly_avg():
    result = fetch_performance(MockGarmin(), '2026-06-01')
    assert result['hrv_weekly_avg'] == 49.2


def test_performance_race_predictions():
    result = fetch_performance(MockGarmin(), '2026-06-01')
    assert result['race_pred_5k_sec'] == 1320
    assert result['race_pred_half_sec'] == 5580
    assert result['race_pred_marathon_sec'] == 11700
```

- [ ] **Step 3: Run tests — confirm they fail**

```bash
/opt/anaconda3/bin/python3 -m pytest ingestion/tests/test_garmin_biometrics_sync.py -v
```

Expected: `ImportError: cannot import name 'fetch_daily_snapshot'` (file doesn't exist yet).

- [ ] **Step 4: Create `ingestion/garmin_biometrics_sync.py`**

```python
#!/usr/bin/env python3
"""
Garmin Connect → Supabase biometrics sync script.

Usage:
  python garmin_biometrics_sync.py                     # today
  python garmin_biometrics_sync.py --date 2026-06-01   # specific date
  python garmin_biometrics_sync.py --backfill 30        # last 30 days
"""

import argparse
import logging
import os
from datetime import date, timedelta

from dotenv import load_dotenv

load_dotenv()
logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)


def _require_env(name: str) -> str:
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


def fetch_daily_snapshot(garmin, date_str: str) -> dict:
    """Fetch all daily snapshot fields for a date. Each source is wrapped
    independently — failures log a warning and return None for those fields."""
    snapshot: dict = {}
    raw: dict = {}

    try:
        stats = garmin.get_stats(date_str)
        snapshot.update({
            'steps': stats.get('totalSteps'),
            'resting_hr': stats.get('restingHeartRate'),
            'calories_active': stats.get('activeKilocalories'),
            'stress_avg': stats.get('averageStressLevel'),
        })
        raw['stats'] = stats
    except Exception as e:
        logger.warning(f"Daily stats failed for {date_str}: {e}")

    try:
        sleep = garmin.get_sleep_data(date_str)
        dto = (sleep.get('dailySleepDTO') or {})
        sleep_seconds = dto.get('sleepTimeSeconds') or 0
        scores = dto.get('sleepScores') or {}
        overall = scores.get('overall')
        score_val = overall.get('value') if isinstance(overall, dict) else overall
        snapshot.update({
            'sleep_score': score_val,
            'sleep_duration_min': round(sleep_seconds / 60) if sleep_seconds else None,
        })
        raw['sleep'] = sleep
    except Exception as e:
        logger.warning(f"Sleep data failed for {date_str}: {e}")

    try:
        hrv = garmin.get_hrv_data(date_str)
        hrv_summary = hrv.get('hrvSummary') or {}
        snapshot['hrv_last_night'] = hrv_summary.get('lastNight')
        raw['hrv'] = hrv
    except Exception as e:
        logger.warning(f"HRV data failed for {date_str}: {e}")

    try:
        bb_data = garmin.get_body_battery(date_str, date_str)
        if bb_data:
            for entry in reversed(bb_data):
                stat_list = entry.get('bodyBatteryStatList') or []
                if stat_list:
                    snapshot['body_battery_end'] = stat_list[-1].get('bodyBatteryLevel')
                    break
        raw['body_battery'] = bb_data
    except Exception as e:
        logger.warning(f"Body battery failed for {date_str}: {e}")

    snapshot['raw_json'] = raw
    return snapshot


def fetch_performance(garmin, date_str: str) -> dict:
    """Fetch performance metrics for a date. Each source wrapped independently."""
    perf: dict = {}
    raw: dict = {}

    try:
        metrics = garmin.get_max_metrics(date_str)
        if isinstance(metrics, list) and metrics:
            metrics = metrics[0]
        generic = metrics.get('generic') or {} if isinstance(metrics, dict) else {}
        perf['vo2max'] = generic.get('vo2MaxPreciseValue')
        raw['max_metrics'] = metrics
    except Exception as e:
        logger.warning(f"VO2max failed for {date_str}: {e}")

    try:
        readiness = garmin.get_training_readiness(date_str)
        if isinstance(readiness, list) and readiness:
            readiness = readiness[0]
        perf['training_readiness'] = readiness.get('score') if isinstance(readiness, dict) else None
        raw['training_readiness'] = readiness
    except Exception as e:
        logger.warning(f"Training readiness failed for {date_str}: {e}")

    try:
        status = garmin.get_training_status(date_str, date_str)
        if isinstance(status, list) and status:
            status = status[0]
        if isinstance(status, dict):
            perf['training_load_7d'] = status.get('acuteTrainingLoad') or status.get('trainingLoad7Days')
            perf['hrv_weekly_avg'] = status.get('hrvWeeklyAverage')
        raw['training_status'] = status
    except Exception as e:
        logger.warning(f"Training status failed for {date_str}: {e}")

    try:
        pred = garmin.get_race_predictions()
        if isinstance(pred, dict):
            perf['race_pred_5k_sec'] = pred.get('time5K')
            perf['race_pred_half_sec'] = pred.get('timeHalfMarathon')
            perf['race_pred_marathon_sec'] = pred.get('timeMarathon')
        raw['race_predictions'] = pred
    except Exception as e:
        logger.warning(f"Race predictions failed: {e}")

    perf['raw_json'] = raw
    return perf


def sync_date(garmin, sb, user_id: str, date_str: str) -> dict:
    synced = {'snapshot': False, 'performance': False}

    snapshot = fetch_daily_snapshot(garmin, date_str)
    has_snapshot_data = any(
        v is not None for k, v in snapshot.items() if k != 'raw_json'
    )
    if has_snapshot_data:
        try:
            sb.table('garmin_daily_snapshots').upsert(
                {'user_id': user_id, 'date': date_str, **snapshot},
                on_conflict='user_id,date'
            ).execute()
            synced['snapshot'] = True
            logger.info(f"  ✓ Upserted snapshot for {date_str}")
        except Exception as e:
            logger.error(f"  ✗ Snapshot upsert failed for {date_str}: {e}")

    perf = fetch_performance(garmin, date_str)
    has_perf_data = any(
        v is not None for k, v in perf.items() if k != 'raw_json'
    )
    if has_perf_data:
        try:
            sb.table('garmin_performance').upsert(
                {'user_id': user_id, 'date': date_str, **perf},
                on_conflict='user_id,date'
            ).execute()
            synced['performance'] = True
            logger.info(f"  ✓ Upserted performance for {date_str}")
        except Exception as e:
            logger.error(f"  ✗ Performance upsert failed for {date_str}: {e}")

    return synced


def main() -> None:
    parser = argparse.ArgumentParser(description="Sync Garmin biometrics to Supabase")
    group = parser.add_mutually_exclusive_group()
    group.add_argument('--date', help='Specific date to sync (YYYY-MM-DD)')
    group.add_argument('--backfill', type=int, metavar='DAYS', help='Sync last N days')
    args = parser.parse_args()

    garmin_email = _require_env('GARMIN_EMAIL')
    garmin_password = _require_env('GARMIN_PASSWORD')
    supabase_url = _require_env('SUPABASE_URL')
    supabase_key = _require_env('SUPABASE_ANON_KEY')
    user_id = _require_env('USER1_ID')

    import garminconnect
    from supabase import create_client

    logger.info("Authenticating with Garmin Connect...")
    garmin = garminconnect.Garmin(garmin_email, garmin_password)
    garmin.login()
    logger.info("Authenticated.")

    sb = create_client(supabase_url, supabase_key)

    if args.backfill:
        dates = [
            (date.today() - timedelta(days=i)).isoformat()
            for i in range(args.backfill - 1, -1, -1)
        ]
        logger.info(f"Backfill: {len(dates)} days ({dates[0]} → {dates[-1]})")
    elif args.date:
        dates = [args.date]
    else:
        dates = [date.today().isoformat()]
        logger.info(f"Syncing today: {dates[0]}")

    total_snap, total_perf = 0, 0
    for date_str in dates:
        logger.info(f"Syncing {date_str}...")
        result = sync_date(garmin, sb, user_id, date_str)
        if result['snapshot']:
            total_snap += 1
        if result['performance']:
            total_perf += 1

    logger.info(
        f"Done. {total_snap}/{len(dates)} snapshots, {total_perf}/{len(dates)} performance records."
    )


if __name__ == '__main__':
    main()
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
/opt/anaconda3/bin/python3 -m pytest ingestion/tests/test_garmin_biometrics_sync.py -v
```

Expected: all 12 tests PASS.

- [ ] **Step 6: Commit**

```bash
git add ingestion/garmin_biometrics_sync.py ingestion/tests/test_garmin_biometrics_sync.py ingestion/requirements.txt
git commit -m "feat: add garmin_biometrics_sync.py with unit tests"
```

---

### Task 6: GitHub Actions Workflow

**Files:**
- Create: `.github/workflows/garmin-biometrics.yml`

- [ ] **Step 1: Create `.github/workflows/garmin-biometrics.yml`**

```yaml
name: Garmin Biometrics Sync

on:
  schedule:
    - cron: '0 7 * * *'   # daily at 07:00 UTC
  workflow_dispatch:
    inputs:
      date:
        description: 'Date to sync (YYYY-MM-DD). Leave empty for today.'
        required: false
        default: ''

jobs:
  sync:
    runs-on: ubuntu-latest
    env:
      FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: true
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.11'
          cache: 'pip'
          cache-dependency-path: ingestion/requirements.txt

      - name: Install dependencies
        run: pip install -r ingestion/requirements.txt

      - name: Run Garmin biometrics sync
        run: |
          if [ -n "${{ github.event.inputs.date }}" ]; then
            python3 ingestion/garmin_biometrics_sync.py --date "${{ github.event.inputs.date }}"
          else
            python3 ingestion/garmin_biometrics_sync.py
          fi
        env:
          GARMIN_EMAIL: ${{ secrets.GARMIN_EMAIL }}
          GARMIN_PASSWORD: ${{ secrets.GARMIN_PASSWORD }}
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}
          USER1_ID: ${{ secrets.USER1_ID }}
```

- [ ] **Step 2: Add GitHub Secrets**

In the GitHub repository settings (Settings → Secrets and variables → Actions), add:
- `GARMIN_EMAIL` — your Garmin Connect email
- `GARMIN_PASSWORD` — your Garmin Connect password
- `USER1_ID` — `pedro` (if not already present)

`SUPABASE_URL` and `SUPABASE_ANON_KEY` should already be there from the Strava workflow.

- [ ] **Step 3: Test via workflow_dispatch**

In GitHub → Actions → Garmin Biometrics Sync → Run workflow (leave date empty). Check the run log for authentication and upsert confirmation.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/garmin-biometrics.yml
git commit -m "feat: add garmin-biometrics GitHub Actions workflow (daily 07:00 UTC)"
```

---

## Phase 3 — API

### Task 7: Trigger Sync API Route

**Files:**
- Create: `app/api/garmin/trigger-sync/route.ts`

- [ ] **Step 1: Add env vars to `.env.local`**

Open `.env.local` and add (values from GitHub):

```
GITHUB_TOKEN=ghp_your_personal_access_token_with_workflow_scope
GITHUB_REPO=padelabarra/fitness-tracker
```

Create the PAT at GitHub → Settings → Developer settings → Personal access tokens → Fine-grained tokens. Required permission: Actions (Read and write).

- [ ] **Step 2: Create `app/api/garmin/trigger-sync/route.ts`**

```typescript
import { NextResponse } from 'next/server'
import { auth } from '@/auth'

const GARMIN_USER_ID = 'pedro'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id || session.user.id !== GARMIN_USER_ID) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const token = process.env.GITHUB_TOKEN
  const repo = process.env.GITHUB_REPO
  if (!token || !repo) {
    return NextResponse.json({ error: 'GitHub credentials not configured' }, { status: 500 })
  }

  const res = await fetch(
    `https://api.github.com/repos/${repo}/actions/workflows/garmin-biometrics.yml/dispatches`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({ ref: 'main' }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    console.error('GitHub dispatch failed:', res.status, body)
    return NextResponse.json({ error: 'Failed to trigger sync' }, { status: 502 })
  }

  return NextResponse.json({ triggered: true })
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Manual test**

With `npm run dev` running, log in as Pedro and run:

```bash
curl -X POST http://localhost:3000/api/garmin/trigger-sync \
  -H "Cookie: $(cat /tmp/session_cookie)"
```

Or use the browser dev tools to fire a POST from the console. Expected response: `{"triggered":true}` and a new workflow run appearing in GitHub Actions.

- [ ] **Step 5: Commit**

```bash
git add app/api/garmin/trigger-sync/route.ts
git commit -m "feat: add /api/garmin/trigger-sync route (Pedro only, fires GH workflow_dispatch)"
```

---

## Phase 4 — UI Components

### Task 8: BiometricsCard Component

**Files:**
- Create: `components/BiometricsCard.tsx`

- [ ] **Step 1: Create `components/BiometricsCard.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { GarminDailySnapshot } from '@/lib/supabase'

interface BiometricsCardProps {
  snapshot: GarminDailySnapshot | null
  isToday: boolean
}

function formatLastSynced(updatedAt: string): string {
  const diffMs = Date.now() - new Date(updatedAt).getTime()
  const hours = Math.floor(diffMs / 3_600_000)
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000)
  if (hours > 0) return `${hours}h ago`
  return `${minutes}m ago`
}

function formatSleepDuration(minutes: number | null): string {
  if (!minutes) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}h ${m}min`
}

function batteryColor(v: number): string {
  if (v >= 75) return 'text-green-400'
  if (v >= 50) return 'text-yellow-400'
  if (v >= 25) return 'text-orange-400'
  return 'text-red-400'
}

export function BiometricsCard({ snapshot, isToday }: BiometricsCardProps) {
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [syncTriggered, setSyncTriggered] = useState(false)

  async function handleSync() {
    setSyncing(true)
    setSyncError(null)
    try {
      const res = await fetch('/api/garmin/trigger-sync', { method: 'POST' })
      if (!res.ok) throw new Error()
      setSyncTriggered(true)
    } catch {
      setSyncError('Sync trigger failed — try again')
    } finally {
      setSyncing(false)
    }
  }

  const steps = snapshot?.steps ?? null
  const stepsPercent = steps ? Math.min(100, Math.round((steps / 10_000) * 100)) : 0
  const bb = snapshot?.body_battery_end ?? null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-zinc-500 uppercase tracking-wider">Garmin Biometrics</p>
        <div className="flex items-center gap-3">
          {snapshot && (
            <span className="text-xs text-zinc-600">
              {isToday
                ? `Synced ${formatLastSynced(snapshot.updated_at)}`
                : `Data from ${snapshot.date}`}
            </span>
          )}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="text-xs text-zinc-400 hover:text-zinc-200 disabled:opacity-50 transition-colors"
          >
            {syncing ? 'Triggering…' : syncTriggered ? '✓ Queued' : '↻ Sync'}
          </button>
        </div>
      </div>

      {syncError && (
        <p className="text-xs text-red-400 mb-2">{syncError}</p>
      )}

      {!snapshot ? (
        <p className="text-sm text-zinc-500">No data yet — sync pending</p>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* Steps */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Steps</p>
            <p className="text-xl font-semibold tabular-nums">
              {steps?.toLocaleString() ?? '—'}
            </p>
            <div className="mt-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 rounded-full"
                style={{ width: `${stepsPercent}%` }}
              />
            </div>
            <p className="text-xs text-zinc-600 mt-0.5">{stepsPercent}% of 10k</p>
          </div>

          {/* Resting HR */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Resting HR</p>
            <div className="flex items-baseline gap-1">
              <span className="text-xl font-semibold tabular-nums">
                {snapshot.resting_hr ?? '—'}
              </span>
              {snapshot.resting_hr && (
                <span className="text-sm text-zinc-400">bpm</span>
              )}
            </div>
          </div>

          {/* Body Battery */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Body Battery</p>
            <div className="flex items-baseline gap-1">
              <span className={`text-xl font-semibold tabular-nums ${bb !== null ? batteryColor(bb) : 'text-zinc-400'}`}>
                {bb ?? '—'}
              </span>
              {bb !== null && <span className="text-sm text-zinc-500">/100</span>}
            </div>
          </div>

          {/* Sleep */}
          <div>
            <p className="text-xs text-zinc-500 mb-1">Sleep</p>
            <p className="text-xl font-semibold tabular-nums">
              {snapshot.sleep_score ?? '—'}
            </p>
            <p className="text-xs text-zinc-500">
              {formatSleepDuration(snapshot.sleep_duration_min)}
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/BiometricsCard.tsx
git commit -m "feat: add BiometricsCard component (steps, resting HR, body battery, sleep + sync button)"
```

---

### Task 9: WeeklySummaryWidget Component

**Files:**
- Create: `components/WeeklySummaryWidget.tsx`

- [ ] **Step 1: Create `components/WeeklySummaryWidget.tsx`**

```typescript
import type { GarminDailySnapshot } from '@/lib/supabase'

interface WeeklySummaryWidgetProps {
  totalKm: number
  activeMinutes: number
  snapshots: GarminDailySnapshot[]   // may be empty for non-Garmin users
}

export function WeeklySummaryWidget({ totalKm, activeMinutes, snapshots }: WeeklySummaryWidgetProps) {
  const sleepSnaps = snapshots.filter(s => s.sleep_score !== null)
  const avgSleepScore = sleepSnaps.length > 0
    ? Math.round(sleepSnaps.reduce((sum, s) => sum + (s.sleep_score ?? 0), 0) / sleepSnaps.length)
    : null

  const bbSnaps = snapshots.filter(s => s.body_battery_end !== null)
  const firstBB = bbSnaps[0]?.body_battery_end ?? null
  const lastBB = bbSnaps[bbSnaps.length - 1]?.body_battery_end ?? null
  const batteryDiff = firstBB !== null && lastBB !== null ? lastBB - firstBB : null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mt-4">
      <h2 className="text-sm font-medium text-zinc-400 mb-3">Weekly Summary</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <p className="text-xs text-zinc-500">Distance</p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold">{totalKm}</span>
            <span className="text-sm text-zinc-400">km</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Active</p>
          <div className="flex items-baseline gap-1">
            <span className="text-lg font-semibold">{activeMinutes}</span>
            <span className="text-sm text-zinc-400">min</span>
          </div>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Avg Sleep</p>
          <span className="text-lg font-semibold">{avgSleepScore ?? '—'}</span>
        </div>
        <div>
          <p className="text-xs text-zinc-500">Battery trend</p>
          {batteryDiff !== null ? (
            <p className={`text-lg font-semibold ${batteryDiff >= 0 ? 'text-green-400' : 'text-red-400'}`}>
              {batteryDiff >= 0 ? '↑' : '↓'} {Math.abs(batteryDiff)}
            </p>
          ) : (
            <span className="text-lg font-semibold text-zinc-500">—</span>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add components/WeeklySummaryWidget.tsx
git commit -m "feat: add WeeklySummaryWidget (distance, active minutes, avg sleep, body battery trend)"
```

---

### Task 10: Overview Page — Add Biometrics and Weekly Summary

**Files:**
- Modify: `app/(dashboard)/page.tsx`

- [ ] **Step 1: Update imports in `app/(dashboard)/page.tsx`**

Add these imports at the top of the file, after existing imports:

```typescript
import { getLatestDailySnapshot, getDailySnapshots } from '@/lib/garmin-queries'
import { BiometricsCard } from '@/components/BiometricsCard'
import { WeeklySummaryWidget } from '@/components/WeeklySummaryWidget'

const GARMIN_USER_ID = 'pedro'
```

- [ ] **Step 2: Update the data fetching in the page component**

Find the existing `Promise.all` call:

```typescript
const [stats, nutritionEntries, workouts] = await Promise.all([
  getWeekStats(userId, monday),
  getNutritionForRange(monday, sunday, userId),
  getWorkoutsForRange(monday, sunday, userId),
])
```

Replace it with:

```typescript
const isPedro = userId === GARMIN_USER_ID
const [stats, nutritionEntries, workouts, latestSnapshot, weekSnapshots] = await Promise.all([
  getWeekStats(userId, monday),
  getNutritionForRange(monday, sunday, userId),
  getWorkoutsForRange(monday, sunday, userId),
  isPedro ? getLatestDailySnapshot(userId) : Promise.resolve(null),
  isPedro ? getDailySnapshots(userId, 7) : Promise.resolve([]),
])

const today = toISODate(new Date())
const isSnapshotToday = latestSnapshot?.date === today
```

- [ ] **Step 3: Add BiometricsCard and WeeklySummaryWidget to the JSX**

In the returned JSX, after the closing `</div>` of the `<div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">` block that contains `<WeeklyChart data={chartData} />`, add:

```tsx
{isPedro && (
  <div className="mt-4">
    <BiometricsCard snapshot={latestSnapshot} isToday={isSnapshotToday} />
  </div>
)}

<WeeklySummaryWidget
  totalKm={stats.kmThisWeek}
  activeMinutes={stats.activeMinutes}
  snapshots={weekSnapshots}
/>
```

- [ ] **Step 4: Type-check and verify**

```bash
npx tsc --noEmit
```

Start dev server and visit `http://localhost:3000` logged in as Pedro. Should see the BiometricsCard below the chart (may show "No data yet" until first sync runs). Renatta should see the page without the BiometricsCard.

- [ ] **Step 5: Commit**

```bash
git add "app/(dashboard)/page.tsx"
git commit -m "feat: add BiometricsCard and WeeklySummaryWidget to overview page (Pedro only for biometrics)"
```

---

### Task 11: Performance Page Components

**Files:**
- Create: `components/VO2MaxChart.tsx`
- Create: `components/TrainingReadinessBadge.tsx`
- Create: `components/HRVWidget.tsx`
- Create: `components/RacePredictionsTable.tsx`
- Create: `components/TrainingLoadBar.tsx`

- [ ] **Step 1: Create `components/VO2MaxChart.tsx`**

```typescript
'use client'

import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import type { GarminPerformance } from '@/lib/supabase'

interface VO2MaxChartProps {
  data: Pick<GarminPerformance, 'date' | 'vo2max'>[]
}

export function VO2MaxChart({ data }: VO2MaxChartProps) {
  const chartData = data
    .filter(d => d.vo2max !== null)
    .map(d => ({ date: d.date.slice(5), vo2max: d.vo2max }))

  if (chartData.length === 0) {
    return (
      <div className="h-48 flex items-center justify-center text-zinc-500 text-sm">
        No VO2max data yet
      </div>
    )
  }

  return (
    <div className="h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData}>
          <defs>
            <linearGradient id="vo2Grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} />
          <YAxis
            domain={['dataMin - 1', 'dataMax + 1']}
            tick={{ fontSize: 11, fill: '#71717a' }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            contentStyle={{ background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 }}
            labelStyle={{ color: '#a1a1aa' }}
            formatter={(v: number) => [`${v} ml/kg/min`, 'VO2max']}
          />
          <Area
            type="monotone"
            dataKey="vo2max"
            stroke="#3b82f6"
            fill="url(#vo2Grad)"
            strokeWidth={2}
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
```

- [ ] **Step 2: Create `components/TrainingReadinessBadge.tsx`**

```typescript
interface TrainingReadinessBadgeProps {
  score: number | null
}

export function TrainingReadinessBadge({ score }: TrainingReadinessBadgeProps) {
  if (score === null) {
    return (
      <div className="flex flex-col items-center">
        <div className="w-24 h-24 rounded-full border-4 border-zinc-700 flex items-center justify-center">
          <span className="text-zinc-500 text-2xl font-semibold">—</span>
        </div>
        <p className="text-xs text-zinc-500 mt-2">No data</p>
      </div>
    )
  }

  const { ring, text, label } = score >= 70
    ? { ring: 'border-green-500', text: 'text-green-400', label: 'Good' }
    : score >= 40
    ? { ring: 'border-yellow-500', text: 'text-yellow-400', label: 'Moderate' }
    : { ring: 'border-red-500', text: 'text-red-400', label: 'Low' }

  return (
    <div className="flex flex-col items-center">
      <div className={`w-24 h-24 rounded-full border-4 ${ring} flex items-center justify-center`}>
        <span className={`text-3xl font-bold ${text}`}>{score}</span>
      </div>
      <p className="text-xs text-zinc-400 mt-2">{label}</p>
    </div>
  )
}
```

- [ ] **Step 3: Create `components/HRVWidget.tsx`**

```typescript
interface HRVWidgetProps {
  current: number | null
  previous: number | null   // previous week's avg for trend arrow
}

export function HRVWidget({ current, previous }: HRVWidgetProps) {
  const diff = current !== null && previous !== null ? current - previous : null
  const trendColor = diff === null ? '' : diff > 0 ? 'text-green-400' : 'text-red-400'
  const arrow = diff !== null ? (diff > 0 ? '↑' : '↓') : null

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-2">HRV Weekly Avg</p>
      <div className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold tabular-nums">{current ?? '—'}</span>
        {current !== null && <span className="text-sm text-zinc-400">ms</span>}
        {diff !== null && arrow && (
          <span className={`text-sm font-medium ${trendColor}`}>
            {arrow} {Math.abs(diff).toFixed(1)}
          </span>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `components/RacePredictionsTable.tsx`**

```typescript
import { formatSecondsAsTime, formatPaceFromSeconds } from '@/lib/utils'

interface RacePredictionsTableProps {
  race5kSec: number | null
  raceHalfSec: number | null
  marathonSec: number | null
}

export function RacePredictionsTable({ race5kSec, raceHalfSec, marathonSec }: RacePredictionsTableProps) {
  const rows = [
    { label: '5K',              sec: race5kSec,    km: 5 },
    { label: 'Half Marathon',   sec: raceHalfSec,  km: 21.0975 },
    { label: 'Marathon',        sec: marathonSec,  km: 42.195 },
  ]

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Race Predictions</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-zinc-500">
            <th className="text-left pb-2">Distance</th>
            <th className="text-right pb-2">Time</th>
            <th className="text-right pb-2">Pace</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-800">
          {rows.map(({ label, sec, km }) => (
            <tr key={label}>
              <td className="py-2 text-zinc-300">{label}</td>
              <td className="py-2 text-right font-mono">{formatSecondsAsTime(sec)}</td>
              <td className="py-2 text-right font-mono text-zinc-400">{formatPaceFromSeconds(sec, km)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
```

- [ ] **Step 5: Create `components/TrainingLoadBar.tsx`**

```typescript
interface TrainingLoadBarProps {
  load7d: number | null
}

function loadLabel(load: number): string {
  if (load < 100) return 'Easy'
  if (load < 300) return 'Moderate'
  if (load < 500) return 'High'
  return 'Very High'
}

function loadColor(load: number): string {
  if (load < 100) return 'bg-blue-500'
  if (load < 300) return 'bg-green-500'
  if (load < 500) return 'bg-yellow-500'
  return 'bg-red-500'
}

export function TrainingLoadBar({ load7d }: TrainingLoadBarProps) {
  const MAX_LOAD = 600
  const pct = load7d !== null ? Math.min(100, Math.round((load7d / MAX_LOAD) * 100)) : 0

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wider">Training Load (7d)</p>
        {load7d !== null && (
          <span className="text-xs text-zinc-400">{loadLabel(load7d)}</span>
        )}
      </div>
      <p className="text-2xl font-semibold tabular-nums mb-2">{load7d ?? '—'}</p>
      <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${load7d !== null ? loadColor(load7d) : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Type-check all new components**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add components/VO2MaxChart.tsx components/TrainingReadinessBadge.tsx components/HRVWidget.tsx components/RacePredictionsTable.tsx components/TrainingLoadBar.tsx
git commit -m "feat: add performance page components (VO2MaxChart, TrainingReadinessBadge, HRVWidget, RacePredictionsTable, TrainingLoadBar)"
```

---

### Task 12: Performance Page

**Files:**
- Create: `app/(dashboard)/performance/page.tsx`

- [ ] **Step 1: Create `app/(dashboard)/performance/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getLatestPerformance, getPerformanceTrend, getDailySnapshots } from '@/lib/garmin-queries'
import { VO2MaxChart } from '@/components/VO2MaxChart'
import { TrainingReadinessBadge } from '@/components/TrainingReadinessBadge'
import { HRVWidget } from '@/components/HRVWidget'
import { RacePredictionsTable } from '@/components/RacePredictionsTable'
import { TrainingLoadBar } from '@/components/TrainingLoadBar'

const GARMIN_USER_ID = 'pedro'

export default async function PerformancePage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  if (session.user.id !== GARMIN_USER_ID) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Performance</h1>
        <p className="text-zinc-500 text-sm">
          Garmin data is not available for this account.
        </p>
      </div>
    )
  }

  const [latest, trend, snapshots] = await Promise.all([
    getLatestPerformance(GARMIN_USER_ID),
    getPerformanceTrend(GARMIN_USER_ID, 90),
    getDailySnapshots(GARMIN_USER_ID, 14),
  ])

  // Build previous-week HRV avg for the trend arrow in HRVWidget
  const prevWeekSnaps = snapshots.slice(0, 7).filter(s => s.hrv_last_night !== null)
  const prevHRVAvg = prevWeekSnaps.length > 0
    ? prevWeekSnaps.reduce((sum, s) => sum + (s.hrv_last_night ?? 0), 0) / prevWeekSnaps.length
    : null

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Performance</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 flex flex-col items-center justify-center">
          <p className="text-xs text-zinc-500 uppercase tracking-wider mb-3">Training Readiness</p>
          <TrainingReadinessBadge score={latest?.training_readiness ?? null} />
        </div>
        <HRVWidget
          current={latest?.hrv_weekly_avg ?? null}
          previous={prevHRVAvg}
        />
        <TrainingLoadBar load7d={latest?.training_load_7d ?? null} />
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4 mb-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">VO2max — last 90 days</h2>
        <VO2MaxChart data={trend} />
      </div>

      <RacePredictionsTable
        race5kSec={latest?.race_pred_5k_sec ?? null}
        raceHalfSec={latest?.race_pred_half_sec ?? null}
        marathonSec={latest?.race_pred_marathon_sec ?? null}
      />
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify in browser**

Visit `http://localhost:3000/performance` as Pedro. Should render all cards with empty/null states until sync runs. As Renatta, should see the "Garmin data not available" message.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/performance/page.tsx"
git commit -m "feat: add /performance page (VO2max chart, HRV, readiness, race predictions, training load)"
```

---

### Task 13: Activities Page

**Files:**
- Create: `components/ActivityFeed.tsx`
- Create: `app/(dashboard)/activities/page.tsx`

- [ ] **Step 1: Create `components/ActivityFeed.tsx`**

```typescript
'use client'

import { useState } from 'react'
import type { Workout } from '@/lib/supabase'

const ACTIVITY_ICONS: Record<string, string> = {
  running: '🏃', rowing: '🚣', cycling: '🚴', swimming: '🏊',
  hiking: '⛰️', weights: '🏋️', gym_upper: '💪', gym_lower: '🦵',
  yoga: '🧘', pilates: '🧘', crossfit: '⚡', tennis: '🎾',
  soccer: '⚽', boxing: '🥊', basketball: '🏀', volleyball: '🏐',
  climbing: '🧗', other: '🏅',
}

type Filter = 'all' | 'run' | 'strength' | 'cycling' | 'other'

function matchesFilter(w: Workout, filter: Filter): boolean {
  if (filter === 'all') return true
  if (filter === 'run') return w.activity_type === 'running'
  if (filter === 'cycling') return w.activity_type === 'cycling'
  if (filter === 'strength') {
    return ['weights', 'gym_upper', 'gym_lower', 'crossfit', 'boxing'].includes(w.activity_type)
  }
  return !['running', 'cycling', 'weights', 'gym_upper', 'gym_lower', 'crossfit', 'boxing'].includes(w.activity_type)
}

interface ActivityFeedProps {
  workouts: Workout[]
}

export function ActivityFeed({ workouts }: ActivityFeedProps) {
  const [filter, setFilter] = useState<Filter>('all')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  const filters: { key: Filter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'run', label: 'Run' },
    { key: 'cycling', label: 'Cycling' },
    { key: 'strength', label: 'Strength' },
    { key: 'other', label: 'Other' },
  ]

  const filtered = workouts.filter(w => matchesFilter(w, filter))

  return (
    <div>
      <div className="flex gap-2 mb-4 flex-wrap">
        {filters.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors ${
              filter === key
                ? 'bg-zinc-100 text-zinc-900'
                : 'bg-zinc-800 text-zinc-400 hover:bg-zinc-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {filtered.length === 0 && (
          <p className="text-zinc-500 text-sm py-4">No activities found.</p>
        )}
        {filtered.map(workout => {
          const isExpanded = expandedId === workout.id
          const hrZones = (workout.raw_data as Record<string, unknown>)?.hr_zones as
            Record<string, number> | undefined

          return (
            <div
              key={workout.id}
              className="rounded-xl border border-zinc-800 bg-zinc-900 overflow-hidden"
            >
              <button
                className="w-full flex items-center gap-3 p-4 text-left hover:bg-zinc-800/50 transition-colors"
                onClick={() => setExpandedId(isExpanded ? null : workout.id)}
              >
                <span className="text-xl shrink-0">
                  {ACTIVITY_ICONS[workout.activity_type] ?? '🏅'}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-zinc-200 truncate">
                    {workout.notes ?? workout.activity_type.replace(/_/g, ' ')}
                  </p>
                  <p className="text-xs text-zinc-500">{workout.date}</p>
                </div>
                <div className="flex gap-4 text-xs text-zinc-400 shrink-0">
                  {workout.distance_km != null && (
                    <span>{workout.distance_km} km</span>
                  )}
                  <span>{workout.duration_min} min</span>
                  {workout.avg_hr != null && (
                    <span>{workout.avg_hr} bpm</span>
                  )}
                </div>
                <span className="text-zinc-600 text-xs ml-2">
                  {isExpanded ? '▲' : '▼'}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 border-t border-zinc-800 pt-3">
                  {hrZones ? (
                    <div className="mb-2">
                      <p className="text-xs text-zinc-500 mb-1">HR Zones</p>
                      <div className="flex gap-3 flex-wrap">
                        {Object.entries(hrZones).map(([zone, pct]) => (
                          <div key={zone} className="text-center">
                            <div className="text-xs font-mono text-zinc-300">{pct}%</div>
                            <div className="text-xs text-zinc-500">{zone}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {workout.notes ? (
                    <p className="text-xs text-zinc-400">{workout.notes}</p>
                  ) : !hrZones ? (
                    <p className="text-xs text-zinc-600">No additional details</p>
                  ) : null}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/activities/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getWorkoutsForRange } from '@/lib/queries'
import { addDays } from '@/lib/utils'
import { ActivityFeed } from '@/components/ActivityFeed'

export default async function ActivitiesPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const since = addDays(new Date(), -90)
  const workouts = await getWorkoutsForRange(since, new Date(), session.user.id)
  const recent = workouts.slice(0, 20)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-6">Activities</h1>
      <ActivityFeed workouts={recent} />
    </div>
  )
}
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 4: Test in browser**

Visit `http://localhost:3000/activities`. Should show last 20 workouts from the `workouts` table (Strava data). Filter chips should work. Clicking a row should expand/collapse.

- [ ] **Step 5: Commit**

```bash
git add components/ActivityFeed.tsx "app/(dashboard)/activities/page.tsx"
git commit -m "feat: add /activities page with filterable, expandable activity feed"
```

---

## Phase 5 — Navigation

### Task 14: Add Nav Links

**Files:**
- Modify: `app/(dashboard)/layout.tsx`

- [ ] **Step 1: Update `app/(dashboard)/layout.tsx`**

Replace the entire file with:

```typescript
import Link from 'next/link'
import { Activity, BarChart2, Heart, List, Map, Zap } from 'lucide-react'
import { auth } from '@/auth'
import { SignOutButton } from '@/components/SignOutButton'

const GARMIN_USER_ID = 'pedro'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  const isGarminUser = session?.user?.id === GARMIN_USER_ID

  const navItems = [
    { href: '/',             label: 'Overview',     icon: Activity },
    { href: '/running',      label: 'Running',      icon: Map },
    { href: '/nutrition',    label: 'Nutrition',    icon: Heart },
    { href: '/consistency',  label: 'Consistency',  icon: BarChart2 },
    { href: '/activities',   label: 'Activities',   icon: List },
    ...(isGarminUser ? [{ href: '/performance', label: 'Performance', icon: Zap }] : []),
  ]

  return (
    <div className="flex min-h-screen">
      {/* Sidebar — desktop */}
      <aside className="hidden md:flex flex-col w-56 border-r border-zinc-800 p-4 gap-1">
        <div className="px-2 py-4 mb-2">
          <h1 className="text-sm font-semibold text-zinc-400 uppercase tracking-wider">Fitness</h1>
        </div>
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-zinc-50 hover:bg-zinc-800 transition-colors"
          >
            <Icon size={16} />
            {label}
          </Link>
        ))}

        <div className="mt-auto pt-4 border-t border-zinc-800">
          <p className="text-xs text-zinc-500 px-3 mb-2 truncate">{session?.user?.name}</p>
          <SignOutButton />
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 pb-24 md:pb-0">
        {children}
      </main>

      {/* Bottom tabs — mobile */}
      <nav className="fixed bottom-0 left-0 right-0 md:hidden border-t border-zinc-800 bg-zinc-900 flex pb-[env(safe-area-inset-bottom)]">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className="flex-1 flex flex-col items-center gap-1 py-3 text-xs text-zinc-400 hover:text-zinc-50"
          >
            <Icon size={20} />
            {label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 3: Verify in browser**

Sidebar should now show Activities for all users, and Performance only for Pedro. Bottom tabs should match.

> Note: with 6 nav items, the bottom mobile tabs will be narrow. If they feel too cramped, remove "Consistency" from mobile tabs (keep in sidebar only) — but try it first.

- [ ] **Step 4: Commit**

```bash
git add "app/(dashboard)/layout.tsx"
git commit -m "feat: add Activities and Performance nav links (Performance visible to Pedro only)"
```

---

## Phase 6 — Stretch: Insights Page

### Task 15: Insights Page

**Files:**
- Create: `components/InsightsChart.tsx`
- Create: `app/(dashboard)/insights/page.tsx`

- [ ] **Step 1: Create `components/InsightsChart.tsx`**

```typescript
'use client'

import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend,
} from 'recharts'
import type { GarminDailySnapshot, GarminPerformance } from '@/lib/supabase'
import type { DailyNutritionSummary } from '@/lib/queries'

interface InsightsChartProps {
  dailyNutrition: DailyNutritionSummary[]
  snapshots: GarminDailySnapshot[]
  performance: GarminPerformance[]
}

export function InsightsChart({ dailyNutrition, snapshots, performance }: InsightsChartProps) {
  // Build date-keyed maps
  const nutritionByDate = Object.fromEntries(dailyNutrition.map(d => [d.date, d]))
  const snapshotByDate = Object.fromEntries(snapshots.map(s => [s.date, s]))
  const perfByDate = Object.fromEntries(performance.map(p => [p.date, p]))

  // Collect all dates from snapshots (14-day window)
  const dates = snapshots.map(s => s.date).slice(-14)

  const proteinData = dates.map(date => {
    const nextDay = new Date(date)
    nextDay.setDate(nextDay.getDate() + 1)
    const nextDateStr = nextDay.toISOString().split('T')[0]
    return {
      date: date.slice(5),
      protein: nutritionByDate[date]?.protein ?? null,
      nextDayReadiness: perfByDate[nextDateStr]?.training_readiness ?? null,
    }
  }).filter(d => d.protein !== null || d.nextDayReadiness !== null)

  const calorieData = dates.map(date => ({
    date: date.slice(5),
    calories: nutritionByDate[date]?.calories ?? null,
    bodyBattery: snapshotByDate[date]?.body_battery_end ?? null,
  })).filter(d => d.calories !== null || d.bodyBattery !== null)

  const tooltipStyle = {
    contentStyle: { background: '#18181b', border: '1px solid #3f3f46', borderRadius: 8 },
    labelStyle: { color: '#a1a1aa' },
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Protein intake vs next-day training readiness
        </h2>
        {proteinData.length === 0 ? (
          <p className="text-zinc-500 text-sm h-32 flex items-center justify-center">No data yet</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={proteinData}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
                <Bar yAxisId="left" dataKey="protein" name="Protein (g)" fill="#3b82f6" opacity={0.7} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="nextDayReadiness" name="Next-day Readiness" stroke="#22c55e" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="text-sm font-medium text-zinc-400 mb-4">
          Calories vs body battery
        </h2>
        {calorieData.length === 0 ? (
          <p className="text-zinc-500 text-sm h-32 flex items-center justify-center">No data yet</p>
        ) : (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={calorieData}>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="right" orientation="right" domain={[0, 100]} tick={{ fontSize: 11, fill: '#71717a' }} tickLine={false} axisLine={false} />
                <Tooltip {...tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#71717a' }} />
                <Bar yAxisId="left" dataKey="calories" name="Calories (kcal)" fill="#f59e0b" opacity={0.7} radius={[2, 2, 0, 0]} />
                <Line yAxisId="right" type="monotone" dataKey="bodyBattery" name="Body Battery" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create `app/(dashboard)/insights/page.tsx`**

```typescript
import { redirect } from 'next/navigation'
import { auth } from '@/auth'
import { getNutritionForRange, aggregateDailyNutrition } from '@/lib/queries'
import { getDailySnapshots, getPerformanceTrend } from '@/lib/garmin-queries'
import { addDays } from '@/lib/utils'
import { InsightsChart } from '@/components/InsightsChart'

const GARMIN_USER_ID = 'pedro'

export default async function InsightsPage() {
  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  if (session.user.id !== GARMIN_USER_ID) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-xl font-semibold mb-2">Insights</h1>
        <p className="text-zinc-500 text-sm">
          Insights require Garmin data — not available for this account.
        </p>
      </div>
    )
  }

  const since = addDays(new Date(), -15)
  const [nutritionEntries, snapshots, perfTrend] = await Promise.all([
    getNutritionForRange(since, new Date(), GARMIN_USER_ID),
    getDailySnapshots(GARMIN_USER_ID, 15),
    getPerformanceTrend(GARMIN_USER_ID, 15),
  ])

  const dailyNutrition = aggregateDailyNutrition(nutritionEntries)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-xl font-semibold mb-1">Insights</h1>
      <p className="text-sm text-zinc-500 mb-6">14-day nutrition × training correlation</p>
      <InsightsChart
        dailyNutrition={dailyNutrition}
        snapshots={snapshots}
        performance={perfTrend}
      />
    </div>
  )
}
```

- [ ] **Step 3: Add Insights to nav (optional)**

If desired, add to `navItems` in `app/(dashboard)/layout.tsx`:

```typescript
...(isGarminUser ? [
  { href: '/performance', label: 'Performance', icon: Zap },
  { href: '/insights',    label: 'Insights',    icon: TrendingUp },
] : []),
```

Import `TrendingUp` from `lucide-react`.

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

- [ ] **Step 5: Commit**

```bash
git add components/InsightsChart.tsx "app/(dashboard)/insights/page.tsx"
git commit -m "feat: add /insights page with nutrition × training correlation charts (stretch)"
```

---

## Phase 7 — Final Steps

### Task 16: First Sync + MCP Setup

- [ ] **Step 1: Add env vars to Vercel**

In Vercel dashboard → Project → Settings → Environment Variables, add:
- `GARMIN_EMAIL`
- `GARMIN_PASSWORD`
- `GITHUB_TOKEN`
- `GITHUB_REPO` = `padelabarra/fitness-tracker`

- [ ] **Step 2: Run a manual Garmin backfill locally**

```bash
/opt/anaconda3/bin/python3 ingestion/garmin_biometrics_sync.py --backfill 30
```

Expected output: logs for each date, "✓ Upserted snapshot" and "✓ Upserted performance" for dates with data.

- [ ] **Step 3: Verify data in Supabase**

In Supabase SQL Editor, run:

```sql
SELECT date, steps, resting_hr, sleep_score, body_battery_end
FROM garmin_daily_snapshots
WHERE user_id = 'pedro'
ORDER BY date DESC
LIMIT 10;

SELECT date, vo2max, training_readiness, race_pred_marathon_sec
FROM garmin_performance
WHERE user_id = 'pedro'
ORDER BY date DESC
LIMIT 10;
```

Expected: rows populated with real data.

- [ ] **Step 4: Configure Garmin MCP for Claude sessions**

Run this once in your terminal (substituting real values):

```bash
claude mcp add garmin \
  -e GARMIN_EMAIL=$GARMIN_EMAIL \
  -e GARMIN_PASSWORD=$GARMIN_PASSWORD \
  -- npx -y @nicolasvegam/garmin-connect-mcp
```

After adding, restart Claude Code. Verify with: ask Claude "what was my body battery today?" — Claude should use `get_daily_summary` live.

- [ ] **Step 5: Update CLAUDE.md — remove "in-progress" markers**

In `CLAUDE.md`, remove all `_(in-progress)_` tags from the tables and sections that are now complete.

- [ ] **Step 6: Final build check**

```bash
npm run build
```

Expected: builds without errors.

- [ ] **Step 7: Final commit**

```bash
git add CLAUDE.md
git commit -m "docs: mark Garmin integration as complete, remove in-progress tags"
```

---

## Spec Coverage Check

| Spec section | Covered by task(s) |
|---|---|
| Garmin MCP setup | Task 16 |
| garmin_daily_snapshots table | Task 1 |
| garmin_performance table | Task 1 |
| Python sync script + CLI flags | Task 5 |
| garminconnect library | Task 5 |
| Error handling / partial data | Task 5 (try/except per-source) |
| GitHub Actions cron + workflow_dispatch | Task 6 |
| GH Secrets | Task 6, Step 2 |
| Trigger sync API route | Task 7 |
| BiometricsCard (steps, HR, battery, sleep) | Task 8 |
| Manual sync button + last synced | Task 8 |
| WeeklySummaryWidget | Task 9 |
| Overview page additions | Task 10 |
| VO2MaxChart | Task 11 |
| TrainingReadinessBadge | Task 11 |
| HRVWidget + trend arrow | Task 11 |
| RacePredictionsTable | Task 11 |
| TrainingLoadBar | Task 11 |
| /performance page | Task 12 |
| /activities page + filter chips | Task 13 |
| Click-to-expand HR zones | Task 13 |
| Navigation links | Task 14 |
| Renatta empty states | Tasks 10, 12, 13, 15 |
| /insights stretch page | Task 15 |
| Env var separation | Tasks 7, 16 |
| CLAUDE.md update | Task 16 |
