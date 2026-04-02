-- workouts table
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  date DATE NOT NULL,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('running','rowing','gym_upper','gym_lower','hiking','weights','cycling','swimming','tennis','soccer','boxing','basketball','volleyball','yoga','pilates','crossfit','climbing','other')),
  duration_min INTEGER NOT NULL,
  distance_km NUMERIC,
  avg_hr INTEGER,
  max_hr INTEGER,
  calories INTEGER,
  training_zone TEXT CHECK (training_zone IN ('Z1','Z2','Z3','Z4','Z5')),
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'strava' CHECK (source IN ('garmin','strava','manual')),
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Generated columns for dedup (garmin = historical, strava = new)
ALTER TABLE workouts
  ADD COLUMN garmin_activity_id TEXT GENERATED ALWAYS AS (raw_data->>'activity_id') STORED;

ALTER TABLE workouts
  ADD COLUMN strava_activity_id BIGINT
    GENERATED ALWAYS AS ((raw_data->>'activity_id')::BIGINT) STORED;

-- nutrition table
CREATE TABLE nutrition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL DEFAULT 'default',
  date DATE NOT NULL,
  meal_type TEXT NOT NULL CHECK (meal_type IN ('breakfast','lunch','dinner','snack','supplement')),
  food_description TEXT NOT NULL,
  calories_approx INTEGER,
  protein_g NUMERIC,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('telegram','manual','photo')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX workouts_date_idx ON workouts(date);
CREATE INDEX workouts_user_date_idx ON workouts(user_id, date);
CREATE INDEX nutrition_date_idx ON nutrition(date);
CREATE INDEX nutrition_user_date_idx ON nutrition(user_id, date);

-- Dedup indexes
CREATE UNIQUE INDEX workouts_garmin_activity_idx
  ON workouts(garmin_activity_id)
  WHERE garmin_activity_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS workouts_strava_activity_id_unique
  ON workouts (strava_activity_id)
  WHERE strava_activity_id IS NOT NULL;
