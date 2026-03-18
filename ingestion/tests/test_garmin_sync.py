import sys
sys.path.insert(0, '..')

import pytest
from garmin_sync import map_activity_type, calculate_hr_zone, format_last_sync_date


class TestMapActivityType:
    def test_running_stays_running(self):
        assert map_activity_type('running') == 'running'

    def test_indoor_rowing_becomes_rowing(self):
        assert map_activity_type('indoor_rowing') == 'rowing'

    def test_strength_training_becomes_weights(self):
        assert map_activity_type('strength_training') == 'weights'

    def test_hiking_stays_hiking(self):
        assert map_activity_type('hiking') == 'hiking'

    def test_unknown_becomes_other(self):
        assert map_activity_type('cycling') == 'other'
        assert map_activity_type('yoga') == 'other'
        assert map_activity_type('unknown_sport') == 'other'


class TestCalculateHrZone:
    def test_z1_below_60_percent(self):
        # max_hr=190, 60% = 114
        assert calculate_hr_zone(100, 190) == 'Z1'

    def test_z2_60_to_70_percent(self):
        # 60-70% of 190 = 114-133
        assert calculate_hr_zone(120, 190) == 'Z2'

    def test_z3_70_to_80_percent(self):
        # 70-80% of 190 = 133-152
        assert calculate_hr_zone(140, 190) == 'Z3'

    def test_z4_80_to_90_percent(self):
        # 80-90% of 190 = 152-171
        assert calculate_hr_zone(160, 190) == 'Z4'

    def test_z5_above_90_percent(self):
        # >90% of 190 = 171+
        assert calculate_hr_zone(180, 190) == 'Z5'

    def test_none_avg_hr_returns_none(self):
        assert calculate_hr_zone(None, 190) is None


class TestFormatLastSyncDate:
    def test_returns_iso_date_string(self):
        from datetime import date
        d = date(2026, 3, 15)
        assert format_last_sync_date(d) == '2026-03-15'
