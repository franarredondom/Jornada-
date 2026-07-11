CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE overtime_kind AS ENUM ('normal', 'holiday');

CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  monthly_salary NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (monthly_salary >= 0),
  weekly_hours NUMERIC(4,1) NOT NULL DEFAULT 42 CHECK (weekly_hours > 0 AND weekly_hours <= 60),
  timezone TEXT NOT NULL DEFAULT 'America/Santiago',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_days (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  work_date DATE NOT NULL,
  check_in TIME NOT NULL,
  check_out TIME NOT NULL,
  break_minutes SMALLINT NOT NULL DEFAULT 0 CHECK (break_minutes BETWEEN 0 AND 720),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, work_date),
  CONSTRAINT valid_shift CHECK (check_out > check_in)
);

CREATE TABLE overtime_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  work_day_id UUID NOT NULL REFERENCES work_days(id) ON DELETE CASCADE,
  starts_at TIME NOT NULL,
  ends_at TIME NOT NULL,
  kind overtime_kind NOT NULL,
  reason TEXT NOT NULL CHECK (char_length(reason) BETWEEN 1 AND 500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT valid_overtime CHECK (ends_at > starts_at)
);

CREATE INDEX work_days_user_date_idx ON work_days(user_id, work_date DESC);
CREATE INDEX overtime_entries_day_idx ON overtime_entries(work_day_id);
