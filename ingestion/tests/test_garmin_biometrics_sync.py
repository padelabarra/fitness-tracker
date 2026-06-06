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
