import sys
sys.path.insert(0, '..')

import os
os.environ.setdefault("STRAVA_CLIENT_ID", "test")
os.environ.setdefault("STRAVA_CLIENT_SECRET", "test")
os.environ.setdefault("STRAVA_REFRESH_TOKEN", "test")
os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_ANON_KEY", "test")
os.environ.setdefault("USER_MAX_HR", "190")

import pytest
from strava_sync import map_activity_type, calculate_hr_zone


class TestMapActivityType:
    def test_run_becomes_running(self):
        assert map_activity_type('Run') == 'running'

    def test_trail_run_becomes_running(self):
        assert map_activity_type('TrailRun') == 'running'

    def test_virtual_run_becomes_running(self):
        assert map_activity_type('VirtualRun') == 'running'

    def test_rowing_becomes_rowing(self):
        assert map_activity_type('Rowing') == 'rowing'

    def test_weight_training_becomes_weights(self):
        assert map_activity_type('WeightTraining') == 'weights'

    def test_hike_becomes_hiking(self):
        assert map_activity_type('Hike') == 'hiking'

    def test_walk_becomes_hiking(self):
        assert map_activity_type('Walk') == 'hiking'

    def test_unknown_becomes_other(self):
        assert map_activity_type('Ride') == 'other'
        assert map_activity_type('Swim') == 'other'
        assert map_activity_type('UnknownSport') == 'other'


class TestCalculateHrZone:
    # USER_MAX_HR=190 set above via env var

    def test_z1_below_60_percent(self):
        # 60% of 190 = 114
        assert calculate_hr_zone(100) == 'Z1'

    def test_z2_60_to_70_percent(self):
        # 60-70% of 190 = 114-133
        assert calculate_hr_zone(120) == 'Z2'

    def test_z3_70_to_80_percent(self):
        # 70-80% of 190 = 133-152
        assert calculate_hr_zone(140) == 'Z3'

    def test_z4_80_to_90_percent(self):
        # 80-90% of 190 = 152-171
        assert calculate_hr_zone(160) == 'Z4'

    def test_z5_above_90_percent(self):
        # >90% of 190 = 171+
        assert calculate_hr_zone(180) == 'Z5'

    def test_none_avg_hr_returns_none(self):
        assert calculate_hr_zone(None) is None
