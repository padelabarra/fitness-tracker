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

load_dotenv(dotenv_path='.env.local', override=True)
load_dotenv()  # fallback to .env
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
