#!/usr/bin/env python3
"""
Strava → Supabase ingestion script.

Usage:
  python strava_sync.py           # incremental: last 2 days
  python strava_sync.py --full    # backfill: last 90 days
"""

import argparse
import os
import time
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
STRAVA_ACTIVITY_URL   = "https://www.strava.com/api/v3/activities/{id}"

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


def fetch_detailed_activity(access_token: str, activity_id: int) -> dict:
    """Fetch DetailedActivity — has calories + full HR fields."""
    resp = requests.get(
        STRAVA_ACTIVITY_URL.format(id=activity_id),
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=30,
    )
    resp.raise_for_status()
    return resp.json()


def build_workout_row(activity: dict) -> dict:
    """Transform a Strava DetailedActivity dict into a DB-ready row."""
    start_dt = datetime.fromisoformat(activity["start_date_local"].replace("Z", "+00:00"))
    date_str  = start_dt.strftime("%Y-%m-%d")

    distance_km  = (activity.get("distance") or 0) / 1000
    duration_min = round((activity.get("moving_time") or 0) / 60)
    avg_hr       = activity.get("average_heartrate")
    max_hr       = activity.get("max_heartrate")
    # DetailedActivity has calories directly — accurate for all sport types
    calories = round(activity["calories"]) if activity.get("calories") else None

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
        "source":            "strava",
        "strava_activity_id": activity["id"],
        "raw_data":           {"activity_id": str(activity["id"])},
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
    print(f"[strava_sync] {len(activities)} activities retrieved — fetching details...")

    if not activities:
        write_last_sync()
        return

    # Fetch DetailedActivity for each (has calories + full HR)
    detailed = []
    for i, a in enumerate(activities):
        detail = fetch_detailed_activity(access_token, a["id"])
        detailed.append(detail)
        if (i + 1) % 10 == 0:
            print(f"[strava_sync]   {i + 1}/{len(activities)} fetched")
        time.sleep(0.3)  # stay well within rate limits (100 req/15min)

    rows = [build_workout_row(a) for a in detailed]

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
