#!/usr/bin/env python3
"""Garmin Connect → Supabase sync script.

Usage:
  python garmin_sync.py          # incremental (last 2 days)
  python garmin_sync.py --full   # backfill last 90 days
"""

import os
import sys
import logging
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

from dotenv import load_dotenv

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(levelname)s: %(message)s')
logger = logging.getLogger(__name__)

# --- Module-level constants (no env vars) ---
LAST_SYNC_FILE = Path(__file__).parent / 'last_sync.txt'
BACKFILL_DAYS = 90
INCREMENTAL_DAYS = 2


# --- Env-var helper (called at runtime, not at import) ---

def _require_env(name: str) -> str:
    """Read a required env var; raise RuntimeError if missing."""
    val = os.getenv(name)
    if not val:
        raise RuntimeError(f"Missing required env var: {name}")
    return val


# --- Pure functions (tested) ---

def map_activity_type(garmin_type: str) -> str:
    """Map Garmin activity type to our schema type."""
    mapping = {
        'running': 'running',
        'indoor_running': 'running',
        'trail_running': 'running',
        'rowing': 'rowing',
        'indoor_rowing': 'rowing',
        'strength_training': 'weights',
        'weight_training': 'weights',
        'functional_strength_training': 'weights',
        'hiking': 'hiking',
    }
    return mapping.get(garmin_type.lower(), 'other')


def calculate_hr_zone(avg_hr: Optional[int], user_max_hr: int) -> Optional[str]:
    """Compute Z1-Z5 training zone from avg_hr vs user's max HR."""
    if avg_hr is None:
        return None
    pct = avg_hr / user_max_hr
    if pct < 0.60:
        return 'Z1'
    elif pct < 0.70:
        return 'Z2'
    elif pct < 0.80:
        return 'Z3'
    elif pct < 0.90:
        return 'Z4'
    else:
        return 'Z5'


def format_last_sync_date(d: date) -> str:
    """Format date as ISO string for last_sync.txt."""
    return d.strftime('%Y-%m-%d')


# --- Sync state ---

def read_last_sync() -> Optional[date]:
    """Read last sync date from file. Returns None if file missing (→ full backfill)."""
    if not LAST_SYNC_FILE.exists():
        return None
    content = LAST_SYNC_FILE.read_text().strip()
    try:
        return datetime.strptime(content, '%Y-%m-%d').date()
    except ValueError:
        return None


def write_last_sync(d: date) -> None:
    LAST_SYNC_FILE.write_text(format_last_sync_date(d))


# --- Garmin helpers ---

def build_workout_row(activity: dict, user_max_hr: int) -> dict:
    """Convert a Garmin activity dict to a workouts table row."""
    avg_hr = activity.get('averageHR') or activity.get('avgHr')
    max_hr_val = activity.get('maxHR') or activity.get('maxHr')
    duration_secs = activity.get('duration') or activity.get('movingDuration', 0)
    distance_m = activity.get('distance')
    garmin_type = (activity.get('activityType', {}) or {}).get('typeKey', 'other')

    return {
        'user_id': 'default',
        'date': activity.get('startTimeLocal', '')[:10],
        'activity_type': map_activity_type(garmin_type),
        'duration_min': round(duration_secs / 60) if duration_secs else 0,
        'distance_km': round(distance_m / 1000, 2) if distance_m else None,
        'avg_hr': int(avg_hr) if avg_hr else None,
        'max_hr': int(max_hr_val) if max_hr_val else None,
        'calories': activity.get('calories'),
        'training_zone': calculate_hr_zone(int(avg_hr) if avg_hr else None, user_max_hr),
        'source': 'garmin',
        'raw_data': {'activity_id': str(activity.get('activityId', ''))},
    }


# --- Main sync ---

def sync(full: bool = False) -> None:
    # Read env vars at runtime (not at import time)
    garmin_email = _require_env('GARMIN_EMAIL')
    garmin_password = _require_env('GARMIN_PASSWORD')
    supabase_url = _require_env('SUPABASE_URL')
    supabase_key = _require_env('SUPABASE_ANON_KEY')
    user_max_hr = int(os.getenv('USER_MAX_HR') or 0) or (220 - int(os.getenv('USER_AGE', '32')))

    last_sync = read_last_sync()
    is_backfill = full or last_sync is None

    if is_backfill:
        start_date = date.today() - timedelta(days=BACKFILL_DAYS)
        logger.info(f'Running full backfill from {start_date}')
    else:
        start_date = date.today() - timedelta(days=INCREMENTAL_DAYS)
        logger.info(f'Incremental sync from {start_date} (last sync: {last_sync})')

    # Auth with Garmin (imported here to avoid top-level import errors in test env)
    import garminconnect
    from supabase import create_client, Client

    garmin = garminconnect.Garmin(garmin_email, garmin_password)
    garmin.login()

    # Fetch activities
    activities = garmin.get_activities_by_date(
        start_date.isoformat(),
        date.today().isoformat()
    )
    logger.info(f'Fetched {len(activities)} activities from Garmin')

    # Upsert to Supabase
    sb: Client = create_client(supabase_url, supabase_key)

    new_count = 0

    for activity in activities:
        row = build_workout_row(activity, user_max_hr)
        if not row['date']:
            continue

        result = sb.table('workouts').upsert(
            row,
            on_conflict='garmin_activity_id'
        ).execute()

        if result.data:
            new_count += 1

    write_last_sync(date.today())
    logger.info(f'Synced {len(activities)} activities. ~{new_count} new.')


if __name__ == '__main__':
    full_run = '--full' in sys.argv
    sync(full=full_run)
